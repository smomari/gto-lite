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
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>
#include <wasm_simd128.h>

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
  kChance = 5,         // children carry the dealt card and its probability
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

struct Engine {
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
  Arena arena;
};

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

// ---------------------------------------------------------------- CFR traversal

/** Both players' counterfactual values at `node`, updating regrets/averages when `update` is set. */
void solveNode(Engine& e, int node, const float* r1, const float* r2, float* v1, float* v2, const Update* update) {
  const uint8_t t = e.type[node];
  const int n1 = e.players[0].n, n2 = e.players[1].n;
  if (t == kFold || t == kShowdownTable || t == kShowdownRiver) {
    terminalValues(e, node, 0, r2, v1);
    terminalValues(e, node, 1, r1, v2);
    return;
  }

  const size_t mark = e.arena.top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    float* cr1 = e.arena.take(n1);
    float* cr2 = e.arena.take(n2);
    float* cv1 = e.arena.take(n1);
    float* cv2 = e.arena.take(n2);
    std::fill(v1, v1 + n1, 0.0f);
    std::fill(v2, v2 + n2, 0.0f);
    for (int c = 0; c < count; c++) {
      const uint8_t card = e.childCard[start + c];
      const float w = e.childWeight[start + c];
      std::copy(r1, r1 + n1, cr1);
      std::copy(r2, r2 + n2, cr2);
      zeroWithCard(e.players[0], card, cr1);
      zeroWithCard(e.players[1], card, cr2);
      solveNode(e, e.children[start + c], cr1, cr2, cv1, cv2, update);
      zeroWithCard(e.players[0], card, cv1);
      zeroWithCard(e.players[1], card, cv2);
      for (int i = 0; i < n1; i++) v1[i] += w * cv1[i];
      for (int j = 0; j < n2; j++) v2[j] += w * cv2[j];
    }
    e.arena.top = mark;
    return;
  }

  // Decision node.
  const int actor = t;  // kDecisionP1 = 0, kDecisionP2 = 1
  const int nA = actor == 0 ? n1 : n2, nO = actor == 0 ? n2 : n1;
  const float* rA = actor == 0 ? r1 : r2;
  const float* rO = actor == 0 ? r2 : r1;
  float* vA = actor == 0 ? v1 : v2;
  float* vO = actor == 0 ? v2 : v1;
  float* regret = e.regret.data() + e.storage[node];

  float* sigma = e.arena.take(static_cast<size_t>(count) * nA);
  float* actionValues = e.arena.take(static_cast<size_t>(count) * nA);
  float* childReach = e.arena.take(nA);
  float* otherValues = e.arena.take(nO);
  regretMatch(regret, count, nA, sigma, childReach);

  std::fill(vA, vA + nA, 0.0f);
  std::fill(vO, vO + nO, 0.0f);
  for (int a = 0; a < count; a++) {
    const float* s = sigma + static_cast<size_t>(a) * nA;
    float* av = actionValues + static_cast<size_t>(a) * nA;
    for (int i = 0; i < nA; i++) childReach[i] = rA[i] * s[i];
    if (actor == 0) solveNode(e, e.children[start + a], childReach, rO, av, otherValues, update);
    else solveNode(e, e.children[start + a], rO, childReach, otherValues, av, update);
    for (int j = 0; j < nO; j++) vO[j] += otherValues[j];
    for (int i = 0; i < nA; i++) vA[i] += s[i] * av[i];
  }

  if (update) {
    float* sum = e.stratSum.data() + e.storage[node];
    const float pos = update->positiveDiscount, weight = update->strategyWeight;
    for (int a = 0; a < count; a++) {
      float* r = regret + static_cast<size_t>(a) * nA;
      float* ss = sum + static_cast<size_t>(a) * nA;
      const float* av = actionValues + static_cast<size_t>(a) * nA;
      const float* s = sigma + static_cast<size_t>(a) * nA;
      for (int i = 0; i < nA; i++) {
        const float x = r[i] + av[i] - vA[i];
        r[i] = x * (x > 0 ? pos : kNegativeRegretDiscount);
        ss[i] += weight * rA[i] * s[i];
      }
    }
  }
  e.arena.top = mark;
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

  const size_t mark = e.arena.top;
  const int start = e.childStart[node], count = e.childCount[node];

  if (t == kChance) {
    float* childOpp = e.arena.take(nO);
    float* childValues = e.arena.take(nS);
    std::fill(out, out + nS, 0.0f);
    for (int c = 0; c < count; c++) {
      const uint8_t card = e.childCard[start + c];
      std::copy(oppReach, oppReach + nO, childOpp);
      zeroWithCard(e.players[1 - p], card, childOpp);
      evaluateNode(e, e.children[start + c], p, bestResponse, childOpp, childValues);
      zeroWithCard(self, card, childValues);
      const float w = e.childWeight[start + c];
      for (int i = 0; i < nS; i++) out[i] += w * childValues[i];
    }
    e.arena.top = mark;
    return;
  }

  const int actor = t;
  const int nA = e.players[actor].n;
  float* sigma = e.arena.take(static_cast<size_t>(count) * nA);
  float* scratch = e.arena.take(std::max(nA, nO));
  float* childValues = e.arena.take(nS);
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
  e.arena.top = mark;
}

/** Scratch floats a subtree needs at most (both traversals), so the arena never reallocates. */
size_t scratchNeed(const Engine& e, int node, size_t widest) {
  const uint8_t t = e.type[node];
  if (t != kChance && t != kDecisionP1 && t != kDecisionP2) return 0;
  const int start = e.childStart[node], count = e.childCount[node];
  const size_t local = t == kChance ? 4 * widest : (2 * static_cast<size_t>(count) + 3) * widest;
  size_t deepest = 0;
  for (int c = 0; c < count; c++) deepest = std::max(deepest, scratchNeed(e, e.children[start + c], widest));
  return local + deepest;
}

bool isAverageResetIteration(int t) { return t > 1 && (t & (t - 1)) == 0 && (__builtin_ctz(t) % 2 == 0); }

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
  e->arena.data.assign(scratchNeed(*e, 0, widest) + 4 * widest, 0.0f);
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

/** Runs DCFR iterations t = firstT .. firstT + count - 1 (t counts from 1). */
void eng_iterate(Engine* e, int firstT, int count) {
  const int n1 = e->players[0].n, n2 = e->players[1].n;
  float* v1 = e->arena.take(n1);
  float* v2 = e->arena.take(n2);
  for (int t = firstT; t < firstT + count; t++) {
    if (isAverageResetIteration(t)) std::fill(e->stratSum.begin(), e->stratSum.end(), 0.0f);
    const double tAlpha = std::pow(static_cast<double>(t), kAlpha);
    const Update update{static_cast<float>(tAlpha / (tAlpha + 1)), static_cast<float>(std::pow(static_cast<double>(t), kGamma))};
    solveNode(*e, 0, e->players[0].weights.data(), e->players[1].weights.data(), v1, v2, &update);
  }
  e->arena.top = 0;
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
      e->arena.top = 0;
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
