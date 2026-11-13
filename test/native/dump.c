/*
 * dump.c - the native side of test/crosscheck.test.js.
 *
 * Compiled at test time with the HOST compiler against ../core/src, this
 * program calls the core directly and prints what it answers, one fact per
 * line. test/crosscheck-lines.js prints the same facts through
 * fractonica.wasm and the JavaScript binding. The test compares the two
 * outputs byte for byte, which proves at once that the WebAssembly build
 * computes what a native build computes and that the binding marshals every
 * argument and every struct field correctly.
 *
 *   stdout   first the static facts (no instant involved), then one block
 *            per instant read from stdin (decimal Unix microseconds, one per
 *            line). A block also measures the span from the instant before.
 *
 * THE TWO FILES MUST PRINT THE SAME THING. Change a line here, change it in
 * crosscheck-lines.js. Formats:
 *   an instant         decimal, or "none" for FRC_TIME_NONE
 *   a status           its name, "FRC_ERR_RANGE"
 *   text               "in quotes", or [FRC_ERR_ARG] when the call refused
 *   float / double     the IEEE bits in hex (8 / 16 digits): exact equality
 *
 * Build: cc -std=c11 -O2 -ffp-contract=off -I../core/include dump.c ../core/src/STAR.c
 * (-ffp-contract=off: WebAssembly has no fused multiply-add, so the native
 * build must not fuse either, or the last bit of an arc could differ.)
 */
#include <inttypes.h>
#include <stdio.h>
#include <string.h>

#include "fractonica.h"

static const frc_catalogue_t *CAT = &FRC_SAROS_141;

/* ------------------------------------------------------------------------- */
/* Printing                                                                   */
/* ------------------------------------------------------------------------- */

static const char *status_name(int status)
{
    switch (status) {
    case FRC_OK: return "FRC_OK";
    case FRC_ERR_RANGE: return "FRC_ERR_RANGE";
    case FRC_ERR_ARG: return "FRC_ERR_ARG";
    case FRC_ERR_OVERFLOW: return "FRC_ERR_OVERFLOW";
    case FRC_ERR_BUFFER: return "FRC_ERR_BUFFER";
    case FRC_ERR_PARSE: return "FRC_ERR_PARSE";
    case FRC_ERR_REFUSED: return "FRC_ERR_REFUSED";
    default: return "FRC_STATUS_UNKNOWN";
    }
}

static void put_time(frc_time_t t)
{
    if (t == FRC_TIME_NONE) {
        printf(" none");
    } else {
        printf(" %" PRId64, t);
    }
}

static void put_f32(float value)
{
    uint32_t bits;
    memcpy(&bits, &value, sizeof bits);
    printf(" %08" PRIx32, bits);
}

static void put_f64(double value)
{
    uint64_t bits;
    memcpy(&bits, &value, sizeof bits);
    printf(" %016" PRIx64, bits);
}

/* The result of a text function: the text, or the status it refused with. */
static void put_text(int written, const char *text)
{
    if (written < 0) {
        printf(" [%s]", status_name(written));
    } else {
        printf(" \"%s\"", text);
    }
}

static void put_cycle(const frc_cycle_t *c)
{
    printf(" %u %u %u %u %u %" PRIu64 " %" PRIu32, c->level, c->quarter, c->clipped, c->local, c->siblings,
           c->cycle, c->phase);
    put_f64(frc_frac_to_double(c->phase));
    put_time(c->start);
    put_time(c->end);
}

static void put_threshold(const frc_threshold_t *th)
{
    printf(" %u", th->name);
    put_time(th->time);
}

static void put_glyph(const frc_glyph_t *g)
{
    uint8_t i;
    printf(" %u %d %d %u %u", g->index, g->value, g->derivative, g->dotted, g->strokes);
    for (i = 0; i < g->strokes && i < FRC_MAX_STROKES; i++) {
        printf(" %d", g->trit[i]);
    }
}

static void put_odometer(const frc_odometer_t *o)
{
    uint8_t i;
    printf(" %u %u %u", o->count, o->strokes, o->states);
    for (i = 0; i < o->count && i < FRC_MAX_DIGITS; i++) {
        printf(" %u", o->digit[i]);
    }
    put_time(o->next_change);
}

static void put_sync(const frc_sync_t *s)
{
    printf(" %" PRId32 " %u %u %" PRIu32, s->sync, s->quarter, s->helion, s->phase);
    put_f64(frc_frac_to_double(s->phase));
    put_time(s->start);
    put_time(s->end);
    put_time(s->nominal);
    printf(" %" PRId64, s->drift_us);
    put_threshold(&s->next);
}

static void put_pentad(const frc_pentad_t *p)
{
    printf(" %" PRId32 " %u %u %u %u", p->sync, p->index, p->helion, p->helions, p->first);
    put_time(p->start);
    put_time(p->end);
}

static void put_date(const frc_date_t *d)
{
    printf(" %u %u %u %u %u %u %u %u %u %u %u %u %u", d->alpha, d->beta, d->gamma, d->delta, d->epsilon, d->eta,
           d->iota, d->lambda, d->nu, d->quarter[0], d->quarter[1], d->quarter[2], d->quarter[3]);
}

static void put_span(const frc_span_t *s)
{
    printf(" %u %" PRIu64 " %" PRIu32, s->negative, s->blinks, s->frac);
}

static void put_sci(const frc_sci_t *v)
{
    printf(" %" PRIu64 " %d", v->mantissa, v->exp10);
}

static void put_arc(const frc_arc_t *a)
{
    put_f32(a->cx);
    put_f32(a->cy);
    put_f32(a->radius);
    put_f32(a->start);
    put_f32(a->sweep);
}

static void put_civil(const frc_civil_t *c)
{
    printf(" %" PRId32 " %u %u %u %u %u %u %" PRIu32, c->year, c->month, c->day, c->hour, c->minute, c->second,
           c->weekday, c->microsecond);
}

