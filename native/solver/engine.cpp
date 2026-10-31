// Range-vector DCFR over a whole (possibly multi-street) postflop tree — the
// C++ core behind lib/postflopSolver/wasm/engine.ts.
//
// Values are standard counterfactual values, NOT normalized per combo: a
// combo's value at a node is Σ over compatible opponent combos of (opponent
// reach × payoff). Opponent decisions therefore just sum their children (the
// split of the opponent's reach is already in each child), so card removal on
// the opponent's action frequencies is exact — the TypeScript engine's
// range-average shortcut is not needed. Chance nodes (turn/river cards) zero
// both players' combos that hold the dealt card and add the children weighted
// by the card's probability.
//
// The tree arrives flattened (lib/postflopSolver/flattenTree.ts). Terminal
// showdowns are valued either from an equity table (a board with cards still to
// come: checkdown leaves, all-ins) or from river hand strengths in O(n) after
// a one-time sort. DCFR constants match lib/postflopSolver/cfr.ts: α = 1.5,
// β = 0 (negative regret × 0.5), γ = 3, average strategy reset at 4, 16, 64, …
// Unlike cfr.ts, updates alternate: each iteration traverses for P1, then for
// P2 against P1's updated regrets. On a BTN-vs-BB flop that took 4× fewer
// iterations than updating both at once, each costing about the same.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <numeric>
#include <vector>
#include <wasm_simd128.h>
#ifdef __EMSCRIPTEN_PTHREADS__
#include <condition_variable>
#include <functional>
#include <mutex>
#include <thread>
#endif

namespace {

constexpr int kDeckSize = 52;
constexpr uint8_t kNoCard = 255;
constexpr double kAlpha = 1.5;
constexpr double kGamma = 3;
constexpr float kNegativeRegretDiscount = 0.5f;

enum NodeType : uint8_t {
  kDecisionP1 = 0,
  kDecisionP2 = 1,
  kFold = 2,           // aux = winner (0 = P1, 1 = P2)
  kShowdownTable = 3,  // aux = equity table id
  kShowdownRiver = 4,  // aux = river board id
  kChance = 5,         // children carry the dealt card and its weight; aux = 1 when they're a sample (see SampledDeal)
};

struct Player {
  int n = 0;
  std::vector<uint8_t> cards;   // [i * 2], [i * 2 + 1]
  std::vector<float> weights;   // initial reach
  std::vector<int32_t> sameOpp;  // opponent combo holding exactly the same two cards, or -1
  std::vector<std::vector<int32_t>> withCard = std::vector<std::vector<int32_t>>(kDeckSize);
};

struct EquityTable {
  std::vector<float> rows[2];  // [player][row * opponentCount + col], player's equity, blocked pairs 0
};

struct RiverBoard {
  std::vector<uint32_t> strength[2];  // bigger is better
  std::vector<int32_t> ascending[2];  // combo indices sorted by strength
};

/** Bump allocator for per-node scratch; sized up front from the tree, so pointers never move. */
struct Arena {
  std::vector<float> data;
  size_t top = 0;
  float* take(size_t count) {
    float* p = data.data() + top;
    top += count;
    return p;
  }
};

/**
 * A trunk/leaf split of one tree, for solving it across threads (see Pool).
 * Leaves are the children of the chance nodes that end the root street; the
 * trunk is everything above them. Every iteration the trunk runs on the
 * calling thread, and leaves trade reach and values with it through the
 * exchange buffers, one `width` = n1 + n2 row per leaf.
 */
struct Split {
  bool active = false;
  std::vector<int32_t> leafNodes;    // leaf slot → node
  std::vector<int32_t> leafSlot;     // node → leaf slot, or -1
  std::vector<int32_t> leafOrder;    // slots, most regret storage (≈ work) first — the pool's queue order
  std::vector<int32_t> trunkIndex;   // node → trunk index, or -1
  std::vector<char> locked;          // per trunk node: plays lockedSigma, see eng_lock_strategy
  int trunkCount = 0;
  size_t trunkStorageEnd = 0;        // the trunk's regrets/averages are [0, trunkStorageEnd)
  std::vector<size_t> leafStorageBegin, leafStorageEnd;  // per leaf slot
  int width = 0;
  std::vector<float> exchangeIn, exchangeOut;  // [slot * width]
  // Per trunk node: this iteration's reaches and strategy (sigma offsets for decision nodes only).
  std::vector<float> reach;          // [trunk * width]: P1 reach then P2 reach
  std::vector<size_t> sigmaOffset;
  std::vector<float> sigma;
  std::vector<float> lockedSigma;    // same layout as sigma
  // The last evaluation: average-strategy reaches, and each player's EV-mode values.
  std::vector<float> evalReach;      // [trunk * width]
  std::vector<float> evalValues;     // [trunk * width]: P1 values then P2 values
};

/**
 * Threads that share a split solve's leaves (eng_set_threads). Each round the
 * calling thread publishes a task and works on it too; every thread pulls leaf
 * slots from one atomic counter, biggest leaves first, so a thread on a slow
 * core simply takes fewer — no fixed assignment to fall behind on. Without
 * pthreads (the single-threaded builds) there is only the calling thread.
 */
struct Pool {
  int threads = 1;  // including the calling thread
  std::vector<Arena> arenas;  // one per pool thread
  std::atomic<int> next{0};
#ifdef __EMSCRIPTEN_PTHREADS__
  std::vector<std::thread> workers;
  std::mutex mutex;
  std::condition_variable wake, finished;
  std::function<void()> task;
  int generation = 0;
  int done = 0;
  bool stopping = false;

