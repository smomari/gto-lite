// Checks native/solver/showdown.cpp against a direct f64 reference that tests
// every pair for card overlap explicitly (no per-card-sum shortcut). Built by
// native/test-wasm.sh with AddressSanitizer + UBSan, so an out-of-bounds index
// fails here instead of silently corrupting a solve.
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

#include "test_util.h"

struct Context;
extern "C" {
Context* sd_create(int heroRows, int villainRows, int nodeCount);
void sd_destroy(Context* ctx);
float* sd_equity(Context* ctx, int side);
uint8_t* sd_row_cards(Context* ctx, int side);
uint8_t* sd_col_cards(Context* ctx, int side);
int32_t* sd_row_same_col(Context* ctx, int side);
double* sd_opponent_reach(Context* ctx, int side);
double* sd_out(Context* ctx, int side);
void sd_evaluate(Context* ctx);
}

namespace {

struct Combo {
  int a, b;
};

bool shares(const Combo& x, const Combo& y) { return x.a == y.a || x.a == y.b || x.b == y.a || x.b == y.b; }

/** Distinct random combos — a range never holds the same two cards twice, which the per-card-sum shortcut relies on. */
std::vector<Combo> randomCombos(Rng& rng, int count) {
  std::vector<Combo> combos;
  std::vector<bool> used(52 * 52, false);
  while (static_cast<int>(combos.size()) < count) {
    const int a = rng.below(52), b = rng.below(52);
    if (a == b || used[a * 52 + b]) continue;
    used[a * 52 + b] = used[b * 52 + a] = true;
    combos.push_back({a, b});
  }
  return combos;
}

/** Fills one side of the context and returns what the reference says it should output. */
std::vector<double> fillSide(Context* ctx, int side, const std::vector<Combo>& rows, const std::vector<Combo>& cols,
                             const std::vector<double>& equity, const std::vector<double>& opponentReach,
                             int nodeCount) {
  const int r = static_cast<int>(rows.size()), c = static_cast<int>(cols.size());
  float* eq = sd_equity(ctx, side);
  uint8_t* rowCards = sd_row_cards(ctx, side);
  uint8_t* colCards = sd_col_cards(ctx, side);
  int32_t* rowSameCol = sd_row_same_col(ctx, side);
  double* reach = sd_opponent_reach(ctx, side);
  for (int i = 0; i < r; i++) {
    rowCards[i * 2] = static_cast<uint8_t>(rows[i].a);
    rowCards[i * 2 + 1] = static_cast<uint8_t>(rows[i].b);
    rowSameCol[i] = -1;
    for (int j = 0; j < c; j++) {
      const bool sameCards = (rows[i].a == cols[j].a && rows[i].b == cols[j].b) ||
                             (rows[i].a == cols[j].b && rows[i].b == cols[j].a);
      if (sameCards) rowSameCol[i] = j;
      eq[i * c + j] = shares(rows[i], cols[j]) ? 0.0f : static_cast<float>(equity[i * c + j]);
    }
  }
  for (int j = 0; j < c; j++) {
    colCards[j * 2] = static_cast<uint8_t>(cols[j].a);
    colCards[j * 2 + 1] = static_cast<uint8_t>(cols[j].b);
  }
  for (size_t k = 0; k < opponentReach.size(); k++) reach[k] = opponentReach[k];

  std::vector<double> expected(static_cast<size_t>(nodeCount) * r);
  for (int s = 0; s < nodeCount; s++) {
    for (int i = 0; i < r; i++) {
      double num = 0, den = 0;
      for (int j = 0; j < c; j++) {
        if (shares(rows[i], cols[j])) continue;
        const double w = opponentReach[static_cast<size_t>(s) * c + j];
        num += static_cast<float>(equity[i * c + j]) * w;
        den += w;
      }
      expected[static_cast<size_t>(s) * r + i] = den > 0 ? num / den : 0.5;
    }
  }
  return expected;
}

void checkCase(const char* name, int heroCount, int villainCount, int nodeCount, uint32_t seed, bool blockRowZero) {
  Rng rng(seed);
  std::vector<Combo> hero = randomCombos(rng, heroCount);
  std::vector<Combo> villain = randomCombos(rng, villainCount);
  if (blockRowZero) {
    // Every villain combo shares a card with hero combo 0, so that row has no live opponent weight → 0.5.
    hero[0] = {0, 1};
    for (int j = 0; j < villainCount; j++) villain[j] = {j % 2, 2 + j / 2};  // distinct, each holds card 0 or 1
  }
  std::vector<double> heroEquity(static_cast<size_t>(heroCount) * villainCount);
  for (auto& e : heroEquity) e = rng.unit();
  std::vector<double> villainEquity(heroEquity.size());
  for (int i = 0; i < heroCount; i++)
    for (int j = 0; j < villainCount; j++) villainEquity[j * heroCount + i] = 1 - heroEquity[i * villainCount + j];
  // Uneven reach with exact zeros, so slicing or tail mistakes can't hide.
  std::vector<double> heroReach(static_cast<size_t>(nodeCount) * heroCount), villainReach(static_cast<size_t>(nodeCount) * villainCount);
  for (auto& w : heroReach) w = rng.below(5) == 0 ? 0 : rng.unit();
  for (auto& w : villainReach) w = rng.below(5) == 0 ? 0 : rng.unit();

  Context* ctx = sd_create(heroCount, villainCount, nodeCount);
  const auto expectedHero = fillSide(ctx, 0, hero, villain, heroEquity, villainReach, nodeCount);
  const auto expectedVillain = fillSide(ctx, 1, villain, hero, villainEquity, heroReach, nodeCount);
  sd_evaluate(ctx);

  double maxDiff = 0;
  const double* heroOut = sd_out(ctx, 0);
  const double* villainOut = sd_out(ctx, 1);
  for (size_t k = 0; k < expectedHero.size(); k++) maxDiff = std::fmax(maxDiff, std::fabs(heroOut[k] - expectedHero[k]));
  for (size_t k = 0; k < expectedVillain.size(); k++) maxDiff = std::fmax(maxDiff, std::fabs(villainOut[k] - expectedVillain[k]));
  // f32 reach and f32 accumulation over a few hundred terms: ~1e-7 in practice.
  CHECK(maxDiff < 2e-5, "%s: max |diff| %.3g vs reference", name, maxDiff);
  if (blockRowZero) {
    for (int s = 0; s < nodeCount; s++) CHECK(heroOut[s * heroCount] == 0.5, "%s: fully blocked row should be 0.5", name);
  }
  sd_destroy(ctx);
  std::printf("  %-28s max |diff| %.2e\n", name, maxDiff);
}

}  // namespace

int main() {
  // Column counts around the 8-wide SIMD step exercise the scalar tail.
  checkCase("1 column", 3, 1, 2, 1, false);
  checkCase("7 columns", 5, 7, 3, 2, false);
  checkCase("8 columns", 5, 8, 3, 3, false);
  checkCase("9 columns", 6, 9, 1, 4, false);
  checkCase("bench-sized 265x370x15", 265, 370, 15, 5, false);
  checkCase("fully blocked row", 4, 20, 4, 6, true);
  return testResult();
}