/* A span with everything that can be said about it. */
static void put_span_all(const frc_span_t *span)
{
    static const uint8_t max_parts[3] = {0, 1, 4};
    frc_span_part_t parts[FRC_UNIT_COUNT];
    char text[256];
    uint8_t i, n;
    int unit;

    put_span(span);
    for (i = 0; i < 3; i++) {
        put_text(frc_format_span(span, max_parts[i], text, sizeof text), text);
    }
    for (i = 0; i < 3; i++) {
        put_text(frc_format_span_signed(span, max_parts[i], text, sizeof text), text);
    }
    for (unit = -1; unit <= FRC_UNIT_COUNT; unit++) {
        put_text(frc_format_span_in_unit(span, (frc_unit_t)unit, text, sizeof text), text);
    }
    n = frc_span_parts(span, FRC_UNIT_COUNT, 0, parts);
    printf(" %u", n);
    for (i = 0; i < n; i++) {
        printf(" %u:%" PRIu64, parts[i].unit, parts[i].count);
    }
    n = frc_span_parts(span, 3, 1, parts);
    printf(" %u", n);
    for (i = 0; i < n; i++) {
        printf(" %u:%" PRIu64, parts[i].unit, parts[i].count);
    }
}

static void path_sink(void *ctx, frc_path_op_t op, const int16_t *pts)
{
    int n = op == FRC_PATH_CUBIC ? 6 : op == FRC_PATH_DOT ? 3 : 2, i;
    (void)ctx;
    printf(" %d", (int)op);
    for (i = 0; i < n; i++) {
        printf("%c%d", i == 0 ? ':' : ',', pts[i]);
    }
}

static void segment_sink(void *ctx, int16_t x0, int16_t y0, int16_t x1, int16_t y1)
{
    (void)ctx;
    printf(" %d,%d,%d,%d", x0, y0, x1, y1);
}

/* The phases every inverse is asked for: the start, a quarter, a half, three quarters, the last value. */
static const frc_frac_t INVERSE_PHASES[] = {0u, FRC_FRAC_QUARTER, FRC_FRAC_HALF, 0xC0000000u, 0xFFFFFFFFu, 12345678u};
#define INVERSE_PHASE_COUNT (sizeof INVERSE_PHASES / sizeof INVERSE_PHASES[0])

/* The same generator as crosscheck-lines.js: 32-bit values that both sides can make. */
static uint32_t lcg_state = 20261008u;
static uint32_t lcg(void)
{
    lcg_state = lcg_state * 1664525u + 1013904223u;
    return lcg_state;
}

/* ------------------------------------------------------------------------- */
/* Static facts                                                               */
/* ------------------------------------------------------------------------- */

static void dump_catalogue(const frc_catalogue_t *cat, const char *tag)
{
    frc_interval_t mean = frc_interval_mean(cat);
    unsigned k;
    uint8_t level;

    printf("%s catalogue %u %u %u", tag, cat->count, cat->series, cat->anchor);
    put_time(frc_catalogue_first(cat));
    put_time(frc_catalogue_last(cat));
    printf(" %" PRIu64 " %" PRIu64 "\n", mean.num, mean.den);
    for (k = 0; k <= (unsigned)cat->count; k++) {
        printf("%s instant %u", tag, k);
        put_time(frc_catalogue_instant(cat, (uint16_t)k));
        printf("\n");
    }
    for (level = 0; level <= FRC_CLOCK_MAX_LEVEL + 1; level++) {
        printf("%s cycles %u %" PRIu64 "\n", tag, level, frc_cycle_count(cat, level));
    }
    for (k = 0; k < 12; k++) {
        uint64_t n = (uint64_t)k * 37u + 1u, d = 7u + k;
        printf("%s position %" PRIu64 "/%" PRIu64, tag, n, d);
        put_time(frc_time_at_position(cat, n, d));
        printf("\n");
    }
}

static void dump_levels(void)
{
    char text[256], long_text[512];
    unsigned level, unit, medium, with_word;

    for (level = 0; level <= 70; level++) {
        const uint8_t l = (uint8_t)level;
        uint64_t prefix = frc_prefix(l);
        uint64_t num = 0, den = 0;
        frc_span_t span;
        frc_status_t status;
        int of_level = frc_unit_of_level(l);

        printf("level %u %u %u", level, frc_factor(l), frc_siblings(l));
        if (prefix == 0) {
            printf(" null");
        } else {
            printf(" %" PRIu64, prefix);
        }
        put_text(frc_format_prefix(l, text, sizeof text), text);
        printf(" %d", (int)frc_level_kind(l));
        put_text(frc_format_level_name(l, text, sizeof text), text);
        put_text(frc_format_level_word(l, text, sizeof text), text);
        if (of_level < 0) {
            printf(" null");
        } else {
            printf(" %d", of_level);
        }
        printf("\n");

        printf("levelspan %u", level);
        status = frc_span_of_level(l, &span);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_span_all(&span);
        }
        printf("\n");

        printf("levelrate %u", level);
        status = frc_level_per_blink(l, &num, &den);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            printf(" %" PRIu64 " %" PRIu64, num, den);
            put_text(frc_format_per_blink(num, den, text, sizeof text), text);
        }
        put_text(frc_format_level_rate(l, 0, text, sizeof text), text);
        put_text(frc_format_level_rate(l, 4, text, sizeof text), text);
        put_text(frc_format_level_rate(l, 9, text, sizeof text), text);
        put_text(frc_format_level_rate(l, 1, text, sizeof text), text);
        printf("\n");

        printf("levelunits %u", level);
        for (unit = 0; unit <= FRC_UNIT_COUNT; unit++) {
            put_text(frc_format_level_in_unit(l, (frc_unit_t)unit, text, sizeof text), text);
        }
        printf("\n");

        printf("levelwords %u", level);
        put_text(frc_format_level_children(l, text, sizeof text), text);
        put_text(frc_format_level_in_parent(l, text, sizeof text), text);
        put_text(frc_format_prefix_factors(l, long_text, sizeof long_text), long_text);
        printf("\n");

        for (with_word = 0; with_word < 2; with_word++) {
            printf("levellight %u %u", level, with_word);
            for (medium = 0; medium <= FRC_MEDIUM_COUNT; medium++) {
                put_text(frc_format_light_span(l, frc_medium_speed((frc_medium_t)medium), (int)with_word, text, sizeof text), text);
            }
            printf("\n");
        }
    }
}

