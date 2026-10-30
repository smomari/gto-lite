// Hero-vs-villain runout equity tables for a flop board, from each combo's
// hand strength on every (turn, river) runout — the C++ counterpart of
// lib/postflopSolver/terminalEquity.ts's pair loop, which compares two
// combos' runout strengths and was most of building a flop table.
//
// Strengths are uint16 per (combo, runout slot), slot = pairIndex(turn, river)
// over the 52-card deck (1326 slots), bigger = better, 0 = not a runout for
// that combo (it uses the combo's or the board's cards). One table is the
// equity over a subset of slots: every runout for the flop itself, or the 44
// rivers under one turn card for that turn's table. A pair's equity counts the
// slots valid for both combos: (wins + ties / 2) / count.
#include <cstdint>
#include <vector>
#include <wasm_simd128.h>

namespace {

constexpr int kSlots = 1326;

struct EquityContext {
  int heroCount = 0, villainCount = 0;
  std::vector<uint8_t> heroCards, villainCards;
  std::vector<uint16_t> heroStrength, villainStrength;  // [combo * kSlots + slot]
};

bool shareCard(const uint8_t* a, const uint8_t* b) { return a[0] == b[0] || a[0] == b[1] || a[1] == b[0] || a[1] == b[1]; }

/** Gathers each combo's strengths at `slots` into a contiguous [combo * stride] array (stride = count rounded up to 8, zero-padded). */
std::vector<uint16_t> compact(const std::vector<uint16_t>& strength, int combos, const uint16_t* slots, int count, int stride) {
  std::vector<uint16_t> out(static_cast<size_t>(combos) * stride, 0);
  for (int c = 0; c < combos; c++) {
    const uint16_t* row = strength.data() + static_cast<size_t>(c) * kSlots;
    uint16_t* dst = out.data() + static_cast<size_t>(c) * stride;
    for (int k = 0; k < count; k++) dst[k] = row[slots[k]];
  }
  return out;
}

/** Wins, ties and shared valid slots between two compacted strength rows, 8 slots per SIMD step. */
inline void compareRows(const uint16_t* h, const uint16_t* v, int stride, int& wins, int& ties, int& count) {
  v128_t winAcc = wasm_i16x8_splat(0), tieAcc = wasm_i16x8_splat(0), countAcc = wasm_i16x8_splat(0);
  const v128_t zero = wasm_i16x8_splat(0);
  for (int k = 0; k < stride; k += 8) {
    const v128_t a = wasm_v128_load(h + k), b = wasm_v128_load(v + k);
    const v128_t valid = wasm_v128_and(wasm_i16x8_ne(a, zero), wasm_i16x8_ne(b, zero));
    // Masks are all-ones (-1) per lane, so subtracting them counts.
    countAcc = wasm_i16x8_sub(countAcc, valid);
    winAcc = wasm_i16x8_sub(winAcc, wasm_v128_and(valid, wasm_u16x8_gt(a, b)));
    tieAcc = wasm_i16x8_sub(tieAcc, wasm_v128_and(valid, wasm_i16x8_eq(a, b)));
  }
  // Each lane counts at most stride / 8 ≤ 166 slots, so int16 lanes never overflow.
  auto sum = [](v128_t x) {
    return wasm_i16x8_extract_lane(x, 0) + wasm_i16x8_extract_lane(x, 1) + wasm_i16x8_extract_lane(x, 2) +
           wasm_i16x8_extract_lane(x, 3) + wasm_i16x8_extract_lane(x, 4) + wasm_i16x8_extract_lane(x, 5) +
           wasm_i16x8_extract_lane(x, 6) + wasm_i16x8_extract_lane(x, 7);
  };
  wins = sum(winAcc);
  ties = sum(tieAcc);
  count = sum(countAcc);
}

}  // namespace

extern "C" {

EquityContext* eq_create(int heroCount, const uint8_t* heroCards, const uint16_t* heroStrength, int villainCount,
                         const uint8_t* villainCards, const uint16_t* villainStrength) {
  auto* ctx = new EquityContext();
  ctx->heroCount = heroCount;
  ctx->villainCount = villainCount;
  ctx->heroCards.assign(heroCards, heroCards + heroCount * 2);
  ctx->villainCards.assign(villainCards, villainCards + villainCount * 2);
  ctx->heroStrength.assign(heroStrength, heroStrength + static_cast<size_t>(heroCount) * kSlots);
  ctx->villainStrength.assign(villainStrength, villainStrength + static_cast<size_t>(villainCount) * kSlots);
  return ctx;
}

void eq_destroy(EquityContext* ctx) { delete ctx; }

/**
 * out[hero * villainCount + villain] = hero's equity over `slots`, or
 * `unavailable` for a pair that shares a card or has no runout in common
 * (e.g. a combo holding the turn card, for that turn's table).
 */
void eq_table(EquityContext* ctx, int slotCount, const uint16_t* slots, float unavailable, float* out) {
  const int stride = (slotCount + 7) / 8 * 8;
  const std::vector<uint16_t> hero = compact(ctx->heroStrength, ctx->heroCount, slots, slotCount, stride);
  const std::vector<uint16_t> villain = compact(ctx->villainStrength, ctx->villainCount, slots, slotCount, stride);
  for (int i = 0; i < ctx->heroCount; i++) {
    const uint8_t* hc = ctx->heroCards.data() + i * 2;
    const uint16_t* h = hero.data() + static_cast<size_t>(i) * stride;
    float* row = out + static_cast<size_t>(i) * ctx->villainCount;
    for (int j = 0; j < ctx->villainCount; j++) {
      if (shareCard(hc, ctx->villainCards.data() + j * 2)) {
        row[j] = unavailable;
        continue;
      }
      int wins, ties, count;
      compareRows(h, villain.data() + static_cast<size_t>(j) * stride, stride, wins, ties, count);
      row[j] = count > 0 ? (wins + 0.5f * ties) / count : unavailable;
    }
  }
}

}  // extern "C"
