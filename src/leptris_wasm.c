/* leptris_wasm.c — the WebAssembly bridge over libleptris.
 *
 * A contained C surface for emcc: documents live in a small
 * registry addressed by integer id (1-based; 0 = failure), and
 * every string result is a malloc'd NUL-terminated buffer the
 * host frees with leptris_wasm_free_str after reading.
 */
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "leptris.h"
#include "leptris/error.h"

#define LW_MAX_DOCS 64

static LeptrisDocument lw_docs[LW_MAX_DOCS];

/* A snapshot owns its JSON buffer; no document pointers cross the boundary.
 * Grow both the output and traversal stack on the heap so engine-supported
 * nesting does not consume the C/Wasm call stack. */
typedef struct {
    char* data;
    size_t length;
    size_t capacity;
} LwJson;

typedef struct {
    LeptrisNodeRef next_child;
    int has_child;
} LwTreeFrame;

static int lw_json_bytes(LwJson* out, const char* bytes, size_t length) {
    if (out->length == SIZE_MAX || length > SIZE_MAX - out->length - 1)
        return 0;
    size_t needed = out->length + length + 1;
    if (needed > out->capacity) {
        size_t capacity = out->capacity ? out->capacity : 256;
        while (capacity < needed) {
            if (capacity > SIZE_MAX / 2) {
                capacity = needed;
                break;
            }
            capacity *= 2;
        }
        char* data = (char*)realloc(out->data, capacity);
        if (!data) return 0;
        out->data = data;
        out->capacity = capacity;
    }
    memcpy(out->data + out->length, bytes, length);
    out->length += length;
    out->data[out->length] = '\0';
    return 1;
}

#define LW_JSON(out, literal) lw_json_bytes((out), (literal), sizeof(literal) - 1)

/* Escape every JSON control character, preserving the engine's UTF-8 bytes. */
static int lw_json_string_body(LwJson* out, const char* value) {
    static const char hex[] = "0123456789abcdef";
    if (!value) return 0;
    const unsigned char* cursor = (const unsigned char*)value;
    while (*cursor) {
        unsigned char c = *cursor++;
        if (c == '"' || c == '\\') {
            char escaped[2] = {'\\', (char)c};
            if (!lw_json_bytes(out, escaped, sizeof(escaped))) return 0;
        } else if (c < 0x20) {
            char escaped[6] = {'\\', 'u', '0', '0', hex[c >> 4], hex[c & 15]};
            if (!lw_json_bytes(out, escaped, sizeof(escaped))) return 0;
        } else if (!lw_json_bytes(out, (const char*)&c, 1)) {
            return 0;
        }
    }
    return 1;
}

static int lw_json_string(LwJson* out, const char* value) {
    return LW_JSON(out, "\"") && lw_json_string_body(out, value) &&
           LW_JSON(out, "\"");
}

static int lw_json_nullable_string(LwJson* out, const char* value) {
    return value ? lw_json_string(out, value) : LW_JSON(out, "null");
}

static int lw_tree_attributes(LwJson* out, LeptrisElement element) {
    size_t count = leptris_element_attributes_raw(element, NULL, NULL, 0);
    if (!count) return LW_JSON(out, "[]");
    if (count > SIZE_MAX / sizeof(const char*) / 2) return 0;
    const char** names = (const char**)malloc(count * 2 * sizeof(*names));
    if (!names) return 0;
    const char** values = names + count;
    int ok = leptris_element_attributes_raw(element, names, values, count) == count;
    LeptrisAttribute attribute = leptris_element_first_attribute(element);
    if (ok) ok = LW_JSON(out, "[");
    for (size_t i = 0; ok && i < count; i++) {
        /* The raw view supplies source order and declaration qnames. Ordinary
         * values come directly from each attribute handle, which expands entity
         * references without imposing namespace lookup or prefix length limits.
         * The ordinary chain follows source order with declarations removed;
         * reject a disagreement rather than silently omit or mispair content.
         * Namespace declarations retain the engine's raw declaration value. */
        const char* value = NULL;
        if (names[i]) {
            int declaration = strcmp(names[i], "xmlns") == 0 ||
                              strncmp(names[i], "xmlns:", 6) == 0;
            if (declaration) {
                value = values[i];
            } else if (attribute) {
                const char* name = leptris_attribute_get_name(attribute);
                if (name && strcmp(name, names[i]) == 0) {
                    value = leptris_attribute_get_value(element, attribute);
                    attribute = leptris_attribute_next(attribute);
                }
            }
        }
        if (i) ok = LW_JSON(out, ",");
        if (ok) ok = LW_JSON(out, "[") && lw_json_string(out, names[i]) &&
                     LW_JSON(out, ",") && lw_json_string(out, value) &&
                     LW_JSON(out, "]");
    }
    if (attribute) ok = 0;
    if (ok) ok = LW_JSON(out, "]");
    free(names);
    return ok;
}

