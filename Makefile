# fractonica-web - the Fractonica clock for the web.
#
# There is nothing to install and no build step for the site: public/ is
# served as it is. The one built file, public/fractonica.wasm, is kept in the
# repository, so only a change of the core (or of wasm/glue.c) needs `make wasm`.
#
#   make wasm          rebuild public/fractonica.wasm from $(CORE)/src + wasm/glue.c
#                      (needs clang with the wasm32 target and wasm-ld; see wasm/build.sh)
#   make verify-wasm   rebuild into build/ and fail unless the kept module is
#                      byte for byte what the sources give (run before a commit
#                      that touches the core or the glue)
#   make test          every suite of test/ (node --test); needs only Node,
#                      plus the core checkout and a host cc for the cross-check
#                      and Chrome for the browser suite (each skips, saying
#                      why, when its tool is missing)
#   make check         verify-wasm + test
#   make serve         serve public/ at http://127.0.0.1:$(PORT)/
#   make shoot         headless-Chrome screenshots of every screen x layout x mode
#                      into build/shots/ (SHOTS="now phone" to pick views,
#                      SHOTS="--query theme=basalt" for more URL state); fails
#                      on any console error
#   make audit         every screen x mode at 320 / 375 / 393 px phones, a phone on
#                      its side, 768 / 1024 / 1280 / 1920 px windows, 200 % zoom and
#                      reduced motion into build/sizes/; fails on text cut by the
#                      window's edge, sideways scroll or a console error
#   make idle          main-thread time of a live NOW page over 10 s (fails above 20 %)
#   make icons         rewrite public/icons/ from app/drawing/icon.js (the shipped
#                      favicon, touch icon and manifest icons)
#   node tools/measure.mjs "mode=pure&screen=now" [selector ...]
#                      where elements are, to hold a layout against DESIGN.md
#   make size          the module's size, raw and gzipped
#   make clean         remove build/
#
# Variables: CORE (the core checkout, default ../core), PORT (default 8141),
# SHOTS (filter words for `make shoot`), and for the wasm build CLANG, WASM_LD.

CORE  ?= ../core
PORT  ?= 8141
SHOTS ?=
NODE  ?= node

WASM := public/fractonica.wasm

.PHONY: wasm verify-wasm test check serve shoot audit idle icons size clean

wasm:
	CORE="$(CORE)" wasm/build.sh

verify-wasm:
	@CORE="$(CORE)" BUILD=build/verify wasm/build.sh build/verify/fractonica.wasm >/dev/null
	@if cmp -s build/verify/fractonica.wasm $(WASM); then \
		echo "verify-wasm: ok  $(WASM) is what the sources build ($$(wc -c < $(WASM) | tr -d ' ') bytes)"; \
	else \
		echo "verify-wasm: FAIL  $(WASM) is not what the sources build: run \`make wasm\`"; exit 1; \
	fi

test:
	CORE="$(CORE)" $(NODE) --test 'test/*.test.js'

check: verify-wasm test

serve:
	$(NODE) tools/serve.mjs --port $(PORT)

shoot:
	$(NODE) tools/shoot.mjs $(SHOTS)

audit:
	$(NODE) tools/audit.mjs

idle:
	$(NODE) tools/idle.mjs

icons:
	$(NODE) tools/icons.mjs

size:
	@echo "$(WASM): $$(wc -c < $(WASM) | tr -d ' ') bytes, $$(gzip -9 -c $(WASM) | wc -c | tr -d ' ') gzipped"

clean:
	rm -rf build
