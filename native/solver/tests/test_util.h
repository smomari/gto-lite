// Minimal test helpers for native/solver tests — no external framework.
#pragma once
#include <cstdint>
#include <cstdio>

inline int& testFailures() {
  static int failures = 0;
  return failures;
}

#define CHECK(cond, ...)                                     \
  do {                                                       \
    if (!(cond)) {                                           \
      std::fprintf(stderr, "FAIL %s:%d: ", __FILE__, __LINE__); \
      std::fprintf(stderr, __VA_ARGS__);                     \
      std::fprintf(stderr, "\n");                            \
      testFailures()++;                                      \
    }                                                        \
  } while (0)

inline int testResult() {
  if (testFailures() > 0) {
    std::fprintf(stderr, "%d check(s) failed\n", testFailures());
    return 1;
  }
  std::printf("all checks passed\n");
  return 0;
}

/** Deterministic xorshift generator, so failures reproduce. */
struct Rng {
  uint32_t state;
  explicit Rng(uint32_t seed) : state(seed * 2654435761u + 1) {}
  uint32_t next() {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state;
  }
  int below(int n) { return static_cast<int>(next() % static_cast<uint32_t>(n)); }
  double unit() { return (next() >> 8) / 16777216.0; }
};