static void dump_names(void)
{
    static const uint64_t counts[] = {0u, 7u, 999u, 1000u, 58500u, UINT64_C(142033641750000), UINT64_MAX};
    static const uint16_t ordinals[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25, 100, 65535};
    static const int64_t signed_counts[] = {0, 1, -1, -3, 4820, -58500, INT64_MAX, INT64_MIN};
    char text[256];
    int unit, quarter, medium, band, kind;
    unsigned i;

    for (unit = -1; unit <= FRC_UNIT_COUNT + 1; unit++) {
        const frc_unit_t u = (frc_unit_t)unit;
        uint8_t level = frc_unit_level(u);
        printf("unit %d", unit);
        if (level == FRC_LEVEL_NONE) {
            printf(" null");
        } else {
            printf(" %u", level);
        }
        printf(" %" PRIu64 " %u", frc_unit_blinks(u), frc_unit_parts(u));
        put_text(frc_format_unit_symbol(u, text, sizeof text), text);
        put_text(frc_format_unit_name(u, 0, text, sizeof text), text);
        put_text(frc_format_unit_name(u, 1, text, sizeof text), text);
        put_text(frc_format_unit_in_parent(u, text, sizeof text), text);
        printf("\n");
    }
    for (quarter = -1; quarter <= 4; quarter++) {
        printf("quarter %d", quarter);
        put_text(frc_format_quarter((frc_quarter_t)quarter, 0, text, sizeof text), text);
        put_text(frc_format_quarter((frc_quarter_t)quarter, 1, text, sizeof text), text);
        printf("\n");
        for (i = 0; i <= FRC_MAX_STROKES + 1; i++) {
            frc_glyph_t glyph;
            frc_status_t status = frc_glyph_at_quarter((frc_quarter_t)quarter, (uint8_t)i, &glyph);
            printf("quarterglyph %d %u", quarter, i);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_glyph(&glyph);
            }
            printf("\n");
        }
    }
    for (kind = -1; kind <= 4; kind++) {
        printf("kind %d", kind);
        put_text(frc_format_level_kind((frc_level_kind_t)kind, text, sizeof text), text);
        printf("\n");
    }
    printf("lightword");
    put_text(frc_format_light_word(text, sizeof text), text);
    printf("\n");
    for (i = 0; i < sizeof ordinals / sizeof ordinals[0]; i++) {
        printf("ordinal %u", ordinals[i]);
        put_text(frc_format_ordinal(ordinals[i], text, sizeof text), text);
        printf("\n");
    }
    for (i = 0; i < sizeof counts / sizeof counts[0]; i++) {
        printf("count %" PRIu64, counts[i]);
        put_text(frc_format_count(counts[i], text, sizeof text), text);
        printf("\n");
    }
    for (i = 0; i < sizeof signed_counts / sizeof signed_counts[0]; i++) {
        printf("countsigned %" PRId64, signed_counts[i]);
        put_text(frc_format_count_signed(signed_counts[i], text, sizeof text), text);
        printf("\n");
    }
    for (i = 0; i <= FRC_RATE_COUNT; i++) {
        frc_rate_t rate;
        frc_status_t status = frc_rate_preset((uint8_t)i, &rate);
        printf("rate %u", i);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            printf(" %u %u %" PRIu64, rate.unit, rate.count, rate.factor);
            put_text(frc_format_rate(&rate, text, sizeof text), text);
        }
        printf("\n");
    }
    for (medium = -1; medium <= FRC_MEDIUM_COUNT; medium++) {
        const frc_medium_t m = (frc_medium_t)medium;
        frc_speed_t speed = frc_medium_speed(m);
        printf("medium %d %" PRIu64 " %" PRIu64, medium, speed.num, speed.den);
        put_text(frc_format_medium_id(m, text, sizeof text), text);
        put_text(frc_format_medium_name(m, text, sizeof text), text);
        put_text(frc_format_medium_phase(m, text, sizeof text), text);
        printf("\n");
    }
    for (band = -1; band <= 9; band++) {
        frc_sci_t low, high;
        frc_status_t status = frc_band_edges((frc_band_t)band, &low, &high);
        printf("band %d", band);
        put_text(frc_format_band((frc_band_t)band, text, sizeof text), text);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_sci(&low);
            put_sci(&high);
        }
        printf("\n");
    }
    {
        static const uint64_t ratios[][2] = {{7, 1}, {2772, 1}, {1, 25}, {1, 26}, {1, 58500}, {0, 5}, {5, 0},
                                             {110 * UINT64_C(77894856196), UINT64_C(250529296875)},
                                             {1, 2}, {1, 3}, {1, 5}, {1, 10}, {1, 20}, {2, 50}, {4, 100},
                                             {3, 4}, {2, 3}, {4001, 100000}};
        for (i = 0; i < sizeof ratios / sizeof ratios[0]; i++) {
            printf("perblink %" PRIu64 "/%" PRIu64, ratios[i][0], ratios[i][1]);
            put_text(frc_format_per_blink(ratios[i][0], ratios[i][1], text, sizeof text), text);
            printf("\n");
        }
    }
}

