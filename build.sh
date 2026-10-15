#!/usr/bin/env bash
# Builds the ES module + wasm from the engine sources.
#   ENGINESRC defaults to ../leptris/src (sibling checkout)
# Engine sources include each other through paths relative to
# CMake's per-subsystem include set — mirror it. The AVX2/NEON
# accelerated TUs are platform-gated in CMake and excluded here
# (the scalar simd_text.c dispatch builds everywhere).
set -euo pipefail
cd "$(dirname "$0")"
ENGINESRC="${ENGINESRC:-../leptris/src}"
VERSION="${LEPTRIS_VERSION:-1.9.366}"
mkdir -p dist
INC="-I$ENGINESRC/include -I$ENGINESRC \
 -I$ENGINESRC/leptris/dom -I$ENGINESRC/leptris/parse \
 -I$ENGINESRC/leptris/serialize -I$ENGINESRC/leptris/xpath \
 -I$ENGINESRC/leptris/encoding -I$ENGINESRC/leptris/memory \
 -I$ENGINESRC/leptris/flat -I$ENGINESRC/leptris/unicode"
SOURCES=$(ls "$ENGINESRC"/leptris/*.c "$ENGINESRC"/leptris/*/*.c \
  | grep -v -E 'simd_text_(avx2|neon)\.c|leptris/unicode/unicode\.c|leptris/encoding/encoding\.c')
emcc -O3 -std=c99 \
  $INC \
  -DLEPTRIS_VERSION="\"$VERSION\"" \
  -D_POSIX_C_SOURCE=200809L \
  src/leptris_wasm.c \
  $SOURCES \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,node \
  -s EXPORTED_RUNTIME_METHODS="['UTF8ToString','stringToUTF8','lengthBytesUTF8','HEAPU8','HEAP32']" \
  -s EXPORTED_FUNCTIONS='["_leptris_wasm_tree","_leptris_wasm_load","_leptris_wasm_xml","_leptris_wasm_xml_len","_leptris_wasm_xpath","_leptris_wasm_close","_leptris_wasm_free_str","_leptris_wasm_last_error","_leptris_wasm_last_error_position","_leptris_wasm_version","_malloc","_free"]' \
  -s WASM_BIGINT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o dist/leptris.mjs
ls -la dist/
