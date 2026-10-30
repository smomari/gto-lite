#!/bin/sh
# Fails when the committed lib/postflopSolver/wasm/ modules don't match what
# native/build-wasm.sh produces from the current sources (the build is
# byte-for-byte reproducible for a fixed Emscripten version).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
"$ROOT/native/build-wasm.sh" "$TMP" > /dev/null
for f in solver.web.mjs solver.node.mjs; do
  if ! cmp -s "$TMP/$f" "$ROOT/lib/postflopSolver/wasm/$f"; then
    echo "lib/postflopSolver/wasm/$f is stale — run npm run build:wasm and commit the result" >&2
    exit 1
  fi
done
echo "wasm outputs up to date"