static void dump_ladder_on(const char *tag, frc_interval_t interval)
{
    static const uint64_t rates[] = {1u, 32768u, 48000u, 1000000u, UINT64_C(16000000), UINT64_C(1000000000000)};
    static const uint8_t bits[] = {0, 16, 32, 48, 64, 65};
    static const uint8_t digit_choices[] = {0, 4, 9, 10};
    char text[256];
    unsigned level, medium, i;

    printf("ladder %s %" PRIu64 " %" PRIu64 "\n", tag, interval.num, interval.den);
    for (level = 0; level <= FRC_LEVEL_COUNT; level++) {
        const uint8_t l = (uint8_t)level;
        frc_sci_t value;
        frc_status_t status;

        printf("period %s %u", tag, level);
        status = frc_period(l, interval, &value);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_sci(&value);
            put_f64(frc_sci_to_double(&value));
            for (i = 0; i < 4; i++) {
                put_text(frc_format_quantity(&value, FRC_QUANTITY_TIME, digit_choices[i], text, sizeof text), text);
            }
        }
        put_f64(frc_period_seconds(l, interval));
        put_text(frc_format_period(l, interval, 0, text, sizeof text), text);
        put_text(frc_format_period(l, interval, 6, text, sizeof text), text);
        printf("\n");

        printf("frequency %s %u", tag, level);
        status = frc_frequency(l, interval, &value);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_sci(&value);
            put_f64(frc_sci_to_double(&value));
            put_text(frc_format_quantity(&value, FRC_QUANTITY_FREQUENCY, 5, text, sizeof text), text);
        }
        put_f64(frc_frequency_hz(l, interval));
        put_text(frc_format_frequency(l, interval, 0, text, sizeof text), text);
        put_text(frc_format_frequency(l, interval, 6, text, sizeof text), text);
        printf(" %d\n", (int)frc_band(l, interval));

        for (medium = 0; medium <= FRC_MEDIUM_COUNT; medium++) {
            frc_speed_t speed = frc_medium_speed((frc_medium_t)medium);
            printf("length %s %u %u", tag, level, medium);
            status = frc_length(l, interval, speed, &value);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_sci(&value);
                put_text(frc_format_quantity(&value, FRC_QUANTITY_LENGTH, 3, text, sizeof text), text);
            }
            put_f64(frc_length_metres(l, interval, speed));
            put_text(frc_format_length(l, interval, speed, 0, text, sizeof text), text);
            printf("\n");
        }

        printf("device %s %u", tag, level);
        for (i = 0; i < sizeof rates / sizeof rates[0]; i++) {
            uint64_t ticks = 0;
            status = frc_device_ticks(l, interval, rates[i], &ticks);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                printf(" %" PRIu64, ticks);
            }
        }
        for (i = 0; i < sizeof bits / sizeof bits[0]; i++) {
            uint64_t step = 0;
            status = frc_device_step(l, interval, 48000u, bits[i], &step);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                printf(" %" PRIu64, step);
            }
        }
        printf("\n");
    }
}

static void dump_glyphs(void)
{
    static const uint8_t steps[] = {0, 1, 8, 32, 200};
    unsigned strokes, index, i;

    for (strokes = 0; strokes <= FRC_MAX_STROKES + 1; strokes++) {
        const uint8_t s = (uint8_t)strokes;
        int16_t min_x, min_y, max_x, max_y;
        unsigned states = frc_glyph_states(s);
        /* every state of the small glyphs, a spread of the large ones */
        unsigned stride = states > 60 ? states / 53 : 1;

        frc_glyph_bounds(s, &min_x, &min_y, &max_x, &max_y);
        printf("glyphs %u %u %u %d %d %d %d\n", strokes, frc_glyph_extreme(s), states, min_x, min_y, max_x, max_y);
        for (index = 0; index < (states ? states + 3 : 2); index += stride) {
            frc_glyph_t glyph;
            frc_status_t status = frc_glyph_from_index((uint16_t)index, s, &glyph);

            printf("glyph %u %u", strokes, index);
            if (status != FRC_OK) {
                printf(" %s\n", status_name(status));
                continue;
            }
            put_glyph(&glyph);
            printf(" %u\n", frc_glyph_index_descending((uint16_t)index, s));
            printf("path %u %u", strokes, index);
            frc_glyph_path(&glyph, path_sink, NULL);
            printf("\n");
            for (i = 0; i < sizeof steps / sizeof steps[0]; i++) {
                if (i > 1 && index % 5 != 0) {
                    continue; /* the long ones for a fifth of the states */
                }
                printf("segments %u %u %u", strokes, index, steps[i]);
                frc_glyph_segments(&glyph, steps[i], segment_sink, NULL);
                printf("\n");
            }
        }
    }
}

static void dump_phases(void)
{
    static const uint8_t pairs[][2] = {{2, 2}, {3, 2}, {2, 3}, {1, 4}, {5, 4}, {0, 2}, {2, 5}};
    unsigned i, k;

    for (i = 0; i < 200; i++) {
        uint32_t phase = i == 0 ? 0u : i == 1 ? 0xFFFFFFFFu : i == 2 ? FRC_FRAC_HALF : lcg();
        uint8_t strokes;

        printf("phase %" PRIu32, phase);
        put_f64(frc_frac_to_double(phase));
        for (strokes = 0; strokes <= FRC_MAX_STROKES; strokes++) {
            printf(" %u", frc_glyph_index_of_phase(phase, strokes));
        }
        printf("\n");
        for (k = 0; k < sizeof pairs / sizeof pairs[0]; k++) {
            frc_odometer_t odometer;
            frc_status_t status = frc_odometer_of_phase(phase, pairs[k][0], pairs[k][1], &odometer);
            printf("phaseodo %" PRIu32 " %u %u", phase, pairs[k][0], pairs[k][1]);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_odometer(&odometer);
            }
            printf("\n");
        }
    }
}

static void dump_arcs(void)
{
    static const uint8_t factors[] = {5, 13, 5, 5, 7, 11, 9, 4};
    static const float fractions[] = {0.0f, 0.25f, 0.5f, 0.8125f, 1.0f};
    frc_arc_t carrier, arc, child;
    unsigned half, f, j, k, i;

    for (half = 0; half < 6; half++) {
        arc = frc_arc_wave_root((uint32_t)half);
        printf("waveroot %u", half);
        put_arc(&arc);
        printf("\n");
    }
    /* the ring construction of DESIGN.md: a full-circle carrier, 2 * factor children, their children */
    carrier.cx = 196.5f;
    carrier.cy = 277.0f;
    carrier.radius = 102.0f;
    carrier.start = -FRC_PI / 2.0f;
    carrier.sweep = 2.0f * FRC_PI;
    for (f = 0; f < 8; f++) {
        const uint8_t slots = (uint8_t)(2 * factors[f]);
        const uint8_t inner = factors[(f + 1) % 8];
        for (j = 0; j < slots; j++) {
            child = frc_arc_child(&carrier, slots, (uint8_t)j, (int)(j & 1u));
            printf("child %u %u", slots, j);
            put_arc(&child);
            for (i = 0; i < sizeof fractions / sizeof fractions[0]; i++) {
                float x = 0, y = 0;
                frc_arc_point(&child, fractions[i], &x, &y);
                put_f32(x);
                put_f32(y);
            }
            printf("\n");
            for (k = 0; k < inner; k++) {
                arc = frc_arc_child(&child, inner, (uint8_t)k, (int)((j * inner + k) & 1u));
                printf("grandchild %u %u %u", slots, j, k);
                put_arc(&arc);
                printf("\n");
            }
        }
    }
    /* the documented edges: m == 1, m == 0, a slot of half a turn */
    arc = frc_arc_child(&carrier, 1, 0, 0);
    printf("child-one");
    put_arc(&arc);
    arc = frc_arc_child(&carrier, 0, 0, 0);
    put_arc(&arc);
    arc = frc_arc_child(&carrier, 2, 1, 1);
    put_arc(&arc);
    printf("\n");
    for (i = 0; i < 120; i++) {
        /* angles from -12 to +12 radians in steps of 0.2017 */
        float angle = -12.0f + (float)i * 0.2017f;
        printf("trig %u", i);
        put_f32(frc_sin(angle));
        put_f32(frc_cos(angle));
        printf("\n");
    }
}