  ~Pool() {
    {
      std::lock_guard<std::mutex> lock(mutex);
      stopping = true;
    }
    wake.notify_all();
    for (auto& worker : workers) worker.join();
  }
#endif
};

struct Engine {
  Split split;
  int nodeCount = 0;
  std::vector<uint8_t> type;
  std::vector<int32_t> childStart;
  std::vector<uint8_t> childCount;
  std::vector<float> pot, committed1, committed2;
  std::vector<int32_t> aux;
  std::vector<int32_t> children;
  std::vector<uint8_t> childCard;
  std::vector<float> childWeight;
  Player players[2];
  std::vector<size_t> storage;  // per decision node: offset into regret/stratSum ([action * n + combo])
  std::vector<float> regret, stratSum;
  std::vector<EquityTable> tables;
  std::vector<RiverBoard> boards;
  Arena arena;  // the calling thread's scratch; pool threads use their own (see arenaOf)
  Pool pool;    // declared last, so its threads stop before anything they use is destroyed
};

/** Pool threads point this at their own arena; the calling thread uses the engine's. */
thread_local Arena* threadArena = nullptr;
inline Arena& arenaOf(Engine& e) { return threadArena ? *threadArena : e.arena; }

/** Iteration-wide DCFR factors; null = evaluate only (no regret/average updates). */
struct Update {
  float positiveDiscount;
  float strategyWeight;
};

// ---------------------------------------------------------------- terminals

/** Opponent reach in total and per card, for "live" weight via inclusion–exclusion. */
struct CardSums {
  double total = 0;
  double byCard[kDeckSize] = {};
};

CardSums cardSums(const Player& opp, const float* reach) {
  CardSums s;
  for (int j = 0; j < opp.n; j++) {
    const double w = reach[j];
    s.total += w;
    s.byCard[opp.cards[j * 2]] += w;
    s.byCard[opp.cards[j * 2 + 1]] += w;
  }
  return s;
}

/** Opponent weight not sharing a card with `self`'s combo i. */
inline double live(const Player& self, int i, const CardSums& s, const float* oppReach) {
  const int same = self.sameOpp[i];
  return s.total - s.byCard[self.cards[i * 2]] - s.byCard[self.cards[i * 2 + 1]] + (same >= 0 ? oppReach[same] : 0);
}

void foldValues(const Engine& e, int node, int p, const float* oppReach, float* out) {
  const Player& self = e.players[p];
  const float committed = p == 0 ? e.committed1[node] : e.committed2[node];
  const float payoff = e.aux[node] == p ? e.pot[node] - committed : -committed;
  const CardSums s = cardSums(e.players[1 - p], oppReach);
  for (int i = 0; i < self.n; i++) out[i] = static_cast<float>(payoff * live(self, i, s, oppReach));
}

inline double dot(const float* a, const float* b, int n) {
  v128_t acc0 = wasm_f32x4_splat(0), acc1 = wasm_f32x4_splat(0);
  int k = 0;
  for (; k + 8 <= n; k += 8) {
    acc0 = wasm_f32x4_add(acc0, wasm_f32x4_mul(wasm_v128_load(a + k), wasm_v128_load(b + k)));
    acc1 = wasm_f32x4_add(acc1, wasm_f32x4_mul(wasm_v128_load(a + k + 4), wasm_v128_load(b + k + 4)));
  }
  const v128_t acc = wasm_f32x4_add(acc0, acc1);
  double sum = static_cast<double>(wasm_f32x4_extract_lane(acc, 0)) + wasm_f32x4_extract_lane(acc, 1) +
               wasm_f32x4_extract_lane(acc, 2) + wasm_f32x4_extract_lane(acc, 3);
  for (; k < n; k++) sum += a[k] * b[k];
  return sum;
}

void tableShowdownValues(const Engine& e, int node, int p, const float* oppReach, float* out) {
  const Player& self = e.players[p];
  const int oppCount = e.players[1 - p].n;
  const float* eq = e.tables[e.aux[node]].rows[p].data();
  const double pot = e.pot[node];
  const double committed = p == 0 ? e.committed1[node] : e.committed2[node];
  const CardSums s = cardSums(e.players[1 - p], oppReach);
  for (int i = 0; i < self.n; i++) {
    const double share = dot(eq + static_cast<size_t>(i) * oppCount, oppReach, oppCount);
    out[i] = static_cast<float>(pot * share - committed * live(self, i, s, oppReach));
  }
}

/**
 * River showdown in O(n): walk both players' combos in ascending strength. For
 * combo i, the opponent weight strictly below it (wins) and at or below it
 * (wins + ties) are running sums minus the weight on i's two cards. The one
 * opponent combo holding exactly i's cards has the same strength, so it never
 * appears in the strict sum and is added back once in the "at or below" sum.
 */
void riverShowdownValues(const Engine& e, int node, int p, const float* oppReach, float* out) {
  const Player& self = e.players[p];
  const Player& opp = e.players[1 - p];
  const RiverBoard& board = e.boards[e.aux[node]];
  const uint32_t* myStrength = board.strength[p].data();
  const uint32_t* oppStrength = board.strength[1 - p].data();
  const std::vector<int32_t>& myOrder = board.ascending[p];
  const std::vector<int32_t>& oppOrder = board.ascending[1 - p];
  const double pot = e.pot[node];
  const double committed = p == 0 ? e.committed1[node] : e.committed2[node];
  const CardSums all = cardSums(opp, oppReach);

  CardSums below, atOrBelow;
  int jBelow = 0, jAtOrBelow = 0;
  for (const int i : myOrder) {
    const uint32_t s = myStrength[i];
    while (jBelow < opp.n && oppStrength[oppOrder[jBelow]] < s) {
      const int j = oppOrder[jBelow++];
      below.total += oppReach[j];
      below.byCard[opp.cards[j * 2]] += oppReach[j];
      below.byCard[opp.cards[j * 2 + 1]] += oppReach[j];
    }
    while (jAtOrBelow < opp.n && oppStrength[oppOrder[jAtOrBelow]] <= s) {
      const int j = oppOrder[jAtOrBelow++];
      atOrBelow.total += oppReach[j];
      atOrBelow.byCard[opp.cards[j * 2]] += oppReach[j];
      atOrBelow.byCard[opp.cards[j * 2 + 1]] += oppReach[j];
    }
    const int a = self.cards[i * 2], b = self.cards[i * 2 + 1], same = self.sameOpp[i];
    const double wins = below.total - below.byCard[a] - below.byCard[b];
    const double winsAndTies =
        atOrBelow.total - atOrBelow.byCard[a] - atOrBelow.byCard[b] + (same >= 0 ? oppReach[same] : 0);
    const double liveWeight = all.total - all.byCard[a] - all.byCard[b] + (same >= 0 ? oppReach[same] : 0);
    out[i] = static_cast<float>(pot * 0.5 * (wins + winsAndTies) - committed * liveWeight);
  }
}

void terminalValues(const Engine& e, int node, int p, const float* oppReach, float* out) {
  switch (e.type[node]) {
    case kFold: return foldValues(e, node, p, oppReach, out);
    case kShowdownTable: return tableShowdownValues(e, node, p, oppReach, out);
    case kShowdownRiver: return riverShowdownValues(e, node, p, oppReach, out);
    default: return;
  }
}

// ---------------------------------------------------------------- strategies

/** Regret matching into `sigma` ([action * n + combo]). */
void regretMatch(const float* regret, int actions, int n, float* sigma, float* scratchSum) {
  std::fill(scratchSum, scratchSum + n, 0.0f);
  for (int a = 0; a < actions; a++) {
    const float* r = regret + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) scratchSum[i] += std::max(r[i], 0.0f);
  }
  const float uniform = 1.0f / actions;
  for (int a = 0; a < actions; a++) {
    const float* r = regret + static_cast<size_t>(a) * n;
    float* s = sigma + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) s[i] = scratchSum[i] > 0 ? std::max(r[i], 0.0f) / scratchSum[i] : uniform;
  }
}

/** Normalized average strategy ([action * n + combo]); uniform where nothing has accumulated. */
void averageStrategy(const float* sum, int actions, int n, float* sigma, float* scratchTotal) {
  std::fill(scratchTotal, scratchTotal + n, 0.0f);
  for (int a = 0; a < actions; a++) {
    const float* s = sum + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) scratchTotal[i] += s[i];
  }
  const float uniform = 1.0f / actions;
  for (int a = 0; a < actions; a++) {
    const float* s = sum + static_cast<size_t>(a) * n;
    float* out = sigma + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) out[i] = scratchTotal[i] > 0 ? s[i] / scratchTotal[i] : uniform;
  }
}

