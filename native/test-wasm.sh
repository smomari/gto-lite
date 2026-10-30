#!/bin/sh
# Builds each native/solver/tests/*_test.cpp together with the solver sources
# as WASM (same SIMD code path the app runs) with AddressSanitizer + UBSan,
# and runs it under Node.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v em++ > /dev/null 2>&1; then
  # shellcheck disable=SC1091
  . "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" > /dev/null 2>&1 || true
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SOURCES="$ROOT/native/solver/engine.cpp $ROOT/native/solver/equity.cpp"
status=0
for test in "$ROOT"/native/solver/tests/*_test.cpp; do
  name="$(basename "$test" .cpp)"
  echo "$name"
  # shellcheck disable=SC2086
  em++ "$test" $SOURCES -O1 -g -msimd128 -std=c++20 -fsanitize=address,undefined -fno-sanitize-recover=all \
    -sALLOW_MEMORY_GROWTH -sENVIRONMENT=node -o "$TMP/$name.js" 2>&1 | grep -v '^shared:INFO' || true
  node "$TMP/$name.js" || status=1
done
exit $status