static void dump_civil_and_text(void)
{
    static const int64_t julian[] = {INT64_C(-12219292800000), INT64_C(-11253795486968), 0, INT64_C(1791460800000)};
    static const int64_t big[] = {0, 1, -1, INT64_C(1791460800), INT64_C(9223372036854775), INT64_C(9223372036854776),
                                  INT64_C(-9223372036854776), INT64_MAX, INT64_MIN};
    static const char *const texts[] = {
        "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν", "−2ε 5η", "2.454 × 10⁻²⁵ s", "⬠II·3", "◻", "54.98 µHz", "1 per 58 500 Blinks",
        "plain ASCII", "", "ς ζ ξ ψ ω — – ⁺¹⁰", "日本語 ok",
    };
    static const char *const dates[] = {
        "a#6 b#4 g#9 d#3 e#5 34h 29i", "Pentad II · Delta Trifracton End ε#5 34η 29ι", "d#3 e#5 34h", "a6 b4", "",
        "α#6 β#4 γ#9 δ#3 ε#5 34η 29ι 21λ 3ν", "a#6 b#9 g#9 d#3 e#5 34h", "PII.3 a#1 b#1 g#1 d#1 e#1 1h 0i 0l 0n", "a#0 b#1 g#1 d#1 e#1",
    };
    static const frc_civil_t fields[] = {
        {2026, 10, 8, 12, 0, 0, 0, 0}, {2026, 13, 32, 25, 61, 61, 0, 999999}, {-44, 3, 15, 0, 0, 0, 0, 1},
        {10000, 1, 1, 23, 59, 59, 0, 123456}, {300000, 1, 1, 0, 0, 0, 0, 0}, {1969, 12, 31, 23, 59, 59, 0, 999999},
    };
    static const int32_t offsets[] = {0, 3600, -34200, 59, -59};
    static const int32_t zone_offsets[] = {0, 10800, -9000, 19800, 20700, -36000, 59, -59, 86399, -86400};
    static const frc_civil_t days[] = {
        {2026, 2, 29, 0, 0, 0, 0, 0}, {2024, 2, 29, 0, 0, 0, 0, 0}, {1900, 2, 29, 0, 0, 0, 0, 0},
        {2000, 2, 29, 23, 59, 59, 0, 999999}, {2026, 4, 31, 0, 0, 0, 0, 0}, {2026, 1, 1, 24, 0, 0, 0, 0},
        {2026, 1, 1, 0, 60, 0, 0, 0}, {2026, 1, 1, 0, 0, 60, 0, 0}, {2026, 1, 1, 0, 0, 0, 0, 1000000},
        {0, 1, 1, 0, 0, 0, 0, 0}, {800, 10, 8, 1, 2, 3, 0, 0}, {-290000, 1, 1, 0, 0, 0, 0, 0},
        {290001, 1, 1, 0, 0, 0, 0, 0}, {2026, 0, 1, 0, 0, 0, 0, 0},
    };
    static const int64_t durations[] = {
        0, 4999, 5000, 400000, 9271000, 5000000, 9994999, 9995000, 59600000, 59999999, 60000000,
        INT64_C(1433000000), INT64_C(3722000000), INT64_C(3599600000), INT64_C(3762000000), INT64_C(273600000000),
        INT64_C(1234) * 86400000000 + INT64_C(18000000000), -400000, INT64_C(-3722000000), -4999, INT64_MAX, INT64_MIN,
    };
    static const uint8_t duration_parts[] = {0, 1, 2, 3, 4, 9};
    static const char *const civil_texts[] = {
        "2026-10-08", "2026-10-08 12:00", "2026-10-08T12:00:00Z", "2026-10-08T14:00:00+02:00", "8 OCT 2026",
        "8 OCT 2026 12:00", "THU 8 OCT 2026 · 12:00:00", "2026-10-08T12:00:00.000Z", "8 October 2026", "thu, 8 oct 2026",
        "FRI 8 OCT 2026", "31 FEB 2026", "2026-02-29", "2026-13-01", "2026-10-08 24:00", "2026-10-08 12:60",
        "2026-10-08T12:00+24:00", "2026-10-08 12:00 UTC+3", "2026-10-08 12:00 UTC−2:30", "2026-10-08 12:00 +0530",
        "2026-10-08 12:00 +05", "2026-10-08 12:00 GMT", "2026-10-08 12:00:00.123456789", "-0044-03-15", "+10000-01-01",
        "8 OCT", "12:00", "2026-10-08 CEST", "", "   2026-10-08   ", "2026-10-08 12:00 pm", "8 OCT 2026 · 01:34:05",
    };
    char text[256];
    unsigned i, k, form;

    for (i = 0; i < sizeof julian / sizeof julian[0]; i++) {
        printf("julian %" PRId64 " %" PRId64 "\n", julian[i], frc_julian_fields_to_unix_ms(julian[i]));
    }
    for (i = 0; i < sizeof big / sizeof big[0]; i++) {
        printf("time %" PRId64, big[i]);
        put_time(frc_time_from_ms(big[i]));
        put_time(frc_time_from_s(big[i]));
        printf("\n");
    }
    for (i = 0; i < sizeof fields / sizeof fields[0]; i++) {
        for (k = 0; k < sizeof offsets / sizeof offsets[0]; k++) {
            printf("civilfields %u %" PRId32, i, offsets[k]);
            put_time(frc_time_from_civil(&fields[i], offsets[k]));
            put_text(frc_format_civil(&fields[i], offsets[k], text, sizeof text), text);
            printf("\n");
        }
    }
    for (i = 0; i < sizeof fields / sizeof fields[0]; i++) {
        printf("civiltext %u", i);
        for (form = 0; form <= FRC_CIVIL_FORM_COUNT; form++) {
            put_text(frc_format_civil_text(&fields[i], 3600, (frc_civil_form_t)form, text, sizeof text), text);
        }
        printf(" %s\n", status_name(frc_civil_validate(&fields[i])));
    }
    for (i = 0; i < sizeof days / sizeof days[0]; i++) {
        printf("civilday %u %s", i, status_name(frc_civil_validate(&days[i])));
        for (form = 0; form <= FRC_CIVIL_FORM_COUNT; form++) {
            put_text(frc_format_civil_text(&days[i], 0, (frc_civil_form_t)form, text, sizeof text), text);
        }
        printf("\n");
    }
    for (i = 0; i < sizeof zone_offsets / sizeof zone_offsets[0]; i++) {
        printf("civiloffset %" PRId32, zone_offsets[i]);
        put_text(frc_format_civil_text(NULL, zone_offsets[i], FRC_CIVIL_OFFSET, text, sizeof text), text);
        put_text(frc_format_civil_text(NULL, zone_offsets[i], FRC_CIVIL_TIME, text, sizeof text), text);
        printf("\n");
    }
    for (i = 0; i < sizeof durations / sizeof durations[0]; i++) {
        printf("duration %" PRId64, durations[i]);
        for (k = 0; k < sizeof duration_parts / sizeof duration_parts[0]; k++) {
            put_text(frc_format_duration(durations[i], duration_parts[k], text, sizeof text), text);
        }
        printf("\n");
    }
    for (i = 0; i < sizeof civil_texts / sizeof civil_texts[0]; i++) {
        frc_civil_t civil;
        int32_t offset = 0;
        int has_offset = 0;
        frc_status_t status = frc_parse_civil(civil_texts[i], &civil, &offset, &has_offset);
        printf("parsecivil %u", i);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_civil(&civil);
            if (has_offset) {
                printf(" %" PRId32, offset);
            } else {
                printf(" null");
            }
        }
        printf("\n");
    }
    for (i = 0; i < sizeof texts / sizeof texts[0]; i++) {
        printf("ascii %u", i);
        put_text(frc_to_ascii(texts[i], text, sizeof text), text);
        printf("\n");
    }
    for (i = 0; i < sizeof dates / sizeof dates[0]; i++) {
        frc_date_t date;
        frc_unit_t finest = FRC_UNIT_ALPHA;
        frc_status_t status = frc_parse_date(dates[i], NULL, &date, &finest);
        printf("parsetext %u", i);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_date(&date);
            printf(" %d", (int)finest);
        }
        printf("\n");
    }
}

