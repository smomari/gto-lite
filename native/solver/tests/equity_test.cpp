// native/solver/equity.cpp against a direct per-slot count.
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <vector>

#include "test_util.h"

struct EquityContext;
extern "C" {
EquityContext* eq_create(int heroCount, const uint8_t* heroCards, const uint16_t* heroStrength, int villainCount,
                         const uint8_t* villainCards, const uint16_t* villainStrength);
void eq_destroy(EquityContext* ctx);
void eq_table(EquityContext* ctx, int slotCount, const uint16_t* slots, float unavailable, float* out);
}

namespace {

constexpr int kSlots = 1326;

struct Side {
  std::vector<uint8_t> cards;
  std::vector<uint16_t> strength;
  int n = 0;
};

/** Random combos with random strengths; ~10% of each combo's slots invalid (0), as when a runout uses its cards. */
Side randomSide(Rng& rng, int n) {
  Side s;
  s.n = n;
  while (static_cast<int>(s.cards.size()) < n * 2) {
    const int a = rng.below(52), b = rng.below(52);
    if (a == b) continue;
    s.cards.push_back(static_cast<uint8_t>(a));
    s.cards.push_back(static_cast<uint8_t>(b));
  }
  s.strength.resize(static_cast<size_t>(n) * kSlots);
  for (auto& x : s.strength) x = rng.below(10) == 0 ? 0 : static_cast<uint16_t>(1 + rng.below(40));  // few levels → ties
  return s;
}

void check(const char* name, int slotCount, uint32_t seed) {
  Rng rng(seed);
  const Side hero = randomSide(rng, 23), villain = randomSide(rng, 31);
  std::vector<uint16_t> slots(slotCount);
  for (auto& s : slots) s = static_cast<uint16_t>(rng.below(kSlots));
  EquityContext* ctx = eq_create(hero.n, hero.cards.data(), hero.strength.data(), villain.n, villain.cards.data(), villain.strength.data());
  std::vector<float> out(static_cast<size_t>(hero.n) * villain.n);
  eq_table(ctx, slotCount, slots.data(), -1.0f, out.data());

  double maxDiff = 0;
  for (int i = 0; i < hero.n; i++) {
    for (int j = 0; j < villain.n; j++) {
      const uint8_t* a = &hero.cards[i * 2];
      const uint8_t* b = &villain.cards[j * 2];
      const bool shared = a[0] == b[0] || a[0] == b[1] || a[1] == b[0] || a[1] == b[1];
      double wins = 0, count = 0;
      for (const uint16_t slot : slots) {
        const int h = hero.strength[i * kSlots + slot], v = villain.strength[j * kSlots + slot];
        if (h == 0 || v == 0) continue;
        count++;
        wins += h > v ? 1 : h == v ? 0.5 : 0;
      }
      const double expected = shared || count == 0 ? -1 : wins / count;
      maxDiff = std::fmax(maxDiff, std::fabs(out[i * villain.n + j] - expected));
    }
  }
  CHECK(maxDiff < 1e-6, "%s: max |diff| %.3g", name, maxDiff);
  std::printf("  %-28s max |diff| %.2e\n", name, maxDiff);
  eq_destroy(ctx);
}

}  // namespace

int main() {
  check("1 slot", 1, 1);
  check("7 slots (scalar-sized)", 7, 2);
  check("44 slots (a turn's rivers)", 44, 3);
  check("1081 slots (a flop's runouts)", 1081, 4);
  return testResult();
}