/** Zero the rows of player p that hold `card` (impossible once it's dealt). */
void zeroWithCard(const Player& p, uint8_t card, float* values) {
  for (const int32_t i : p.withCard[card]) values[i] = 0;
}

/**
 * A chance node dealing every card needs no correction: each pair of hands
 * leaves exactly the same number of cards, so the per-card weights are exact.
 * A sampled chance node (a few cards standing for runs of similar ones) is
 * different — a combo holding one of the sampled cards would lose that whole
 * run's weight. So each combo's weight is renormalized over the samples it
 * doesn't hold: `held[i]` = total weight minus the samples combo i holds. The
 * pair-level normalizer is approximated as a product, total / (heldₚ × heldₒ),
 * applied as opponent reach × total / heldₒ going in and own value / heldₚ
 * coming out (exact up to second order in the blocked weight).
 */
struct SampledDeal {
  float total = 0;
  float* held[2] = {nullptr, nullptr};
};

SampledDeal sampledDeal(Engine& e, int node) {
  SampledDeal deal;
  const int start = e.childStart[node], count = e.childCount[node];
  for (int c = 0; c < count; c++) deal.total += e.childWeight[start + c];
  for (int p = 0; p < 2; p++) {
    const Player& player = e.players[p];
    deal.held[p] = arenaOf(e).take(player.n);
    std::fill(deal.held[p], deal.held[p] + player.n, deal.total);
    for (int c = 0; c < count; c++)
      for (const int32_t i : player.withCard[e.childCard[start + c]]) deal.held[p][i] -= e.childWeight[start + c];
  }
  return deal;
}

/** Reach entering a sampled deal's children: scaled up for combos that hold some of the samples. */
inline void scaleReach(const SampledDeal& deal, int p, int n, float* reach) {
  for (int i = 0; i < n; i++) reach[i] = deal.held[p][i] > 0 ? reach[i] * deal.total / deal.held[p][i] : 0;
}

/** Values leaving a sampled deal: averaged over the samples the combo doesn't hold. */
inline void normalizeValues(const SampledDeal& deal, int p, int n, float* values) {
  for (int i = 0; i < n; i++) values[i] = deal.held[p][i] > 0 ? values[i] / deal.held[p][i] : 0;
}

// ---------------------------------------------------------------- CFR traversal

/**
 * A chance node's values for player p: each child's, from `recurse(child,
 * opponent reach, values)`, weighted by its card, with combos holding the card
 * zeroed on both sides. Sampled nodes also renormalize per combo (SampledDeal).
 */
template <class Recurse>
void dealChance(Engine& e, int node, int p, const float* oppReach, float* out, Recurse recurse) {
  const Player& self = e.players[p];
  const int nS = self.n, nO = e.players[1 - p].n;
  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];
  const bool sampled = e.aux[node] == 1;
  const SampledDeal deal = sampled ? sampledDeal(e, node) : SampledDeal{};
  float* childOpp = arenaOf(e).take(nO);
  float* childValues = arenaOf(e).take(nS);
  std::fill(out, out + nS, 0.0f);
  for (int c = 0; c < count; c++) {
    const uint8_t card = e.childCard[start + c];
    std::copy(oppReach, oppReach + nO, childOpp);
    if (sampled) scaleReach(deal, 1 - p, nO, childOpp);
    zeroWithCard(e.players[1 - p], card, childOpp);
    recurse(e.children[start + c], childOpp, childValues);
    zeroWithCard(self, card, childValues);
    const float w = e.childWeight[start + c];
    for (int i = 0; i < nS; i++) out[i] += w * childValues[i];
  }
  if (sampled) normalizeValues(deal, p, nS, out);
  arenaOf(e).top = mark;
}

/**
 * Player p's counterfactual values when the opponent plays the average
 * strategy and p plays either the average strategy too or a best response.
 */
void evaluateNode(Engine& e, int node, int p, bool bestResponse, const float* oppReach, float* out) {
  const uint8_t t = e.type[node];
  const Player& self = e.players[p];
  const int nS = self.n, nO = e.players[1 - p].n;
  if (t == kFold || t == kShowdownTable || t == kShowdownRiver) return terminalValues(e, node, p, oppReach, out);

  if (t == kChance) {
    return dealChance(e, node, p, oppReach, out, [&e, p, bestResponse](int child, const float* reach, float* values) {
      evaluateNode(e, child, p, bestResponse, reach, values);
    });
  }

  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];
  const int actor = t;
  const int nA = e.players[actor].n;
  float* sigma = arenaOf(e).take(static_cast<size_t>(count) * nA);
  float* scratch = arenaOf(e).take(std::max(nA, nO));
  float* childValues = arenaOf(e).take(nS);
  averageStrategy(e.stratSum.data() + e.storage[node], count, nA, sigma, scratch);

  if (actor == p) {
    for (int a = 0; a < count; a++) {
      evaluateNode(e, e.children[start + a], p, bestResponse, oppReach, childValues);
      const float* s = sigma + static_cast<size_t>(a) * nS;
      for (int i = 0; i < nS; i++) {
        if (bestResponse) out[i] = a == 0 ? childValues[i] : std::max(out[i], childValues[i]);
        else out[i] = (a == 0 ? 0 : out[i]) + s[i] * childValues[i];
      }
    }
  } else {
    std::fill(out, out + nS, 0.0f);
    for (int a = 0; a < count; a++) {
      const float* s = sigma + static_cast<size_t>(a) * nO;
      for (int j = 0; j < nO; j++) scratch[j] = oppReach[j] * s[j];
      evaluateNode(e, e.children[start + a], p, bestResponse, scratch, childValues);
      for (int i = 0; i < nS; i++) out[i] += childValues[i];
    }
  }
  arenaOf(e).top = mark;
}

/** Regret update at a node whose player just got `actionValues` ([action * n + combo]) and `values` from sigma. */
void updateRegrets(float* regret, const float* actionValues, const float* values, int actions, int n, const Update& update) {
  for (int a = 0; a < actions; a++) {
    float* r = regret + static_cast<size_t>(a) * n;
    const float* av = actionValues + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) {
      const float x = r[i] + av[i] - values[i];
      r[i] = x * (x > 0 ? update.positiveDiscount : kNegativeRegretDiscount);
    }
  }
}

/** The opponent's strategy this iteration into their average, `reach` being their reach into the node. */
void addToAverage(float* sum, const float* sigma, const float* reach, int actions, int n, const Update& update) {
  for (int a = 0; a < actions; a++) {
    float* ss = sum + static_cast<size_t>(a) * n;
    const float* s = sigma + static_cast<size_t>(a) * n;
    for (int i = 0; i < n; i++) ss[i] += update.strategyWeight * reach[i] * s[i];
  }
}

/**
 * One player's half of an alternating iteration: p's counterfactual values
 * against the opponent's current strategy, updating p's regrets and the
 * opponent's average. Only p's values and the opponent's reach are needed, so
 * a traversal costs about half of computing both, and each player responds to
 * the other's newest regrets.
 */
