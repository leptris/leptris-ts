/* leptris_wasm.c — the WebAssembly bridge over libleptris.
 *
 * A contained C surface for emcc: documents live in a small
 * registry addressed by integer id (1-based; 0 = failure), and
 * every string result is a malloc'd NUL-terminated buffer the
 * host frees with leptris_wasm_free_str after reading.
 */
#include <stdlib.h>
#include <string.h>

#include "leptris.h"
#include "leptris/error.h"

#define LW_MAX_DOCS 64

static LeptrisDocument lw_docs[LW_MAX_DOCS];

static int lw_slot(void) {
    for (int i = 0; i < LW_MAX_DOCS; i++)
        if (!lw_docs[i]) return i + 1;
    return 0;
}

int leptris_wasm_load(const char* xml, size_t len) {
    int id = lw_slot();
    if (!id) return 0;
    LeptrisStatus st = LEPTRIS_OK;
    LeptrisDocument d = leptris_parse_string(xml, len, &st);
    if (!d) return 0;
    lw_docs[id - 1] = d;
    return id;
}

/* Serialize; NULL + the error channel on failure. */
char* leptris_wasm_xml(int id) {
    if (id < 1 || id > LW_MAX_DOCS || !lw_docs[id - 1]) return NULL;
    return leptris_document_serialize(lw_docs[id - 1], NULL);
}

size_t leptris_wasm_xml_len(int id) {
    char* s = leptris_wasm_xml(id);
    if (!s) return 0;
    size_t n = strlen(s);
    free(s);
    return n;
}

/* XPath string evaluation (nodesets: first node's string-value). */
char* leptris_wasm_xpath(int id, const char* expr) {
    if (id < 1 || id > LW_MAX_DOCS || !lw_docs[id - 1] || !expr)
        return NULL;
    LeptrisXPathResult r =
        leptris_xpath_eval(lw_docs[id - 1], NULL, expr);
    if (!r) return NULL;
    char* s = leptris_xpath_result_string(r);
    leptris_xpath_result_free(r);
    return s;
}

void leptris_wasm_close(int id) {
    if (id < 1 || id > LW_MAX_DOCS) return;
    if (lw_docs[id - 1]) {
        leptris_document_free(lw_docs[id - 1]);
        lw_docs[id - 1] = NULL;
    }
}

void leptris_wasm_free_str(char* s) { free(s); }

const char* leptris_wasm_last_error(void) {
    return leptris_last_error();
}

void leptris_wasm_last_error_position(int* line, int* column) {
    leptris_last_error_position(line, column);
}

const char* leptris_wasm_version(void) {
    return leptris_version();
}
