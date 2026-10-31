// native/solver/engine.cpp: terminal values against brute-force pair sums
// (checked through the EVs eng_exploitability reports), chance nodes, and DCFR
// convergence on a small river game.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

#include "test_util.h"

struct Engine;
extern "C" {
Engine* eng_create(int nodeCount, const uint8_t* type, const int32_t* childStart, const uint8_t* childCount,
                   const float* pot, const float* committed1, const float* committed2, const int32_t* aux,
                   int childSlots, const int32_t* children, const uint8_t* childCard, const float* childWeight,
                   int heroCount, const uint8_t* heroCards, const float* heroWeights, int villainCount,
                   const uint8_t* villainCards, const float* villainWeights);
void eng_destroy(Engine* e);
int eng_add_equity_table(Engine* e, const float* heroEquity);
int eng_add_river_board(Engine* e, const uint32_t* heroStrength, const uint32_t* villainStrength);
void eng_iterate(Engine* e, int firstT, int count);
void eng_exploitability(Engine* e, double* out);
void eng_node_ev(Engine* e, int node, const float* reach1, const float* reach2, double* out);
void eng_average_strategy(Engine* e, int node, float* out);
void eng_partition(Engine* e, int leafCount, const int32_t* leafNodes);
void eng_lock_strategy(Engine* e, int node, const float* strategy);
int eng_set_threads(Engine* e, int threads);
void eng_iterate_parallel(Engine* e, int firstT, int count);
void eng_exploitability_parallel(Engine* e, double* out);
}

namespace {

enum : uint8_t { P1 = 0, P2 = 1, FOLD = 2, TABLE = 3, RIVER = 4, CHANCE = 5 };

/** A tree under construction, node 0 = root. */
struct Tree {
  std::vector<uint8_t> type, childCount;
  std::vector<int32_t> childStart, aux, children;
  std::vector<float> pot, c1, c2, childWeight;
  std::vector<uint8_t> childCard;
  std::vector<std::vector<int>> pending;  // children per node, added before flattening

