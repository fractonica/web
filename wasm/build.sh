#!/usr/bin/env bash
#
# build.sh - compile the Fractonica core plus wasm/glue.c into ONE freestanding
# WebAssembly module, public/fractonica.wasm.
#
#   wasm32, no libc, no WASI, NO IMPORTS: the module is instantiated with an
#   empty import object and never calls out. Nothing is linked but
#   $CORE/src/*.c and wasm/glue.c.
#
# Usage:  wasm/build.sh [output.wasm]         (normally through `make wasm`)
# Environment:
#   CORE      the core checkout                 (default: ../core beside web/)
#   CLANG     a clang with the wasm32 target    (default: first one found)
#   WASM_LD   a wasm-ld that runs               (default: first one found)
#   BUILD     where the objects go              (default: build/wasm)
#
# What it writes:
#   wasm/exports.txt       every function the header declares, one per line:
#                          the linker's export list. Kept in the repository so
#                          a change of the core's API shows up in a diff.
#   <output>               the module (default public/fractonica.wasm)
#
# The same sources and the same clang / wasm-ld give the same bytes: no
# timestamp, path or debug section goes into the module (--strip-all).
set -euo pipefail

WEB="$(cd "$(dirname "$0")/.." && pwd)"
CORE="${CORE:-$WEB/../core}"
BUILD="${BUILD:-$WEB/build/wasm}"
OUT="${1:-$WEB/public/fractonica.wasm}"

[ -f "$CORE/include/fractonica.h" ] || { echo "build.sh: no core at $CORE (set CORE=)"; exit 1; }
CORE="$(cd "$CORE" && pwd)"

# --- the toolchain ---------------------------------------------------------
# Apple's clang has no wasm32 target, and a Homebrew wasm-ld can be out of step
# with its LLVM and die at start-up; Emscripten ships a working pair. Take the
# first of each that actually does the job.
can_compile_wasm() {
    echo 'int x;' | "$1" --target=wasm32 -ffreestanding -c -x c - -o /dev/null >/dev/null 2>&1
}
if [ -z "${CLANG:-}" ]; then
    for c in /opt/homebrew/opt/llvm/bin/clang /usr/local/opt/llvm/bin/clang \
             /opt/homebrew/opt/emscripten/libexec/llvm/bin/clang \
             /usr/local/opt/emscripten/libexec/llvm/bin/clang clang; do
        if can_compile_wasm "$c"; then CLANG="$c"; break; fi
    done
fi
[ -n "${CLANG:-}" ] || { echo "build.sh: no clang with a wasm32 target found (set CLANG=)"; exit 1; }
if [ -z "${WASM_LD:-}" ]; then
    for l in "$(dirname "$CLANG")/wasm-ld" /opt/homebrew/opt/emscripten/libexec/llvm/bin/wasm-ld \
             /usr/local/opt/emscripten/libexec/llvm/bin/wasm-ld wasm-ld; do
        if "$l" --version >/dev/null 2>&1; then WASM_LD="$l"; break; fi
    done
fi
[ -n "${WASM_LD:-}" ] || { echo "build.sh: no working wasm-ld found (set WASM_LD=)"; exit 1; }

# --- flags -----------------------------------------------------------------
# The feature set is pinned (not "whatever this clang's default CPU is") so a
# newer compiler does not silently start to need a newer browser. All four are
# in every engine that has BigInt <-> i64, which the binding needs anyway.
#   bulk-memory   a struct copy becomes one instruction instead of a call to a
#                 memcpy this module does not have
TARGET="--target=wasm32 -mcpu=mvp -mmutable-globals -msign-ext -mnontrapping-fptoint -mbulk-memory"
COMMON="$TARGET -ffreestanding -nostdlib -fno-builtin -fvisibility=hidden -Os \
        -ffunction-sections -fdata-sections -I$CORE/include"
# The core must pass its own strict flags here too (core/Makefile, STRICT).
CORE_FLAGS="-std=c99 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Werror -I$CORE/src"
GLUE_FLAGS="-std=c11 -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Werror"

# The stack sits below the data (--stack-first), so running out of it traps
# instead of overwriting a table. Memory is fixed at three pages (192 KiB:
# 64 KiB of stack, the core's tables, glue.c's two blocks) and cannot grow.
STACK_BYTES=65536
MEMORY_BYTES=196608

mkdir -p "$BUILD/obj" "$(dirname "$OUT")"

# --- the export list: every function fractonica.h declares -------------------
# Taken from the PREPROCESSED header, as the core's `make check-api` does.
"$CLANG" $TARGET -ffreestanding -E -P -I"$CORE/include" "$CORE/include/fractonica.h" \
    | tr '\n' ' ' | grep -o -E 'frc_[a-z0-9_]+[[:space:]]*\(' | tr -d ' (' | LC_ALL=C sort -u \
    > "$BUILD/exports.txt"
[ -s "$BUILD/exports.txt" ] || { echo "build.sh: found no function in the header"; exit 1; }
if ! cmp -s "$BUILD/exports.txt" "$WEB/wasm/exports.txt"; then
    cp "$BUILD/exports.txt" "$WEB/wasm/exports.txt"
    echo "build.sh: wasm/exports.txt updated ($(wc -l < "$WEB/wasm/exports.txt" | tr -d ' ') functions)"
fi

# --- compile ---------------------------------------------------------------
# The objects are listed as they are made, and only the list is linked: an
# object left in $BUILD by a source file that no longer exists is never used.
OBJECTS=()
for f in "$CORE"/src/*.c; do
    o="$BUILD/obj/$(basename "$f" .c).o"
    "$CLANG" $COMMON $CORE_FLAGS -c "$f" -o "$o"
    OBJECTS+=("$o")
done
"$CLANG" $COMMON $GLUE_FLAGS -c "$WEB/wasm/glue.c" -o "$BUILD/obj/frcw_glue.o"
OBJECTS+=("$BUILD/obj/frcw_glue.o")

# --- link ------------------------------------------------------------------
# No --allow-undefined: a symbol the module lacks is a link error here, never
# an import at run time. The frcw_* functions export themselves (FRCW_EXPORT).
EXPORTS=""
while read -r name; do EXPORTS="$EXPORTS --export=$name"; done < "$WEB/wasm/exports.txt"
"$WASM_LD" --no-entry --gc-sections --strip-all --stack-first \
    -z stack-size=$STACK_BYTES --initial-memory=$MEMORY_BYTES --max-memory=$MEMORY_BYTES \
    $EXPORTS "${OBJECTS[@]}" -o "$BUILD/fractonica.wasm"

# --- prove it and publish it -----------------------------------------------
node "$WEB/wasm/check-module.mjs" "$BUILD/fractonica.wasm" "$WEB/wasm/exports.txt"
# (`make verify-wasm` asks for the build directory's own copy: nothing to copy then)
[ "$BUILD/fractonica.wasm" -ef "$OUT" ] || cp "$BUILD/fractonica.wasm" "$OUT"
echo "build.sh: $("$CLANG" --version | head -1), $("$WASM_LD" --version)"
echo "build.sh: wrote ${OUT#$WEB/}"
