// Showdown evaluation for every terminal-showdown node of a street at once —
// the WASM + SIMD counterpart of lib/postflopSolver/showdownBatch.ts, with the
// same definitions: blocked pairs carry equity 0 and drop out of the weight
// total through per-card sums (inclusion–exclusion), and a row with no live
// opponent weight scores 0.5.
//
// The context owns every buffer, so the TypeScript side (lib/postflopSolver/
// wasm/wasmShowdown.ts) fills them once through the pointer getters, writes
// reach into them each iteration, calls sd_evaluate, and reads equities back.
// Reach is handed over as f64 (what the CFR loop produces) and narrowed to f32
// here: the dot products run four f32 lanes at a time, accumulated in f32
// (equities differ from the f64 TypeScript kernel by ~1e-7).
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <wasm_simd128.h>

namespace {

constexpr int kDeckSize = 52;

/** One player's side: their rows against the opponent's columns. */
struct Side {
  int rows = 0;
  int cols = 0;
  float* equity = nullptr;        // [row * cols + col], blocked pairs 0
  uint8_t* rowCards = nullptr;    // [row * 2], [row * 2 + 1]
  uint8_t* colCards = nullptr;    // [col * 2], [col * 2 + 1]
  int32_t* rowSameCol = nullptr;  // opponent column holding exactly this row's two cards, or -1
  double* opponentReach = nullptr;  // [node * cols + col], written by the caller
  float* opponentReachF32 = nullptr;
  double* total = nullptr;   // [node]
  double* byCard = nullptr;  // [node * 52 + card]
  double* out = nullptr;     // [node * rows + row], read by the caller
};

struct Context {
  int nodeCount = 0;
  Side hero;     // hero rows vs villain reach
  Side villain;  // villain rows vs hero reach
};

template <typename T>
T* allocate(size_t count) {
  return static_cast<T*>(std::calloc(count, sizeof(T)));
}

void initSide(Side& side, int rows, int cols, int nodeCount) {
  side.rows = rows;
  side.cols = cols;
  side.equity = allocate<float>(static_cast<size_t>(rows) * cols);
  side.rowCards = allocate<uint8_t>(static_cast<size_t>(rows) * 2);
  side.colCards = allocate<uint8_t>(static_cast<size_t>(cols) * 2);
  side.rowSameCol = allocate<int32_t>(rows);
  side.opponentReach = allocate<double>(static_cast<size_t>(nodeCount) * cols);
  side.opponentReachF32 = allocate<float>(static_cast<size_t>(nodeCount) * cols);
  side.total = allocate<double>(nodeCount);
  side.byCard = allocate<double>(static_cast<size_t>(nodeCount) * kDeckSize);
  side.out = allocate<double>(static_cast<size_t>(nodeCount) * rows);
}

void freeSide(Side& side) {
  std::free(side.equity);
  std::free(side.rowCards);
  std::free(side.colCards);
  std::free(side.rowSameCol);
  std::free(side.opponentReach);
  std::free(side.opponentReachF32);
  std::free(side.total);
  std::free(side.byCard);
  std::free(side.out);
}

/** Per node: total opponent weight and the weight on each card; also the f32 copy of the reach. */
void cardWeights(Side& side, int nodeCount) {
  const int cols = side.cols;
  std::memset(side.byCard, 0, sizeof(double) * nodeCount * kDeckSize);
  for (int s = 0; s < nodeCount; s++) {
    const double* reach = side.opponentReach + static_cast<size_t>(s) * cols;
    float* reachF32 = side.opponentReachF32 + static_cast<size_t>(s) * cols;
    double* cards = side.byCard + s * kDeckSize;
    double sum = 0;
    for (int j = 0; j < cols; j++) {
      const double w = reach[j];
      reachF32[j] = static_cast<float>(w);
      sum += w;
      cards[side.colCards[j * 2]] += w;
      cards[side.colCards[j * 2 + 1]] += w;
    }
    side.total[s] = sum;
  }
}

/** Dot product of one equity row with one node's f32 reach: two 4-lane accumulators, scalar tail. */
inline double dot(const float* eq, const float* reach, int cols) {
  v128_t acc0 = wasm_f32x4_splat(0), acc1 = wasm_f32x4_splat(0);
  int col = 0;
  for (; col + 8 <= cols; col += 8) {
    acc0 = wasm_f32x4_add(acc0, wasm_f32x4_mul(wasm_v128_load(eq + col), wasm_v128_load(reach + col)));
    acc1 = wasm_f32x4_add(acc1, wasm_f32x4_mul(wasm_v128_load(eq + col + 4), wasm_v128_load(reach + col + 4)));
  }
  const v128_t acc = wasm_f32x4_add(acc0, acc1);
  double sum = static_cast<double>(wasm_f32x4_extract_lane(acc, 0)) + wasm_f32x4_extract_lane(acc, 1) +
               wasm_f32x4_extract_lane(acc, 2) + wasm_f32x4_extract_lane(acc, 3);
  for (; col < cols; col++) sum += eq[col] * reach[col];
  return sum;
}

void equities(Side& side, int nodeCount) {
  const int rows = side.rows, cols = side.cols;
  for (int row = 0; row < rows; row++) {
    const float* eq = side.equity + static_cast<size_t>(row) * cols;
    const int a = side.rowCards[row * 2], b = side.rowCards[row * 2 + 1], same = side.rowSameCol[row];
    for (int s = 0; s < nodeCount; s++) {
      const size_t offset = static_cast<size_t>(s) * cols;
      const double num = dot(eq, side.opponentReachF32 + offset, cols);
      const double* cards = side.byCard + s * kDeckSize;
      const double live = side.total[s] - cards[a] - cards[b] + (same >= 0 ? side.opponentReach[offset + same] : 0);
      // Subtraction can leave rounding dust where every opponent combo is blocked.
      side.out[static_cast<size_t>(s) * rows + row] = live > side.total[s] * 1e-12 ? num / live : 0.5;
    }
  }
}

}  // namespace

extern "C" {

Context* sd_create(int heroRows, int villainRows, int nodeCount) {
  auto* ctx = new Context();
  ctx->nodeCount = nodeCount;
  initSide(ctx->hero, heroRows, villainRows, nodeCount);
  initSide(ctx->villain, villainRows, heroRows, nodeCount);
  return ctx;
}

void sd_destroy(Context* ctx) {
  freeSide(ctx->hero);
  freeSide(ctx->villain);
  delete ctx;
}

// side: 0 = hero rows (vs villain reach), 1 = villain rows (vs hero reach).
float* sd_equity(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).equity; }
uint8_t* sd_row_cards(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).rowCards; }
uint8_t* sd_col_cards(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).colCards; }
int32_t* sd_row_same_col(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).rowSameCol; }
double* sd_opponent_reach(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).opponentReach; }
double* sd_out(Context* ctx, int side) { return (side ? ctx->villain : ctx->hero).out; }

void sd_evaluate(Context* ctx) {
  cardWeights(ctx->hero, ctx->nodeCount);
  cardWeights(ctx->villain, ctx->nodeCount);
  equities(ctx->hero, ctx->nodeCount);
  equities(ctx->villain, ctx->nodeCount);
}

}  // extern "C"