void cfrNode(Engine& e, int node, int p, const float* oppReach, float* out, const Update& update) {
  const uint8_t t = e.type[node];
  if (t == kFold || t == kShowdownTable || t == kShowdownRiver) return terminalValues(e, node, p, oppReach, out);
  if (t == kChance) {
    return dealChance(e, node, p, oppReach, out, [&e, p, &update](int child, const float* reach, float* values) {
      cfrNode(e, child, p, reach, values, update);
    });
  }

  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];
  const int nS = e.players[p].n, nA = e.players[t].n;
  float* regret = e.regret.data() + e.storage[node];
  float* sigma = arenaOf(e).take(static_cast<size_t>(count) * nA);
  float* scratch = arenaOf(e).take(std::max(nA, nS));
  regretMatch(regret, count, nA, sigma, scratch);
  std::fill(out, out + nS, 0.0f);

  if (t == p) {
    float* actionValues = arenaOf(e).take(static_cast<size_t>(count) * nS);
    for (int a = 0; a < count; a++) {
      const float* s = sigma + static_cast<size_t>(a) * nS;
      float* av = actionValues + static_cast<size_t>(a) * nS;
      cfrNode(e, e.children[start + a], p, oppReach, av, update);
      for (int i = 0; i < nS; i++) out[i] += s[i] * av[i];
    }
    updateRegrets(regret, actionValues, out, count, nS, update);
  } else {
    addToAverage(e.stratSum.data() + e.storage[node], sigma, oppReach, count, nA, update);
    float* childValues = arenaOf(e).take(nS);
    for (int a = 0; a < count; a++) {
      const float* s = sigma + static_cast<size_t>(a) * nA;
      for (int j = 0; j < nA; j++) scratch[j] = oppReach[j] * s[j];
      cfrNode(e, e.children[start + a], p, scratch, childValues, update);
      for (int i = 0; i < nS; i++) out[i] += childValues[i];
    }
  }
  arenaOf(e).top = mark;
}

/** Scratch floats a subtree needs at most (both traversals), so the arena never reallocates. */
size_t scratchNeed(const Engine& e, int node, size_t widest) {
  const uint8_t t = e.type[node];
  if (t != kChance && t != kDecisionP1 && t != kDecisionP2) return 0;
  const int start = e.childStart[node], count = e.childCount[node];
  const size_t local = t == kChance ? 6 * widest : (2 * static_cast<size_t>(count) + 3) * widest;
  size_t deepest = 0;
  for (int c = 0; c < count; c++) deepest = std::max(deepest, scratchNeed(e, e.children[start + c], widest));
  return local + deepest;
}

bool isAverageResetIteration(int t) { return t > 1 && (t & (t - 1)) == 0 && (__builtin_ctz(t) % 2 == 0); }

Update updateFor(int t) {
  const double tAlpha = std::pow(static_cast<double>(t), kAlpha);
  return Update{static_cast<float>(tAlpha / (tAlpha + 1)), static_cast<float>(std::pow(static_cast<double>(t), kGamma))};
}

// ---------------------------------------------------------------- split execution

inline float* trunkReach(Engine& e, int node, int p) {
  return e.split.reach.data() + static_cast<size_t>(e.split.trunkIndex[node]) * e.split.width + (p == 0 ? 0 : e.players[0].n);
}
inline float* trunkEvalReach(Engine& e, int node, int p) {
  return e.split.evalReach.data() + static_cast<size_t>(e.split.trunkIndex[node]) * e.split.width + (p == 0 ? 0 : e.players[0].n);
}
inline float* trunkEvalValues(Engine& e, int node, int p) {
  return e.split.evalValues.data() + static_cast<size_t>(e.split.trunkIndex[node]) * e.split.width + (p == 0 ? 0 : e.players[0].n);
}
inline float* leafIn(Engine& e, int slot) { return e.split.exchangeIn.data() + static_cast<size_t>(slot) * e.split.width; }
inline float* leafOut(Engine& e, int slot) { return e.split.exchangeOut.data() + static_cast<size_t>(slot) * e.split.width; }

bool isTerminal(uint8_t t) { return t == kFold || t == kShowdownTable || t == kShowdownRiver; }

inline bool isLocked(const Engine& e, int node) { return e.split.locked[e.split.trunkIndex[node]] != 0; }
inline const float* lockedSigma(const Engine& e, int node) { return e.split.lockedSigma.data() + e.split.sigmaOffset[e.split.trunkIndex[node]]; }

/** The strategy a trunk node reports and is evaluated with: its lock if it has one, otherwise its average. */
void trunkStrategy(const Engine& e, int node, int count, int n, float* sigma, float* scratch) {
  if (isLocked(e, node)) {
    const float* locked = lockedSigma(e, node);
    std::copy(locked, locked + static_cast<size_t>(count) * n, sigma);
  } else {
    averageStrategy(e.stratSum.data() + e.storage[node], count, n, sigma, scratch);
  }
}

/** Trunk half of cfrNode, going down: strategies and opponent reach at every trunk node; each leaf's opponent reach into exchangeIn. */
void trunkForward(Engine& e, int node, int p, const float* oppReach) {
  const int o = 1 - p, nO = e.players[o].n;
  std::copy(oppReach, oppReach + nO, trunkReach(e, node, o));
  const uint8_t t = e.type[node];
  if (isTerminal(t)) return;
  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    const bool sampled = e.aux[node] == 1;
    const SampledDeal deal = sampled ? sampledDeal(e, node) : SampledDeal{};
    for (int c = 0; c < count; c++) {
      float* in = leafIn(e, e.split.leafSlot[e.children[start + c]]);
      std::copy(oppReach, oppReach + nO, in);
      if (sampled) scaleReach(deal, o, nO, in);
      zeroWithCard(e.players[o], e.childCard[start + c], in);
    }
    arenaOf(e).top = mark;
    return;
  }

  const int nA = e.players[t].n;
  float* sigma = e.split.sigma.data() + e.split.sigmaOffset[e.split.trunkIndex[node]];
  float* scratch = arenaOf(e).take(nA);
  if (isLocked(e, node)) std::copy(lockedSigma(e, node), lockedSigma(e, node) + static_cast<size_t>(count) * nA, sigma);
  else regretMatch(e.regret.data() + e.storage[node], count, nA, sigma, scratch);
  for (int a = 0; a < count; a++) {
    if (t == p) {
      trunkForward(e, e.children[start + a], p, oppReach);
    } else {
      const float* s = sigma + static_cast<size_t>(a) * nA;
      for (int j = 0; j < nA; j++) scratch[j] = oppReach[j] * s[j];
      trunkForward(e, e.children[start + a], p, scratch);
    }
  }
  arenaOf(e).top = mark;
}