static void dump_sync_numbers(void)
{
    static const int32_t numbers[] = {-32000, -31999, -1, 0, 1, 2375, 4820, 7987, 76000, 77000};
    unsigned i, index, k;
    char text[256];

    for (i = 0; i < sizeof numbers / sizeof numbers[0]; i++) {
        frc_sync_t sync;
        frc_status_t status = frc_sync_by_number(CAT, numbers[i], &sync);
        printf("syncnumber %" PRId32, numbers[i]);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_sync(&sync);
        }
        for (k = 0; k < INVERSE_PHASE_COUNT; k++) {
            put_time(frc_time_at_sync_phase(CAT, numbers[i], INVERSE_PHASES[k]));
        }
        printf("\n");
        for (index = 0; index <= 4; index++) {
            frc_pentad_t pentad;
            status = frc_pentad_by_number(CAT, numbers[i], (uint8_t)index, &pentad);
            printf("pentadnumber %" PRId32 " %u", numbers[i], index);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_pentad(&pentad);
                put_text(frc_format_pentad(&pentad, FRC_PENTAD_FULL, 0, text, sizeof text), text);
                put_text(frc_format_pentad(&pentad, FRC_PENTAD_SHORT, 0, text, sizeof text), text);
                put_text(frc_format_pentad(&pentad, FRC_PENTAD_ASCII, 0, text, sizeof text), text);
                put_text(frc_format_pentad(&pentad, FRC_PENTAD_FULL, 1, text, sizeof text), text);
                put_text(frc_format_pentad(&pentad, FRC_PENTAD_NUMERAL, 0, text, sizeof text), text);
                put_text(frc_format_pentad(&pentad, (frc_pentad_form_t)4, 0, text, sizeof text), text);
            }
            printf("\n");
        }
    }
}

/* A second, hand-made series: frc_catalogue_init through both paths. */
static const int64_t CUSTOM_MS[] = {
    INT64_C(-600000000000), INT64_C(-31000000000), INT64_C(537972877000), INT64_C(1106945754000),
    INT64_C(1675918631123), INT64_C(2244891508000), INT64_C(2813864385000), INT64_C(3382837262001),
    INT64_C(3951810139000),
};
#define CUSTOM_COUNT ((uint16_t)(sizeof CUSTOM_MS / sizeof CUSTOM_MS[0]))
static frc_catalogue_t custom;

static void dump_instant_on(const frc_catalogue_t *cat, const char *tag, frc_time_t t, frc_time_t previous, int full);