/* Write a leaf completely, or an element through the opening children array.
 * Unsupported kinds reject the snapshot instead of losing XML content. */
static int lw_tree_node_start(LwJson* out, LeptrisNodeRef node, int* element) {
    const char* kind;
    const char* text;
    *element = 0;
    switch (leptris_node_get_type(node)) {
    case LEPTRIS_NODE_TYPE_ELEMENT: {
        LeptrisElement elem = leptris_node_as_element(node);
        const char* local_name = NULL;
        const char* prefix = NULL;
        const char* uri = NULL;
        if (!elem) return 0;
        leptris_element_expanded_name(elem, &local_name, &prefix, &uri);
        if (!local_name) return 0;
        if (!LW_JSON(out, "{\"kind\":\"element\",\"name\":\"") ||
            (prefix && *prefix &&
             (!lw_json_string_body(out, prefix) || !LW_JSON(out, ":"))) ||
            !lw_json_string_body(out, local_name) ||
            !LW_JSON(out, "\",\"localName\":") ||
            !lw_json_string(out, local_name) ||
            !LW_JSON(out, ",\"prefix\":") ||
            !lw_json_nullable_string(out, prefix) ||
            !LW_JSON(out, ",\"namespaceURI\":") ||
            !lw_json_nullable_string(out, uri) ||
            !LW_JSON(out, ",\"attributes\":") ||
            !lw_tree_attributes(out, elem) ||
            !LW_JSON(out, ",\"children\":[")) return 0;
        *element = 1;
        return 1;
    }
    case LEPTRIS_NODE_TYPE_TEXT:
        kind = "text";
        text = leptris_text_node_get_content(node);
        break;
    case LEPTRIS_NODE_TYPE_CDATA:
        kind = "cdata";
        text = leptris_cdata_node_get_content(node);
        break;
    case LEPTRIS_NODE_TYPE_COMMENT:
        kind = "comment";
        text = leptris_comment_node_get_content(node);
        break;
    case LEPTRIS_NODE_TYPE_PI:
        text = leptris_pi_node_get_data(node);
        return LW_JSON(out, "{\"kind\":\"pi\",\"target\":") &&
               lw_json_string(out, leptris_pi_node_get_target(node)) &&
               LW_JSON(out, ",\"text\":") &&
               lw_json_string(out, text ? text : "") && LW_JSON(out, "}");
    case LEPTRIS_NODE_TYPE_ENTITY_REF:
        return LW_JSON(out, "{\"kind\":\"entity\",\"name\":") &&
               lw_json_string(out, leptris_entity_ref_node_name(node)) &&
               LW_JSON(out, "}");
    default:
        return 0;
    }
    return LW_JSON(out, "{\"kind\":") && lw_json_string(out, kind) &&
           LW_JSON(out, ",\"text\":") && lw_json_string(out, text) &&
           LW_JSON(out, "}");
}

/* Detached root-element snapshot. The caller frees it with free_str.
 * NULL means invalid/empty document, unsupported node, or allocation failure. */
char* leptris_wasm_tree(int id) {
    if (id < 1 || id > LW_MAX_DOCS || !lw_docs[id - 1]) return NULL;
    LeptrisDocument doc = lw_docs[id - 1];
    LeptrisNodeRef node = leptris_element_as_node(leptris_document_root(doc));
    if (!node) return NULL;
    LwJson out = {NULL, 0, 0};
    LwTreeFrame* stack = NULL;
    size_t depth = 0;
    size_t capacity = 0;
    for (;;) {
        int element;
        if (!lw_tree_node_start(&out, node, &element)) goto fail;
        if (element) {
            if (depth == capacity) {
                size_t next = capacity ? capacity * 2 : 16;
                if (capacity > SIZE_MAX / 2 || next > SIZE_MAX / sizeof(*stack))
                    goto fail;
                LwTreeFrame* frames = (LwTreeFrame*)realloc(stack, next * sizeof(*stack));
                if (!frames) goto fail;
                stack = frames;
                capacity = next;
            }
            stack[depth].next_child = leptris_node_first_child(node);
            stack[depth].has_child = 0;
            depth++;
        }
        while (depth) {
            LwTreeFrame* frame = &stack[depth - 1];
            if (frame->next_child) {
                node = frame->next_child;
                frame->next_child = leptris_node_next_sibling(node);
                if (frame->has_child && !LW_JSON(&out, ",")) goto fail;
                frame->has_child = 1;
                break;
            }
            if (!LW_JSON(&out, "]}")) goto fail;
            depth--;
        }
        if (!depth) break;
    }
    free(stack);
    return out.data;
fail:
    free(stack);
    free(out.data);
    return NULL;
}

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
