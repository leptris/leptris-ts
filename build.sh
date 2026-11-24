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
# Version truth: read the engine's own project version out of its
# CMakeLists. The old hardcoded default leaked a stale number into
# published payloads (npm 0.1.66/0.1.67 shipped engine-432 content
# reporting leptris_version() == 1.9.390) — never default again.
ENGINE_ROOT="$(dirname "$ENGINESRC")"
VERSION="${LEPTRIS_VERSION:-$(grep -m1 '^    VERSION [0-9][0-9.]*' "$ENGINE_ROOT/CMakeLists.txt" 2>/dev/null | awk '{print $NF}' || true)}"
if [ -z "$VERSION" ]; then
  echo "cannot determine engine version from $ENGINE_ROOT/CMakeLists.txt" >&2
  exit 1
fi
# Stamp the ES module's VERSION export from the same single source —
# the hand-written constant used to drift independently (it shipped
# 1.9.421 while the wasm carried a different value).
STAMP="export const VERSION = \"$VERSION\";"
if grep -q '^export const VERSION = ' src/index.js; then
  tmp=$(mktemp)
  awk -v line="$STAMP" 'BEGIN{d=0} /^export const VERSION = /{if(!d){print line; d=1; next}} {print}' src/index.js > "$tmp" && mv "$tmp" src/index.js
else
  echo "src/index.js lost its VERSION export — stamping needs the anchor line" >&2
  exit 1
fi
mkdir -p dist
INC="-I$ENGINESRC/include -I$ENGINESRC \
 -I$ENGINESRC/leptris/dom -I$ENGINESRC/leptris/parse \
 -I$ENGINESRC/leptris/serialize -I$ENGINESRC/leptris/xpath \
 -I$ENGINESRC/leptris/encoding -I$ENGINESRC/leptris/memory \
 -I$ENGINESRC/leptris/flat -I$ENGINESRC/leptris/unicode"
SOURCES=$(ls "$ENGINESRC"/leptris/*.c "$ENGINESRC"/leptris/*/*.c \
  | grep -v -E 'simd_text_(avx2|neon)\.c|leptris/unicode/unicode\.c|leptris/encoding/encoding\.c')
# The validation faces (leptris-ts#92) recurse like the native engine
# expects to — xsd_compile's capture walks nested models with 4KB path
# buffers per frame, and schematron evaluates XPath per assert. The
# 64KB default wasm stack traps with "memory access out of bounds" on
# ordinary schemas; match a realistic native stack.
LEPTRIS_STACK_SIZE="${LEPTRIS_STACK_SIZE:-5242880}"
emcc -O3 -std=c99 \
  $INC \
  -DLEPTRIS_VERSION="\"$VERSION\"" \
  -D_POSIX_C_SOURCE=200809L \
  src/leptris_wasm.c \
  $SOURCES \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,node \
  -s EXPORTED_RUNTIME_METHODS="['UTF8ToString','stringToUTF8','lengthBytesUTF8','HEAPU8','HEAP32']" \
  -s EXPORTED_FUNCTIONS='["_leptris_wasm_tree","_leptris_wasm_load","_leptris_wasm_xml","_leptris_wasm_xml_len","_leptris_wasm_xpath","_leptris_wasm_xpath_full","_leptris_wasm_close","_leptris_wasm_free_str","_leptris_wasm_last_error","_leptris_wasm_last_error_position","_leptris_wasm_version","_malloc","_free","_leptris_wasm_create_element","_leptris_wasm_create_text","_leptris_wasm_set_attribute","_leptris_wasm_add_child","_leptris_wasm_set_root","_leptris_wasm_xsd_compile","_leptris_wasm_xsd_close","_leptris_wasm_xsd_error","_leptris_wasm_xsd_version","_leptris_wasm_xsd_declaration_count","_leptris_wasm_xsd_builtin_valid","_leptris_wasm_xsd_simple_valid","_leptris_wasm_xsd_validate","_leptris_wasm_xsd_error_report","_leptris_wasm_schematron_compile","_leptris_wasm_schematron_close","_leptris_wasm_schematron_error","_leptris_wasm_schematron_valid","_leptris_wasm_schematron_validate"]' \
  -s WASM_BIGINT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s STACK_SIZE="$LEPTRIS_STACK_SIZE" \
  -o dist/leptris.mjs
ls -la dist/