static void dump_static(void)
{
    static const int64_t bad[] = {5, 4, 3};
    frc_catalogue_t refused;
    frc_interval_t interval;

    printf("version %s %s\n", FRC_VERSION, FRC_SPEC_VERSION);
    dump_catalogue(CAT, "saros141");
    printf("custom init %s\n", status_name(frc_catalogue_init(&custom, CUSTOM_MS, CUSTOM_COUNT, 999)));
    dump_catalogue(&custom, "custom");
    printf("custom refused %s %s\n", status_name(frc_catalogue_init(&refused, bad, 3, 1)),
           status_name(frc_catalogue_init(&refused, CUSTOM_MS, 1, 1)));
    dump_levels();
    dump_names();
    interval.num = FRC_INTERVAL_REFERENCE_MS;
    interval.den = 1;
    dump_ladder_on("reference", interval);
    dump_ladder_on("mean", frc_interval_mean(CAT));
    dump_ladder_on("alpha", frc_interval_of_alpha_ms(UINT64_C(2275891508000)));
    interval.num = 0;
    interval.den = 1;
    dump_ladder_on("zero", interval);
    dump_glyphs();
    dump_phases();
    dump_arcs();
    dump_civil_and_text();
    dump_sync_numbers();
    /* a few instants on the hand-made series */
    dump_instant_on(&custom, "custom", FRC_TIME_FROM_MS(INT64_C(1675918631123)), FRC_TIME_NONE, 0);
    dump_instant_on(&custom, "custom", FRC_TIME_FROM_MS(INT64_C(2000000000000)), FRC_TIME_FROM_MS(INT64_C(1675918631123)), 0);
    dump_instant_on(&custom, "custom", FRC_TIME_FROM_MS(INT64_C(3951810139000)), FRC_TIME_FROM_MS(INT64_C(2000000000000)), 0);
}

/* ------------------------------------------------------------------------- */
/* One instant                                                                */
/* ------------------------------------------------------------------------- */

static void dump_span_between(const frc_catalogue_t *cat, const char *tag, const char *name, frc_time_t t1, frc_time_t t2)
{
    frc_span_t span;
    frc_status_t status = frc_span_between(cat, t1, t2, &span);

    printf("%s %s", tag, name);
    if (status != FRC_OK) {
        printf(" %s", status_name(status));
    } else {
        put_span_all(&span);
    }
    printf("\n");
}