  int add(uint8_t t, float potSize, float committed1, float committed2, int auxValue = 0) {
    type.push_back(t);
    pot.push_back(potSize);
    c1.push_back(committed1);
    c2.push_back(committed2);
    aux.push_back(auxValue);
    pending.emplace_back();
    return static_cast<int>(type.size()) - 1;
  }
  std::vector<std::vector<std::pair<uint8_t, float>>> pendingChance;
  void link(int parent, int child, uint8_t card = 255, float weight = 0) {
    pending[parent].push_back(child);
    if (pendingChance.size() < pending.size()) pendingChance.resize(pending.size());
    pendingChance[parent].push_back({card, weight});
  }
  void flatten() {
    pendingChance.resize(pending.size());
    for (size_t n = 0; n < pending.size(); n++) {
      childStart.push_back(static_cast<int32_t>(children.size()));
      childCount.push_back(static_cast<uint8_t>(pending[n].size()));
      for (size_t k = 0; k < pending[n].size(); k++) {
        children.push_back(pending[n][k]);
        childCard.push_back(pendingChance[n][k].first);
        childWeight.push_back(pendingChance[n][k].second);
      }
    }
  }
};

struct Range {
  std::vector<uint8_t> cards;
  std::vector<float> weights;
  int n() const { return static_cast<int>(weights.size()); }
  bool holds(int i, int card) const { return cards[i * 2] == card || cards[i * 2 + 1] == card; }
};

bool shares(const Range& a, int i, const Range& b, int j) {
  return b.holds(j, a.cards[i * 2]) || b.holds(j, a.cards[i * 2 + 1]);
}

/** Distinct combos over cards [0, deck), avoiding `excluded`. */
Range randomRange(Rng& rng, int count, int deck, const std::vector<int>& excluded = {}) {
  Range r;
  std::vector<bool> used(52 * 52, false);
  while (r.n() < count) {
    const int a = rng.below(deck), b = rng.below(deck);
    bool bad = a == b || used[a * 52 + b];
    for (int x : excluded) bad = bad || a == x || b == x;
    if (bad) continue;
    used[a * 52 + b] = used[b * 52 + a] = true;
    r.cards.push_back(static_cast<uint8_t>(a));
    r.cards.push_back(static_cast<uint8_t>(b));
    r.weights.push_back(rng.below(4) == 0 ? 0.3f : 0.5f + 0.5f * static_cast<float>(rng.unit()));
  }
  return r;
}

Engine* build(Tree& t, const Range& hero, const Range& villain) {
  t.flatten();
  return eng_create(static_cast<int>(t.type.size()), t.type.data(), t.childStart.data(), t.childCount.data(),
                    t.pot.data(), t.c1.data(), t.c2.data(), t.aux.data(), static_cast<int>(t.children.size()),
                    t.children.data(), t.childCard.data(), t.childWeight.data(), hero.n(), hero.cards.data(),
                    hero.weights.data(), villain.n(), villain.cards.data(), villain.weights.data());
}

/** Hand strength as a function of the two hole cards, as on a real board: same cards, same strength. */
std::vector<uint32_t> strengths(const Range& r, const std::vector<uint32_t>& byPair) {
  std::vector<uint32_t> out(r.n());
  for (int i = 0; i < r.n(); i++) {
    const int a = r.cards[i * 2], b = r.cards[i * 2 + 1];
    out[i] = byPair[std::min(a, b) * 52 + std::max(a, b)];
  }
  return out;
}

std::vector<uint32_t> randomPairStrengths(Rng& rng, int distinct) {
  std::vector<uint32_t> byPair(52 * 52);
  for (auto& s : byPair) s = static_cast<uint32_t>(rng.below(distinct));
  return byPair;
}

double pairMass(const Range& hero, const Range& villain) {
  double z = 0;
  for (int i = 0; i < hero.n(); i++)
    for (int j = 0; j < villain.n(); j++)
      if (!shares(hero, i, villain, j)) z += static_cast<double>(hero.weights[i]) * villain.weights[j];
  return z;
}

void checkRiverShowdownRoot() {
  Rng rng(11);
  const Range hero = randomRange(rng, 40, 30), villain = randomRange(rng, 55, 30);
  const auto byPair = randomPairStrengths(rng, 12);  // few distinct strengths → many ties
  const auto hs = strengths(hero, byPair), vs = strengths(villain, byPair);
  // 4 already in from each player (so the starting pot was 2): payoff = 10 × share − 4.
  Tree t;
  t.add(RIVER, 10, 4, 4, 0);
  Engine* e = build(t, hero, villain);
  eng_add_river_board(e, hs.data(), vs.data());
  double out[6];
  eng_exploitability(e, out);

  double share = 0;
  for (int i = 0; i < hero.n(); i++)
    for (int j = 0; j < villain.n(); j++) {
      if (shares(hero, i, villain, j)) continue;
      const double w = static_cast<double>(hero.weights[i]) * villain.weights[j];
      share += w * (hs[i] > vs[j] ? 1 : hs[i] == vs[j] ? 0.5 : 0);
    }
  const double expected = 10 * share / pairMass(hero, villain) - 4;
  CHECK(std::fabs(out[4] - expected) < 1e-4, "river showdown EV %.6f, brute force %.6f", out[4], expected);
  CHECK(std::fabs(out[4] + out[5] - 2) < 1e-4, "EVs should sum to the starting pot: %.6f", out[4] + out[5]);
  CHECK(std::fabs(out[0]) < 1e-5, "a lone terminal has nothing to exploit: %.3g", out[0]);
  std::printf("  river showdown root          EV %.6f (brute force %.6f)\n", out[4], expected);
  eng_destroy(e);
}

void checkTableShowdownAndFold() {
  Rng rng(12);
  const Range hero = randomRange(rng, 33, 40), villain = randomRange(rng, 21, 40);
  std::vector<float> eq(static_cast<size_t>(hero.n()) * villain.n());
  for (int i = 0; i < hero.n(); i++)
    for (int j = 0; j < villain.n(); j++) eq[i * villain.n() + j] = shares(hero, i, villain, j) ? 0 : static_cast<float>(rng.unit());

  // Root P1: fold (P2 wins) or check to a table showdown with 3 committed each.
  Tree t;
  const int root = t.add(P1, 6, 0, 0);
  const int fold = t.add(FOLD, 6, 0, 0, 1);
  const int showdown = t.add(TABLE, 12, 3, 3, 0);
  t.link(root, fold);
  t.link(root, showdown);
  Engine* e = build(t, hero, villain);
  eng_add_equity_table(e, eq.data());
  eng_iterate(e, 1, 300);

  // P1's best response picks per combo between folding (0) and showing down.
  double br = 0;
  for (int i = 0; i < hero.n(); i++) {
    double value = 0, mass = 0;
    for (int j = 0; j < villain.n(); j++) {
      if (shares(hero, i, villain, j)) continue;
      value += villain.weights[j] * (12.0 * eq[i * villain.n() + j] - 3);
      mass += villain.weights[j];
    }
    br += hero.weights[i] * std::max(0.0, value);
    (void)mass;
  }
  br /= pairMass(hero, villain);
  double out[6];
  eng_exploitability(e, out);
  CHECK(std::fabs(out[2] - br) < 1e-4, "P1 best response %.6f, brute force %.6f", out[2], br);
  // P1 is the only one deciding: after 300 iterations the average is (nearly) that best response.
  CHECK(out[2] - out[4] < 1e-3, "P1 average strategy should be near its best response: %.6f vs %.6f", out[4], out[2]);
  std::printf("  table showdown + fold         BR %.6f (brute force %.6f), EV %.6f\n", out[2], br, out[4]);
  eng_destroy(e);
}

void checkChance() {
  Rng rng(13);
  // Cards 0..19 for hands; the chance node deals one of cards 0..3, so some combos are blocked per branch.
  const Range hero = randomRange(rng, 25, 20), villain = randomRange(rng, 25, 20);
  const int dealt[3] = {0, 1, 2};
  std::vector<std::vector<uint32_t>> hs, vs;
  for (int c = 0; c < 3; c++) {
    const auto byPair = randomPairStrengths(rng, 8);
    hs.push_back(strengths(hero, byPair));
    vs.push_back(strengths(villain, byPair));
  }
  Tree t;
  const int root = t.add(CHANCE, 8, 0, 0);
  for (int c = 0; c < 3; c++) t.link(root, t.add(RIVER, 8, 0, 0, c), static_cast<uint8_t>(dealt[c]), 1.0f / 3);
  Engine* e = build(t, hero, villain);
  for (int c = 0; c < 3; c++) eng_add_river_board(e, hs[c].data(), vs[c].data());
  double out[6];
  eng_exploitability(e, out);

  double value = 0;
  for (int c = 0; c < 3; c++)
    for (int i = 0; i < hero.n(); i++)
      for (int j = 0; j < villain.n(); j++) {
        if (shares(hero, i, villain, j) || hero.holds(i, dealt[c]) || villain.holds(j, dealt[c])) continue;
        const double share = hs[c][i] > vs[c][j] ? 1 : hs[c][i] == vs[c][j] ? 0.5 : 0;
        value += static_cast<double>(hero.weights[i]) * villain.weights[j] * 8 * share / 3;
      }
  const double expected = value / pairMass(hero, villain);
  CHECK(std::fabs(out[4] - expected) < 1e-4, "chance EV %.6f, brute force %.6f", out[4], expected);
  std::printf("  chance over 3 river cards     EV %.6f (brute force %.6f)\n", out[4], expected);
  eng_destroy(e);
}

/** Check/bet river game: exploitability must fall to a small fraction of the pot. */
void checkConvergence() {
  Rng rng(14);
  const Range hero = randomRange(rng, 60, 52), villain = randomRange(rng, 70, 52);
  const auto byPair = randomPairStrengths(rng, 1000);
  const auto hs = strengths(hero, byPair), vs = strengths(villain, byPair);
  const float pot = 10, bet = 7;
  Tree t;
  const int root = t.add(P1, pot, 0, 0);
  const int afterCheck = t.add(P2, pot, 0, 0);
  const int checkCheck = t.add(RIVER, pot, 0, 0, 0);
  const int p2Bets = t.add(P1, pot + bet, 0, bet);
  const int p1FoldsToBet = t.add(FOLD, pot + bet, 0, bet, 1);
  const int p1Calls = t.add(RIVER, pot + 2 * bet, bet, bet, 0);
  const int p1Bets = t.add(P2, pot + bet, bet, 0);
  const int p2Folds = t.add(FOLD, pot + bet, bet, 0, 0);
  const int p2Calls = t.add(RIVER, pot + 2 * bet, bet, bet, 0);
  t.link(root, afterCheck);
  t.link(root, p1Bets);
  t.link(afterCheck, checkCheck);
  t.link(afterCheck, p2Bets);
  t.link(p2Bets, p1FoldsToBet);
  t.link(p2Bets, p1Calls);
  t.link(p1Bets, p2Folds);
  t.link(p1Bets, p2Calls);
  Engine* e = build(t, hero, villain);
  eng_add_river_board(e, hs.data(), vs.data());

  double out[6];
  eng_exploitability(e, out);
  const double initial = out[1];
  eng_iterate(e, 1, 2000);
  eng_exploitability(e, out);
  CHECK(out[1] < 0.3, "exploitability after 2000 iterations %.4f%% of pot (started at %.2f%%)", out[1], initial);
  CHECK(std::fabs(out[4] + out[5] - pot) < 1e-3, "EVs should sum to the starting pot: %.6f", out[4] + out[5]);

  // At the root with the starting weights, the node EV is the exploitability report's EV.
  double nodeEv[2];
  eng_node_ev(e, root, hero.weights.data(), villain.weights.data(), nodeEv);
  CHECK(std::fabs(nodeEv[0] - out[4]) < 1e-5 && std::fabs(nodeEv[1] - out[5]) < 1e-5,
        "root node EV (%.6f, %.6f) vs report (%.6f, %.6f)", nodeEv[0], nodeEv[1], out[4], out[5]);

  std::vector<float> strategy(static_cast<size_t>(hero.n()) * 2);
  eng_average_strategy(e, root, strategy.data());
  bool normalized = true;
  for (int i = 0; i < hero.n(); i++) normalized = normalized && std::fabs(strategy[i * 2] + strategy[i * 2 + 1] - 1) < 1e-5;
  CHECK(normalized, "average strategy rows should sum to 1");
  std::printf("  river check/bet game          exploitability %.2f%% → %.4f%% of pot\n", initial, out[1]);
  eng_destroy(e);
}

/**
 * A check/bet street ending in chance nodes over three cards, each followed by
 * a check/bet river game: the pool must reproduce the one-thread solve, and
 * this runs it under AddressSanitizer with every thread on its own arena.
 */
void checkThreads() {
  Rng rng(15);
  const Range hero = randomRange(rng, 30, 20), villain = randomRange(rng, 30, 20);
  const uint8_t dealt[3] = {0, 1, 2};
  const float weight = 1.0f / 3, bet = 5;
  std::vector<std::vector<uint32_t>> hs, vs;
  for (int c = 0; c < 3; c++) {
    const auto byPair = randomPairStrengths(rng, 12);
    hs.push_back(strengths(hero, byPair));
    vs.push_back(strengths(villain, byPair));
  }

  Tree t;
  std::vector<int32_t> leaves;
  const auto riverGame = [&t, bet](float pot, float committed, int board) {
    const int p1 = t.add(P1, pot, committed, committed);
    const int p1Bets = t.add(P2, pot + bet, committed + bet, committed);
    t.link(p1, t.add(RIVER, pot, committed, committed, board));
    t.link(p1, p1Bets);
    t.link(p1Bets, t.add(FOLD, pot + bet, committed + bet, committed, 0));
    t.link(p1Bets, t.add(RIVER, pot + 2 * bet, committed + bet, committed + bet, board));
    return p1;
  };
  const auto chance = [&](float pot, float committed) {
    const int node = t.add(CHANCE, pot, committed, committed);
    for (int c = 0; c < 3; c++) {
      const int leaf = riverGame(pot, committed, c);
      t.link(node, leaf, dealt[c], weight);
      leaves.push_back(leaf);
    }
    return node;
  };
  const float pot = 10;
  const int root = t.add(P1, pot, 0, 0);
  const int p1Bets = t.add(P2, pot + bet, bet, 0);
  t.link(root, chance(pot, 0));
  t.link(root, p1Bets);
  t.link(p1Bets, t.add(FOLD, pot + bet, bet, 0, 0));
  t.link(p1Bets, chance(pot + 2 * bet, bet));

  Tree copy = t, lockedTree = t;  // flatten() is one-shot
  Engine* whole = build(t, hero, villain);
  Engine* threaded = build(copy, hero, villain);
  for (int c = 0; c < 3; c++) {
    eng_add_river_board(whole, hs[c].data(), vs[c].data());
    eng_add_river_board(threaded, hs[c].data(), vs[c].data());
  }
  eng_partition(threaded, static_cast<int>(leaves.size()), leaves.data());
  const int threads = eng_set_threads(threaded, 3);
  CHECK(threads == 3, "expected 3 threads, got %d", threads);

  double a[6], b[6];
  eng_iterate(whole, 1, 70);
  eng_iterate_parallel(threaded, 1, 70);
  eng_exploitability(whole, a);
  eng_exploitability_parallel(threaded, b);
  for (int k = 0; k < 6; k++) CHECK(std::fabs(a[k] - b[k]) < 1e-5, "report[%d]: one thread %.6f, three %.6f", k, a[k], b[k]);

  std::vector<float> sa(static_cast<size_t>(hero.n()) * 2), sb(sa.size());
  eng_average_strategy(whole, root, sa.data());
  eng_average_strategy(threaded, root, sb.data());
  CHECK(sa == sb, "root strategy differs between one thread and three");
  std::printf("  3 threads = 1 thread          exploitability %.4f%% of pot\n", b[1]);

  // Locked to always checking the root: the node keeps that strategy, the
  // best response can't leave it, and the locked player can't gain from it.
  Engine* locked = build(lockedTree, hero, villain);
  for (int c = 0; c < 3; c++) eng_add_river_board(locked, hs[c].data(), vs[c].data());
  eng_partition(locked, static_cast<int>(leaves.size()), leaves.data());
  std::vector<float> alwaysCheck(sa.size(), 0.0f);
  for (int i = 0; i < hero.n(); i++) alwaysCheck[static_cast<size_t>(i) * 2] = 1;
  eng_lock_strategy(locked, root, alwaysCheck.data());
  eng_iterate_parallel(locked, 1, 3000);
  double c[6];
  eng_exploitability_parallel(locked, c);
  std::vector<float> sc(sa.size());
  eng_average_strategy(locked, root, sc.data());
  CHECK(sc == alwaysCheck, "locked root should report the locked strategy");
  CHECK(c[1] < 0.5, "locked game exploitability %.4f%% of pot", c[1]);
  eng_iterate(whole, 71, 2930);
  eng_exploitability(whole, a);
  CHECK(c[4] < a[4] + 0.02, "locked EV %.4f above free EV %.4f", c[4], a[4]);
  std::printf("  locked root                   EV %.4f (free %.4f), exploitability %.4f%% of pot\n", c[4], a[4], c[1]);
  eng_destroy(locked);
  eng_destroy(whole);
  eng_destroy(threaded);
}

}  // namespace

int main() {
  checkRiverShowdownRoot();
  checkTableShowdownAndFold();
  checkChance();
  checkConvergence();
  checkThreads();
  return testResult();
}