/** Trunk half of cfrNode, coming back up: leaf values from exchangeOut, p's regrets and the opponent's average on the trunk. */
void trunkBackward(Engine& e, int node, int p, float* out, const Update& update) {
  const Player& self = e.players[p];
  const int nS = self.n;
  const uint8_t t = e.type[node];
  const float* oppReach = trunkReach(e, node, 1 - p);
  if (isTerminal(t)) return terminalValues(e, node, p, oppReach, out);
  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    const bool sampled = e.aux[node] == 1;
    const SampledDeal deal = sampled ? sampledDeal(e, node) : SampledDeal{};
    std::fill(out, out + nS, 0.0f);
    for (int c = 0; c < count; c++) {
      float* values = leafOut(e, e.split.leafSlot[e.children[start + c]]);
      zeroWithCard(self, e.childCard[start + c], values);
      const float w = e.childWeight[start + c];
      for (int i = 0; i < nS; i++) out[i] += w * values[i];
    }
    if (sampled) normalizeValues(deal, p, nS, out);
    arenaOf(e).top = mark;
    return;
  }

  const int nA = e.players[t].n;
  const float* sigma = e.split.sigma.data() + e.split.sigmaOffset[e.split.trunkIndex[node]];
  std::fill(out, out + nS, 0.0f);
  if (t == p) {
    float* actionValues = arenaOf(e).take(static_cast<size_t>(count) * nS);
    for (int a = 0; a < count; a++) {
      const float* s = sigma + static_cast<size_t>(a) * nS;
      float* av = actionValues + static_cast<size_t>(a) * nS;
      trunkBackward(e, e.children[start + a], p, av, update);
      for (int i = 0; i < nS; i++) out[i] += s[i] * av[i];
    }
    updateRegrets(e.regret.data() + e.storage[node], actionValues, out, count, nS, update);
  } else {
    addToAverage(e.stratSum.data() + e.storage[node], sigma, oppReach, count, nA, update);
    float* childValues = arenaOf(e).take(nS);
    for (int a = 0; a < count; a++) {
      trunkBackward(e, e.children[start + a], p, childValues, update);
      for (int i = 0; i < nS; i++) out[i] += childValues[i];
    }
  }
  arenaOf(e).top = mark;
}

/** Trunk half of evaluateNode, going down: average-strategy reaches; each leaf's opponent reach (for target `p`) into exchangeIn. */
void trunkEvalForward(Engine& e, int node, int p, const float* r1, const float* r2) {
  const int n1 = e.players[0].n, n2 = e.players[1].n;
  std::copy(r1, r1 + n1, trunkEvalReach(e, node, 0));
  std::copy(r2, r2 + n2, trunkEvalReach(e, node, 1));
  const uint8_t t = e.type[node];
  if (isTerminal(t)) return;
  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    const bool sampled = e.aux[node] == 1;
    const SampledDeal deal = sampled ? sampledDeal(e, node) : SampledDeal{};
    const int o = 1 - p, nO = e.players[o].n;
    const float* rO = o == 0 ? r1 : r2;
    for (int c = 0; c < count; c++) {
      float* in = leafIn(e, e.split.leafSlot[e.children[start + c]]);
      std::copy(rO, rO + nO, in);
      if (sampled) scaleReach(deal, o, nO, in);
      zeroWithCard(e.players[o], e.childCard[start + c], in);
    }
    arenaOf(e).top = mark;
    return;
  }

  const int actor = t;
  const int nA = e.players[actor].n;
  float* sigma = arenaOf(e).take(static_cast<size_t>(count) * nA);
  float* childReach = arenaOf(e).take(nA);
  trunkStrategy(e, node, count, nA, sigma, childReach);
  const float* rA = actor == 0 ? r1 : r2;
  for (int a = 0; a < count; a++) {
    const float* s = sigma + static_cast<size_t>(a) * nA;
    for (int i = 0; i < nA; i++) childReach[i] = rA[i] * s[i];
    if (actor == 0) trunkEvalForward(e, e.children[start + a], p, childReach, r2);
    else trunkEvalForward(e, e.children[start + a], p, r1, childReach);
  }
  arenaOf(e).top = mark;
}

/** Trunk half of evaluateNode, coming back up: player p's values from the leaves' exchangeOut. */
void trunkEvalBackward(Engine& e, int node, int p, bool bestResponse, float* out) {
  const Player& self = e.players[p];
  const int nS = self.n;
  const uint8_t t = e.type[node];
  if (isTerminal(t)) return terminalValues(e, node, p, trunkEvalReach(e, node, 1 - p), out);
  const size_t mark = arenaOf(e).top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    const bool sampled = e.aux[node] == 1;
    const SampledDeal deal = sampled ? sampledDeal(e, node) : SampledDeal{};
    std::fill(out, out + nS, 0.0f);
    for (int c = 0; c < count; c++) {
      float* values = leafOut(e, e.split.leafSlot[e.children[start + c]]);
      zeroWithCard(self, e.childCard[start + c], values);
      const float w = e.childWeight[start + c];
      for (int i = 0; i < nS; i++) out[i] += w * values[i];
    }
    if (sampled) normalizeValues(deal, p, nS, out);
    if (!bestResponse) std::copy(out, out + nS, trunkEvalValues(e, node, p));
    arenaOf(e).top = mark;
    return;
  }

  const int actor = t;
  const int nA = e.players[actor].n, nO = e.players[1 - p].n;
  float* sigma = arenaOf(e).take(static_cast<size_t>(count) * nA);
  float* scratch = arenaOf(e).take(std::max(nA, nO));
  float* childValues = arenaOf(e).take(nS);
  trunkStrategy(e, node, count, nA, sigma, scratch);
  if (actor == p) {
    const bool pickBest = bestResponse && !isLocked(e, node);
    for (int a = 0; a < count; a++) {
      trunkEvalBackward(e, e.children[start + a], p, bestResponse, childValues);
      const float* s = sigma + static_cast<size_t>(a) * nS;
      for (int i = 0; i < nS; i++) {
        if (pickBest) out[i] = a == 0 ? childValues[i] : std::max(out[i], childValues[i]);
        else out[i] = (a == 0 ? 0 : out[i]) + s[i] * childValues[i];
      }
    }
  } else {
    std::fill(out, out + nS, 0.0f);
    for (int a = 0; a < count; a++) {
      trunkEvalBackward(e, e.children[start + a], p, bestResponse, childValues);
      for (int i = 0; i < nS; i++) out[i] += childValues[i];
    }
  }
  arenaOf(e).top = mark;
}

/** Decision nodes in preorder under `node`, stopping at leaf roots unless `node` is one. */
void collectDecisions(const Engine& e, int node, bool stopAtLeaves, std::vector<int32_t>& out, std::vector<int32_t>* trunk) {
  if (trunk) trunk->push_back(node);
  const uint8_t t = e.type[node];
  if (t == kDecisionP1 || t == kDecisionP2) out.push_back(node);
  if (isTerminal(t)) return;
  const int start = e.childStart[node], count = e.childCount[node];
  for (int c = 0; c < count; c++) {
    const int child = e.children[start + c];
    if (stopAtLeaves && e.split.leafSlot[child] >= 0) continue;
    collectDecisions(e, child, stopAtLeaves, out, trunk);
  }
}

