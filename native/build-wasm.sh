#!/bin/sh
# Builds native/solver/*.cpp into the two committed WASM modules under
# lib/postflopSolver/wasm/ (Vercel has no Emscripten, so the outputs are
# checked in — `npm run check:wasm` verifies they match these sources):
#   solver.web.mjs   browser Web Workers (the app)
#   solver.node.mjs  Node (vitest, scripts/bench-postflop.ts)
# Both are single-file ES modules (the .wasm is embedded), so no bundler or
# server config is needed to locate it.
#
# Usage: native/build-wasm.sh [output-dir]   (default: lib/postflopSolver/wasm)
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/lib/postflopSolver/wasm}"
EXPECTED="$(cat "$ROOT/native/EMSDK_VERSION")"

if ! command -v emcc > /dev/null 2>&1; then
  # shellcheck disable=SC1091
  . "${EMSDK:-$HOME/emsdk}/emsdk_env.sh" > /dev/null 2>&1 || true
fi
if ! command -v emcc > /dev/null 2>&1; then
  echo "emcc not found — install emsdk $EXPECTED (see README: C++/WASM 솔버 빌드)" >&2
  exit 1
fi
ACTUAL="$(emcc --version | head -1 | sed -E 's/.* ([0-9]+\.[0-9]+\.[0-9]+) .*/\1/')"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "emcc $ACTUAL found, but native/EMSDK_VERSION pins $EXPECTED — outputs would not match the committed ones" >&2
  exit 1
fi

SOURCES="$ROOT/native/solver/engine.cpp"
EXPORTS="_malloc,_free,_eng_create,_eng_destroy,_eng_add_equity_table,_eng_add_river_board,_eng_iterate,_eng_exploitability,_eng_average_strategy"
FLAGS="-O3 -msimd128 -std=c++20 -sMODULARIZE -sEXPORT_ES6 -sSINGLE_FILE -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=4GB \
  -sEXPORTED_FUNCTIONS=$EXPORTS -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,HEAPF32,HEAPF64"

mkdir -p "$OUT"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS -sENVIRONMENT=web,worker -o "$OUT/solver.web.mjs"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS -sENVIRONMENT=node -o "$OUT/solver.node.mjs"

# The web build computes a script directory it never uses (SINGLE_FILE has no
# separate .wasm to locate), as `new URL(".", _scriptName)`, which Turbopack
# reports as an unresolvable asset. Drop that dead statement — and fail loudly
# if a different Emscripten version stops emitting it in exactly this form.
DEAD='try{new URL(".",_scriptName).href}catch{}'
node -e '
const fs = require("fs");
const [file, dead] = process.argv.slice(1);
const src = fs.readFileSync(file, "utf8");
const count = src.split(dead).length - 1;
if (count !== 1) { console.error(`expected 1 copy of ${dead} in ${file}, found ${count}`); process.exit(1); }
fs.writeFileSync(file, src.replace(dead, ""));
' "$OUT/solver.web.mjs" "$DEAD"

echo "built $OUT/solver.web.mjs, $OUT/solver.node.mjs (emcc $ACTUAL)"
