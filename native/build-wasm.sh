#!/bin/sh
# Builds native/solver/*.cpp into the committed WASM modules under
# lib/postflopSolver/wasm/ (Vercel has no Emscripten, so the outputs are
# checked in — `npm run check:wasm` verifies they match these sources):
#   solver.web.mjs           browser Web Workers, one thread (pages that aren't cross-origin isolated)
#   solver.web-threads.mjs   browser Web Workers with a pthread pool (the app, under COOP/COEP)
#   solver.node.mjs          Node, one thread (vitest, scripts/bench-postflop.ts)
#   solver.node-threads.mjs  Node with a pthread pool (vitest)
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

SOURCES="$ROOT/native/solver/engine.cpp $ROOT/native/solver/equity.cpp"
EXPORTS="_malloc,_free,_eng_create,_eng_destroy,_eng_add_equity_table,_eng_add_river_board,_eng_iterate,_eng_exploitability,_eng_node_ev,_eng_average_strategy,_eng_partition,_eng_set_threads,_eng_iterate_parallel,_eng_exploitability_parallel,_eng_trunk_chance_ev,_eq_create,_eq_destroy,_eq_table"
FLAGS="-O3 -msimd128 -std=c++20 -sMODULARIZE -sEXPORT_ES6 -sSINGLE_FILE -sALLOW_MEMORY_GROWTH -sMAXIMUM_MEMORY=4GB \
  -sEXPORTED_FUNCTIONS=$EXPORTS -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64"

mkdir -p "$OUT"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS -sENVIRONMENT=web,worker -o "$OUT/solver.web.mjs"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS -sENVIRONMENT=node -o "$OUT/solver.node.mjs"
# The pool's workers start with the module (a blocked thread can't spawn one later), sized by the caller.
THREADS="-pthread -sPTHREAD_POOL_SIZE=Module.pthreadPoolSize||0 -Wno-pthreads-mem-growth"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS $THREADS -sENVIRONMENT=web,worker -o "$OUT/solver.web-threads.mjs"
# shellcheck disable=SC2086
em++ $SOURCES $FLAGS $THREADS -sENVIRONMENT=node -o "$OUT/solver.node-threads.mjs"

# The web build computes a script directory it never uses (SINGLE_FILE has no
# separate .wasm to locate), as `new URL(".", _scriptName)`, which Turbopack
# reports as an unresolvable asset. Drop that dead statement — and fail loudly
# if a different Emscripten version stops emitting it in exactly this form.
DEAD='try{new URL(".",_scriptName).href}catch{}'
replace_once() {
  node -e '
const fs = require("fs");
const [file, from, to] = process.argv.slice(1);
const src = fs.readFileSync(file, "utf8");
const count = src.split(from).length - 1;
if (count !== 1) { console.error(`expected 1 copy of ${from} in ${file}, found ${count}`); process.exit(1); }
fs.writeFileSync(file, src.replace(from, to));
' "$1" "$2" "$3"
}
replace_once "$OUT/solver.web.mjs" "$DEAD" ""
replace_once "$OUT/solver.web-threads.mjs" "$DEAD" ""
# The threaded web build starts each pool worker as `new Worker(new URL(<itself>))`,
# which Turbopack follows into itself forever when building. Have it ask the page
# for its workers instead (loadWeb.ts passes createPthreadWorker, starting
# pthreadEntry.ts, which just imports the module to run its pthread bootstrap).
replace_once "$OUT/solver.web-threads.mjs" \
  'worker=new Worker(new URL("solver.web-threads.mjs",import.meta.url),{type:"module",name:"em-pthread"})' \
  'worker=Module["createPthreadWorker"]()'

echo "built solver.{web,web-threads,node,node-threads}.mjs in $OUT (emcc $ACTUAL)"