void initPlayer(Player& p, int n, const uint8_t* cards, const float* weights) {
  p.n = n;
  p.cards.assign(cards, cards + n * 2);
  p.weights.assign(weights, weights + n);
  for (int i = 0; i < n; i++) {
    p.withCard[cards[i * 2]].push_back(i);
    p.withCard[cards[i * 2 + 1]].push_back(i);
  }
}

void linkSameCombos(Player& self, const Player& opp) {
  std::vector<int32_t> byPair(kDeckSize * kDeckSize, -1);
  for (int j = 0; j < opp.n; j++) {
    const int a = opp.cards[j * 2], b = opp.cards[j * 2 + 1];
    byPair[std::min(a, b) * kDeckSize + std::max(a, b)] = j;
  }
  self.sameOpp.resize(self.n);
  for (int i = 0; i < self.n; i++) {
    const int a = self.cards[i * 2], b = self.cards[i * 2 + 1];
    self.sameOpp[i] = byPair[std::min(a, b) * kDeckSize + std::max(a, b)];
  }
}

/** Runs `work(slot)` for every owned leaf, spread over the pool: each thread takes the next slot until none are left. */
template <typename Work>
void forEachLeaf(Engine& e, const Work& work) {
  Pool& pool = e.pool;
  const std::vector<int32_t>& order = e.split.leafOrder;
  pool.next.store(0);
  const auto drain = [&pool, &order, &work] {
    for (int k = pool.next.fetch_add(1); k < static_cast<int>(order.size()); k = pool.next.fetch_add(1)) work(order[k]);
  };
#ifdef __EMSCRIPTEN_PTHREADS__
  if (pool.threads > 1) {
    {
      std::lock_guard<std::mutex> lock(pool.mutex);
      pool.task = drain;
      pool.done = 0;
      pool.generation++;
    }
    pool.wake.notify_all();
    drain();
    std::unique_lock<std::mutex> lock(pool.mutex);
    pool.finished.wait(lock, [&pool] { return pool.done == pool.threads - 1; });
    return;
  }
#endif
  drain();
}

void iterateLeaf(Engine& e, int slot, int p, int t, const Update& update) {
  if (p == 0 && isAverageResetIteration(t))
    std::fill(e.stratSum.begin() + e.split.leafStorageBegin[slot], e.stratSum.begin() + e.split.leafStorageEnd[slot], 0.0f);
  cfrNode(e, e.split.leafNodes[slot], p, leafIn(e, slot), leafOut(e, slot), update);
}

}  // namespace