static void dump_instant_on(const frc_catalogue_t *cat, const char *tag, frc_time_t t, frc_time_t previous, int full)
{
    static const uint8_t pairs[][2] = {{2, 2}, {3, 2}, {2, 3}, {1, 4}, {5, 1}, {4, 4}, {5, 4}, {0, 2}, {2, 0}};
    static const uint8_t rungs[] = {0, 6, 12, 13, 29, 62};
    static const int32_t offsets[] = {0, 19800, -28800};
    frc_position_t position;
    frc_interval_t interval;
    frc_sync_t sync;
    frc_pentad_t pentad;
    frc_date_t date;
    frc_odometer_t odometer;
    frc_status_t status, interval_status;
    char text[256], ascii[256];
    unsigned level, strokes, k, form, finest;

    printf("%s t %" PRId64 " %d\n", tag, t, frc_catalogue_contains(cat, t));

    printf("%s position", tag);
    status = frc_position_at(cat, t, &position);
    if (status != FRC_OK) {
        printf(" %s", status_name(status));
    } else {
        printf(" %u %" PRIu64 " %" PRIu64, position.ordinal, position.num, position.den);
        put_f64(frc_position_to_double(&position));
    }
    printf("\n");

    printf("%s interval", tag);
    interval_status = frc_interval_at(cat, t, &interval);
    if (interval_status != FRC_OK) {
        printf(" %s", status_name(interval_status));
    } else {
        printf(" %" PRIu64 " %" PRIu64, interval.num, interval.den);
    }
    printf("\n");

    for (level = 0; level <= FRC_CLOCK_MAX_LEVEL + 1; level++) {
        const uint8_t l = (uint8_t)level;
        frc_cycle_t cycle, by_index;
        frc_threshold_t threshold;
        frc_time_t points[5];

        printf("%s cycle %u", tag, level);
        status = frc_cycle_at(cat, t, l, &cycle);
        if (status != FRC_OK) {
            printf(" %s\n", status_name(status));
        } else {
            put_cycle(&cycle);
            printf("\n");
            printf("%s byindex %u", tag, level);
            status = frc_cycle_by_index(cat, l, cycle.cycle, &by_index);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_cycle(&by_index);
            }
            printf("\n");
            printf("%s points %u", tag, level);
            status = frc_cycle_points(cat, l, cycle.cycle, points);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                for (k = 0; k < 5; k++) {
                    put_time(points[k]);
                }
            }
            printf("\n");
            printf("%s name %u", tag, level);
            put_text(frc_format_cycle_name(l, cycle.cycle, 0, text, sizeof text), text);
            put_text(frc_format_cycle_name(l, cycle.cycle, 1, text, sizeof text), text);
            put_text(frc_format_cycle_place(&cycle, text, sizeof text), text);
            printf("\n");
            printf("%s atphase %u", tag, level);
            put_time(frc_time_at_phase(cat, l, cycle.cycle, cycle.phase));
            for (k = 0; k < INVERSE_PHASE_COUNT; k++) {
                put_time(frc_time_at_phase(cat, l, cycle.cycle, INVERSE_PHASES[k]));
            }
            put_time(frc_time_at_phase(cat, l, cycle.cycle + 1u, 0u));
            printf("\n");
        }

        printf("%s threshold %u", tag, level);
        status = frc_next_threshold(cat, t, l, &threshold);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_threshold(&threshold);
            if (threshold.time != FRC_TIME_NONE) {
                frc_span_t to;
                put_time(frc_span_next_change(cat, t, threshold.time, 0));
                put_time(frc_span_next_change(cat, t, threshold.time, 1));
                put_time(frc_span_next_change(cat, t, threshold.time, 4));
                put_time(frc_span_next_change(cat, threshold.time, t, 0));
                put_time(frc_span_next_change_since(cat, t, threshold.time, 0));
                put_time(frc_span_next_change_since(cat, t, threshold.time, 4));
                put_time(frc_span_next_change_since(cat, threshold.time, t, 0));
                put_time(frc_span_next_change_since(cat, t, t, 1));
                if (frc_span_between(cat, t, threshold.time, &to) == FRC_OK) {
                    put_text(frc_format_span_signed(&to, 0, text, sizeof text), text);
                }
            }
        }
        printf("\n");

        if (!full && level % 6 != 0) {
            continue;
        }
        for (strokes = 0; strokes <= FRC_MAX_STROKES + 1; strokes++) {
            frc_glyph_t glyph;
            printf("%s glyph %u %u", tag, level, strokes);
            status = frc_glyph_at(cat, t, l, (uint8_t)strokes, &glyph);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_glyph(&glyph);
            }
            printf("\n");
        }
        for (k = 0; k < sizeof pairs / sizeof pairs[0]; k++) {
            printf("%s odometer %u %u %u", tag, level, pairs[k][0], pairs[k][1]);
            status = frc_odometer_at(cat, t, l, pairs[k][0], pairs[k][1], &odometer);
            if (status != FRC_OK) {
                printf(" %s", status_name(status));
            } else {
                put_odometer(&odometer);
            }
            printf("\n");
        }
    }

    printf("%s sync", tag);
    status = frc_sync_at(cat, t, &sync);
    if (status != FRC_OK) {
        printf(" %s", status_name(status));
    } else {
        put_sync(&sync);
        put_time(frc_time_at_sync_phase(cat, sync.sync, sync.phase));
    }
    printf("\n");
    for (k = 0; k < 2; k++) {
        printf("%s syncodometer %u", tag, k);
        status = frc_sync_odometer(cat, t, (uint8_t)(k == 0 ? 2 : 3), (uint8_t)(k == 0 ? 3 : 2), &odometer);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_odometer(&odometer);
        }
        printf("\n");
    }

    printf("%s pentad", tag);
    status = frc_pentad_at(cat, t, &pentad);
    if (status != FRC_OK) {
        printf(" %s", status_name(status));
    } else {
        put_pentad(&pentad);
        for (form = 0; form <= 4; form++) {
            put_text(frc_format_pentad(&pentad, (frc_pentad_form_t)form, 0, text, sizeof text), text);
            put_text(frc_format_pentad(&pentad, (frc_pentad_form_t)form, 1, text, sizeof text), text);
        }
    }
    printf("\n");

    printf("%s date", tag);
    status = frc_date_at(cat, t, &date);
    if (status != FRC_OK) {
        printf(" %s\n", status_name(status));
    } else {
        frc_time_t blink_start = 0;
        frc_date_t parsed;
        frc_unit_t parsed_finest = FRC_UNIT_ALPHA;

        int unit;

        put_date(&date);
        printf("\n");
        printf("%s dateterm", tag);
        for (unit = -1; unit <= FRC_UNIT_COUNT; unit++) {
            put_text(frc_format_date_term(&date, (frc_unit_t)unit, text, sizeof text), text);
        }
        printf("\n");
        for (form = 0; form <= 4; form++) {
            for (finest = FRC_UNIT_GAMMA; finest <= FRC_UNIT_COUNT; finest++) {
                int written = frc_format_date(&date, (frc_date_form_t)form, (frc_unit_t)finest, text, sizeof text);
                printf("%s dateform %u %u", tag, form, finest);
                put_text(written, text);
                if (written >= 0) {
                    put_text(frc_to_ascii(text, ascii, sizeof ascii), ascii);
                }
                printf("\n");
            }
        }
        printf("%s datetime", tag);
        status = frc_date_to_time(cat, &date, &blink_start);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_time(blink_start);
        }
        printf("\n");

        /* the stamp reads back whole; a short form needs the date as its context */
        (void)frc_format_date(&date, FRC_DATE_LETTERS, FRC_UNIT_BLINK, text, sizeof text);
        printf("%s parse", tag);
        status = frc_parse_date(text, NULL, &parsed, &parsed_finest);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_date(&parsed);
            printf(" %d", (int)parsed_finest);
        }
        printf("\n");
        (void)frc_format_date(&date, FRC_DATE_SHORT, FRC_UNIT_PREON, text, sizeof text);
        printf("%s parseshort", tag);
        status = frc_parse_date(text, &date, &parsed, &parsed_finest);
        if (status != FRC_OK) {
            printf(" %s", status_name(status));
        } else {
            put_date(&parsed);
            printf(" %d", (int)parsed_finest);
        }
        status = frc_parse_date(text, NULL, &parsed, &parsed_finest);
        printf(" %s\n", status_name(status));
    }

    if (previous != FRC_TIME_NONE) {
        dump_span_between(cat, tag, "span", previous, t);
        dump_span_between(cat, tag, "spanback", t, previous);
    }

    for (k = 0; k < sizeof offsets / sizeof offsets[0]; k++) {
        frc_civil_t civil;
        frc_civil_from_time(t, offsets[k], &civil);
        printf("%s civil %" PRId32, tag, offsets[k]);
        put_civil(&civil);
        put_text(frc_format_civil(&civil, offsets[k], text, sizeof text), text);
        put_time(frc_time_from_civil(&civil, offsets[k]));
        printf("\n");
        printf("%s civiltext %" PRId32, tag, offsets[k]);
        for (form = 0; form < FRC_CIVIL_FORM_COUNT; form++) {
            put_text(frc_format_civil_text(&civil, offsets[k], (frc_civil_form_t)form, text, sizeof text), text);
        }
        printf("\n");
    }

    if (interval_status == FRC_OK) {
        const frc_speed_t vacuum = frc_medium_speed(FRC_MEDIUM_VACUUM);
        for (k = 0; k < sizeof rungs / sizeof rungs[0]; k++) {
            frc_sci_t value;
            printf("%s rung %u", tag, rungs[k]);
            if (frc_period(rungs[k], interval, &value) == FRC_OK) {
                put_sci(&value);
            }
            if (frc_frequency(rungs[k], interval, &value) == FRC_OK) {
                put_sci(&value);
            }
            if (frc_length(rungs[k], interval, vacuum, &value) == FRC_OK) {
                put_sci(&value);
            }
            put_text(frc_format_period(rungs[k], interval, 4, text, sizeof text), text);
            put_text(frc_format_frequency(rungs[k], interval, 4, text, sizeof text), text);
            put_text(frc_format_length(rungs[k], interval, vacuum, 4, text, sizeof text), text);
            put_f64(frc_period_seconds(rungs[k], interval));
            printf(" %d\n", (int)frc_band(rungs[k], interval));
        }
    }
}

int main(void)
{
    char line[64];
    frc_time_t previous = FRC_TIME_NONE;

    dump_static();
    while (fgets(line, sizeof line, stdin) != NULL) {
        long long value;
        if (sscanf(line, "%lld", &value) != 1) {
            continue;
        }
        dump_instant_on(CAT, "saros141", (frc_time_t)value, previous, 1);
        previous = (frc_time_t)value;
    }
    return 0;
}