extern "C" {

/**
 * Copies the flattened tree and both ranges. Node arrays are indexed by node;
 * children/childCard/childWeight by child slot (childStart[node] + k), with
 * childCard = 255 except under chance nodes. The root is node 0.
 */
Engine* eng_create(int nodeCount, const uint8_t* type, const int32_t* childStart, const uint8_t* childCount,
                   const float* pot, const float* committed1, const float* committed2, const int32_t* aux,
                   int childSlots, const int32_t* children, const uint8_t* childCard, const float* childWeight,
                   int heroCount, const uint8_t* heroCards, const float* heroWeights, int villainCount,
                   const uint8_t* villainCards, const float* villainWeights) {
  auto* e = new Engine();
  e->nodeCount = nodeCount;
  e->type.assign(type, type + nodeCount);
  e->childStart.assign(childStart, childStart + nodeCount);
  e->childCount.assign(childCount, childCount + nodeCount);
  e->pot.assign(pot, pot + nodeCount);
  e->committed1.assign(committed1, committed1 + nodeCount);
  e->committed2.assign(committed2, committed2 + nodeCount);
  e->aux.assign(aux, aux + nodeCount);
  e->children.assign(children, children + childSlots);
  e->childCard.assign(childCard, childCard + childSlots);
  e->childWeight.assign(childWeight, childWeight + childSlots);
  initPlayer(e->players[0], heroCount, heroCards, heroWeights);
  initPlayer(e->players[1], villainCount, villainCards, villainWeights);
  linkSameCombos(e->players[0], e->players[1]);
  linkSameCombos(e->players[1], e->players[0]);

  e->storage.assign(nodeCount, 0);
  size_t total = 0;
  for (int node = 0; node < nodeCount; node++) {
    if (e->type[node] != kDecisionP1 && e->type[node] != kDecisionP2) continue;
    e->storage[node] = total;
    total += static_cast<size_t>(e->childCount[node]) * e->players[e->type[node]].n;
  }
  e->regret.assign(total, 0.0f);
  e->stratSum.assign(total, 0.0f);

  const size_t widest = static_cast<size_t>(std::max(heroCount, villainCount));
  arenaOf(*e).data.assign(scratchNeed(*e, 0, widest) + 4 * widest, 0.0f);
  return e;
}

void eng_destroy(Engine* e) { delete e; }

/** Registers an equity table (hero rows × villain cols, hero equity, blocked pairs 0); returns its id. */
int eng_add_equity_table(Engine* e, const float* heroEquity) {
  const int h = e->players[0].n, v = e->players[1].n;
  EquityTable table;
  table.rows[0].assign(heroEquity, heroEquity + static_cast<size_t>(h) * v);
  table.rows[1].assign(static_cast<size_t>(v) * h, 0.0f);
  for (int i = 0; i < h; i++) {
    for (int j = 0; j < v; j++) {
      const bool blocked = e->players[0].cards[i * 2] == e->players[1].cards[j * 2] ||
                           e->players[0].cards[i * 2] == e->players[1].cards[j * 2 + 1] ||
                           e->players[0].cards[i * 2 + 1] == e->players[1].cards[j * 2] ||
                           e->players[0].cards[i * 2 + 1] == e->players[1].cards[j * 2 + 1];
      if (!blocked) table.rows[1][static_cast<size_t>(j) * h + i] = 1.0f - heroEquity[static_cast<size_t>(i) * v + j];
    }
  }
  e->tables.push_back(std::move(table));
  return static_cast<int>(e->tables.size()) - 1;
}

/** Registers a river board by each combo's hand strength (bigger = better); returns its id. */
int eng_add_river_board(Engine* e, const uint32_t* heroStrength, const uint32_t* villainStrength) {
  RiverBoard board;
  const uint32_t* strengths[2] = {heroStrength, villainStrength};
  for (int p = 0; p < 2; p++) {
    const int n = e->players[p].n;
    board.strength[p].assign(strengths[p], strengths[p] + n);
    board.ascending[p].resize(n);
    for (int i = 0; i < n; i++) board.ascending[p][i] = i;
    const uint32_t* s = board.strength[p].data();
    std::stable_sort(board.ascending[p].begin(), board.ascending[p].end(), [s](int a, int b) { return s[a] < s[b]; });
  }
  e->boards.push_back(std::move(board));
  return static_cast<int>(e->boards.size()) - 1;
}

/**
 * Turns this engine into a split solve: `leafNodes` are the leaf roots (slot =
 * position). Regrets and averages are reallocated trunk first, then leaf by
 * leaf, so each thread writes its own range.
 */
void eng_partition(Engine* e, int leafCount, const int32_t* leafNodes) {
  Split& sp = e->split;
  sp.active = true;
  sp.leafNodes.assign(leafNodes, leafNodes + leafCount);
  sp.leafSlot.assign(e->nodeCount, -1);
  for (int k = 0; k < leafCount; k++) sp.leafSlot[leafNodes[k]] = k;
  sp.width = e->players[0].n + e->players[1].n;
  sp.exchangeIn.assign(static_cast<size_t>(leafCount) * sp.width, 0.0f);
  sp.exchangeOut.assign(static_cast<size_t>(leafCount) * sp.width, 0.0f);

  std::vector<int32_t> trunkDecisions, trunkNodes;
  collectDecisions(*e, 0, true, trunkDecisions, &trunkNodes);
  sp.trunkIndex.assign(e->nodeCount, -1);
  sp.trunkCount = static_cast<int>(trunkNodes.size());
  for (int k = 0; k < sp.trunkCount; k++) sp.trunkIndex[trunkNodes[k]] = k;

  size_t total = 0;
  const auto assign = [&](int node) {
    e->storage[node] = total;
    total += static_cast<size_t>(e->childCount[node]) * e->players[e->type[node]].n;
  };
  sp.sigmaOffset.assign(sp.trunkCount, 0);
  size_t sigmaTotal = 0;
  for (const int node : trunkDecisions) {
    assign(node);
    sp.sigmaOffset[sp.trunkIndex[node]] = sigmaTotal;
    sigmaTotal += static_cast<size_t>(e->childCount[node]) * e->players[e->type[node]].n;
  }
  sp.trunkStorageEnd = total;
  sp.leafStorageBegin.assign(leafCount, 0);
  sp.leafStorageEnd.assign(leafCount, 0);
  for (int slot = 0; slot < leafCount; slot++) {
    std::vector<int32_t> decisions;
    collectDecisions(*e, leafNodes[slot], false, decisions, nullptr);
    sp.leafStorageBegin[slot] = total;
    for (const int node : decisions) assign(node);
    sp.leafStorageEnd[slot] = total;
  }
  e->regret.assign(total, 0.0f);
  e->stratSum.assign(total, 0.0f);
  const size_t trunkFloats = static_cast<size_t>(sp.trunkCount) * sp.width;
  sp.reach.assign(trunkFloats, 0.0f);
  sp.evalReach.assign(trunkFloats, 0.0f);
  sp.evalValues.assign(trunkFloats, 0.0f);
  sp.sigma.assign(sigmaTotal, 0.0f);
  sp.locked.assign(sp.trunkCount, 0);
  sp.lockedSigma.assign(sigmaTotal, 0.0f);
  sp.leafOrder.resize(leafCount);
  std::iota(sp.leafOrder.begin(), sp.leafOrder.end(), 0);
  std::stable_sort(sp.leafOrder.begin(), sp.leafOrder.end(), [&sp](int a, int b) {
    return sp.leafStorageEnd[a] - sp.leafStorageBegin[a] > sp.leafStorageEnd[b] - sp.leafStorageBegin[b];
  });
}

/**
 * Fixes a trunk decision node's strategy (after eng_partition): its player can
 * no longer choose there, in solving or in best responses, so a solve finds
 * the equilibrium given that strategy. `strategy` is in eng_average_strategy's
 * layout, [combo * actions + action].
 */
void eng_lock_strategy(Engine* e, int node, const float* strategy) {
  const int actions = e->childCount[node];
  const int n = e->players[e->type[node]].n;
  const int index = e->split.trunkIndex[node];
  float* sigma = e->split.lockedSigma.data() + e->split.sigmaOffset[index];
  for (int a = 0; a < actions; a++)
    for (int i = 0; i < n; i++) sigma[static_cast<size_t>(a) * n + i] = strategy[static_cast<size_t>(i) * actions + a];
  e->split.locked[index] = 1;
}

/** Iteration t, player p, first trunk half: writes every leaf's opponent reach into exchangeIn. */
void eng_trunk_forward(Engine* e, int t, int p) {
  if (p == 0 && isAverageResetIteration(t)) std::fill(e->stratSum.begin(), e->stratSum.begin() + e->split.trunkStorageEnd, 0.0f);
  trunkForward(*e, 0, p, e->players[1 - p].weights.data());
  arenaOf(*e).top = 0;
}

/** Iteration t, player p, second trunk half: leaf values from exchangeOut, trunk regret/average updates. */
void eng_trunk_backward(Engine* e, int t, int p) {
  const Update update = updateFor(t);
  float* values = arenaOf(*e).take(e->players[p].n);
  trunkBackward(*e, 0, p, values, update);
  arenaOf(*e).top = 0;
}

/** Evaluation for player p, first trunk half: each leaf's opponent reach (average strategy) into exchangeIn. */
void eng_trunk_eval_forward(Engine* e, int p) {
  trunkEvalForward(*e, 0, p, e->players[0].weights.data(), e->players[1].weights.data());
  arenaOf(*e).top = 0;
}

/** Evaluation, second trunk half: player p's root values into `rootValues`. */
void eng_trunk_eval_backward(Engine* e, int p, int bestResponse, float* rootValues) {
  trunkEvalBackward(*e, 0, p, bestResponse != 0, rootValues);
  arenaOf(*e).top = 0;
}

/** Compatible-pair mass of the starting ranges: what EVs are averaged over. */
double eng_pair_mass(Engine* e) {
  const Player& p1 = e->players[0];
  const Player& p2 = e->players[1];
  const CardSums s = cardSums(p2, p2.weights.data());
  double pairs = 0;
  for (int i = 0; i < p1.n; i++) pairs += p1.weights[i] * live(p1, i, s, p2.weights.data());
  return pairs;
}

/** Both players' EV at a trunk chance node, from the last EV-mode evaluation of each; NaN when nothing reaches it. */
void eng_trunk_chance_ev(Engine* e, int node, double* out) {
  const Player& p1 = e->players[0];
  const float* r1 = trunkEvalReach(*e, node, 0);
  const float* r2 = trunkEvalReach(*e, node, 1);
  const CardSums s = cardSums(e->players[1], r2);
  double pairs = 0;
  for (int i = 0; i < p1.n; i++) pairs += r1[i] * live(p1, i, s, r2);
  for (int p = 0; p < 2; p++) {
    const float* reach = p == 0 ? r1 : r2;
    const float* values = trunkEvalValues(*e, node, p);
    double sum = 0;
    for (int i = 0; i < e->players[p].n; i++) sum += static_cast<double>(reach[i]) * values[i];
    out[p] = pairs > 0 ? sum / pairs : std::nan("");
  }
}

/**
 * Starts `threads` − 1 pool threads (the caller is the last one) for
 * eng_iterate_parallel / eng_exploitability_parallel. Single-threaded builds
 * keep one thread whatever is asked. Call after eng_partition.
 */
int eng_set_threads(Engine* e, int threads) {
#ifdef __EMSCRIPTEN_PTHREADS__
  Pool& pool = e->pool;
  pool.threads = std::max(1, threads);
  pool.arenas.resize(pool.threads - 1);
  for (Arena& arena : pool.arenas) arena.data.assign(e->arena.data.size(), 0.0f);
  for (int k = 0; k < pool.threads - 1; k++) {
    pool.workers.emplace_back([&pool, k] {
      threadArena = &pool.arenas[k];
      int seen = 0;
      for (;;) {
        {
          std::unique_lock<std::mutex> lock(pool.mutex);
          pool.wake.wait(lock, [&pool, seen] { return pool.stopping || pool.generation != seen; });
          if (pool.stopping) return;
          seen = pool.generation;
        }
        pool.task();  // stays put until every thread has reported done
        {
          std::lock_guard<std::mutex> lock(pool.mutex);
          pool.done++;
        }
        pool.finished.notify_one();
      }
    });
  }
  return pool.threads;
#else
  (void)threads;
  return 1;
#endif
}

/** DCFR iterations on a split engine owning the trunk and every leaf: trunk down, all leaves across the pool, trunk up. */
void eng_iterate_parallel(Engine* e, int firstT, int count) {
  for (int t = firstT; t < firstT + count; t++) {
    const Update update = updateFor(t);
    for (int p = 0; p < 2; p++) {
      eng_trunk_forward(e, t, p);
      forEachLeaf(*e, [e, p, t, &update](int slot) { iterateLeaf(*e, slot, p, t, update); });
      eng_trunk_backward(e, t, p);
    }
  }
}

void eng_exploitability_parallel(Engine* e, double* out) {
  const double pairs = eng_pair_mass(e);
  std::vector<float> root(std::max(e->players[0].n, e->players[1].n));
  const auto ev = [e, pairs, &root](int p, bool bestResponse) {
    eng_trunk_eval_forward(e, p);
    forEachLeaf(*e, [e, p, bestResponse](int slot) {
      evaluateNode(*e, e->split.leafNodes[slot], p, bestResponse, leafIn(*e, slot), leafOut(*e, slot));
    });
    eng_trunk_eval_backward(e, p, bestResponse ? 1 : 0, root.data());
    const Player& self = e->players[p];
    double sum = 0;
    for (int i = 0; i < self.n; i++) sum += static_cast<double>(self.weights[i]) * root[i];
    return pairs > 0 ? sum / pairs : 0;
  };
  // EV passes for both players also leave each chance node's values for eng_trunk_chance_ev.
  const double p1Actual = ev(0, false), p1Best = ev(0, true), p2Actual = ev(1, false), p2Best = ev(1, true);
  const double startPot = e->pot[0] - e->committed1[0] - e->committed2[0];
  const double bb = (p1Best - p1Actual + p2Best - p2Actual) / 2;
  out[0] = bb;
  out[1] = startPot > 0 ? bb / startPot * 100 : 0;
  out[2] = p1Best;
  out[3] = p2Best;
  out[4] = p1Actual;
  out[5] = p2Actual;
}

/** Runs DCFR iterations t = firstT .. firstT + count - 1 (t counts from 1). */
void eng_iterate(Engine* e, int firstT, int count) {
  float* values = arenaOf(*e).take(std::max(e->players[0].n, e->players[1].n));
  for (int t = firstT; t < firstT + count; t++) {
    if (isAverageResetIteration(t)) std::fill(e->stratSum.begin(), e->stratSum.end(), 0.0f);
    const Update update = updateFor(t);
    for (int p = 0; p < 2; p++) cfrNode(*e, 0, p, e->players[1 - p].weights.data(), values, update);
  }
  arenaOf(*e).top = 0;
}

/**
 * out = [exploitability bb, % of starting pot, P1 best-response EV, P2 best-response EV, P1 EV, P2 EV].
 * EVs are expectations over compatible (P1 combo, P2 combo) pairs drawn by their starting weights.
 */
void eng_exploitability(Engine* e, double* out) {
  const Player& p1 = e->players[0];
  const Player& p2 = e->players[1];
  std::vector<float> values(std::max(p1.n, p2.n));
  double ev[2][2];  // [player][bestResponse]
  for (int p = 0; p < 2; p++) {
    const Player& self = e->players[p];
    const float* oppWeights = e->players[1 - p].weights.data();
    for (int br = 0; br < 2; br++) {
      evaluateNode(*e, 0, p, br == 1, oppWeights, values.data());
      arenaOf(*e).top = 0;
      double sum = 0;
      for (int i = 0; i < self.n; i++) sum += static_cast<double>(self.weights[i]) * values[i];
      ev[p][br] = sum;
    }
  }
  // Compatible pair mass: Σ_i w1_i × (P2 weight not sharing a card with i).
  const CardSums s = cardSums(p2, p2.weights.data());
  double pairs = 0;
  for (int i = 0; i < p1.n; i++) pairs += p1.weights[i] * live(p1, i, s, p2.weights.data());
  for (auto& player : ev) for (double& x : player) x = pairs > 0 ? x / pairs : 0;

  const double startPot = e->pot[0] - e->committed1[0] - e->committed2[0];
  const double bb = (ev[0][1] - ev[0][0] + ev[1][1] - ev[1][0]) / 2;
  out[0] = bb;
  out[1] = startPot > 0 ? bb / startPot * 100 : 0;
  out[2] = ev[0][1];
  out[3] = ev[1][1];
  out[4] = ev[0][0];
  out[5] = ev[1][0];
}

/**
 * Both players' EV at `node` when they arrive with these reaches (the starting
 * weights narrowed along the path there) and play the average strategy from
 * then on: out = [P1 EV, P2 EV], each an expectation over compatible pairs,
 * in chips relative to the root (payoff = pot − chips put in since the root).
 * NaN when no compatible pair reaches the node (a line neither player takes).
 */
void eng_node_ev(Engine* e, int node, const float* reach1, const float* reach2, double* out) {
  const Player& p1 = e->players[0];
  const Player& p2 = e->players[1];
  std::vector<float> values(std::max(p1.n, p2.n));
  const float* reach[2] = {reach1, reach2};
  const CardSums s = cardSums(p2, reach2);
  double pairs = 0;
  for (int i = 0; i < p1.n; i++) pairs += reach1[i] * live(p1, i, s, reach2);
  for (int p = 0; p < 2; p++) {
    evaluateNode(*e, node, p, false, reach[1 - p], values.data());
    arenaOf(*e).top = 0;
    double sum = 0;
    for (int i = 0; i < e->players[p].n; i++) sum += static_cast<double>(reach[p][i]) * values[i];
    out[p] = pairs > 0 ? sum / pairs : std::nan("");
  }
}

/** A decision node's normalized average strategy, combo-major: out[combo * actions + action]. */
void eng_average_strategy(Engine* e, int node, float* out) {
  const int actions = e->childCount[node];
  const int n = e->players[e->type[node]].n;
  const float* sum = e->stratSum.data() + e->storage[node];
  for (int i = 0; i < n; i++) {
    float total = 0;
    for (int a = 0; a < actions; a++) total += sum[static_cast<size_t>(a) * n + i];
    for (int a = 0; a < actions; a++)
      out[static_cast<size_t>(i) * actions + a] = total > 0 ? sum[static_cast<size_t>(a) * n + i] / total : 1.0f / actions;
  }
}

}  // extern "C"
