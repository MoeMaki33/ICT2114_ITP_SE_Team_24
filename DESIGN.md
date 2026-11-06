---
version: alpha
name: Corrosion Protection Monitoring — Newcastle University
description: >-
  Codified design system for the SE Team 24 cathodic-protection monitoring app.
  Standardisation pass over the existing Newcastle University palette and
  Poppins type — no redesign. Resolves 242 ad-hoc hex values, 20 corner radii,
  30 shadows and 24 breakpoints into fixed scales, and settles one standard each
  for modals, tables, status chips, type tags, KPI cards, buttons, inputs and toasts.
colors:
  primary: "#0073bc"
  primary-strong: "#003a65"
  primary-soft: "#eaf7fe"
  focus: "#29b7ea"
  ink: "#051435"
  ink-muted: "#5f7086"
  surface: "#ffffff"
  surface-sunken: "#f3f8fc"
  border: "#d8e7f2"
  border-field: "#c9dbea"
  protected: "#00857e"
  protected-fill: "#e0f0f0"
  protected-ink: "#005e59"
  warning: "#fdc82f"
  warning-fill: "#fff1cb"
  warning-ink: "#705000"
  unprotected: "#da1a35"
  unprotected-fill: "#fbe4e7"
  unprotected-ink: "#9f1025"
  unknown-fill: "#eef2f6"
  unknown-ink: "#526173"
typography:
  display:
    fontFamily: Poppins
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  heading-lg:
    fontFamily: Poppins
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  heading-md:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  body-sm:
    fontFamily: Poppins
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-md:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.2
  label-caps:
    fontFamily: Poppins
    fontSize: 11px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0.06em
  label-caps-sm:
    fontFamily: Poppins
    fontSize: 10px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: 0.08em
  numeric-lg:
    fontFamily: Poppins
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.01em
    fontFeature: "'tnum' 1, 'lnum' 1"
  numeric-md:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.45
    fontFeature: "'tnum' 1, 'lnum' 1"
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  cell-x: 12px
  cell-y: 10px
  card-padding: 20px
  modal-padding: 24px
  page-gutter: 24px
  content-max: 1280px
  measure: 68
  breakpoint-sm: 600px
  breakpoint-md: 960px
  breakpoint-lg: 1280px
rounded:
  sm: 8px
  md: 10px
  lg: 14px
  xl: 18px
  full: 999px
components:
  page:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  rule-hairline:
    backgroundColor: "{colors.border}"
    height: 1px
  rule-field:
    backgroundColor: "{colors.border-field}"
    height: 1px
  focus-ring:
    backgroundColor: "{colors.focus}"
    height: 3px
  sidebar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    width: 245px
  sidebar-item-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "{spacing.modal-padding}"
  modal-title:
    typography: "{typography.heading-lg}"
    textColor: "{colors.ink}"
    backgroundColor: "{colors.surface}"
  modal-close:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.full}"
    size: 32px
  modal-close-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.surface}"
  button-primary-sm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 32px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
  button-secondary-sm:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 32px
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 40px
  button-ghost-hover:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.primary-strong}"
  button-danger:
    backgroundColor: "{colors.unprotected}"
    textColor: "{colors.surface}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 40px
  button-danger-hover:
    backgroundColor: "{colors.unprotected-ink}"
    textColor: "{colors.surface}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 40px
  input-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  input-placeholder:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-lg}"
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.unprotected-ink}"
    rounded: "{rounded.md}"
  input-readonly:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
  input-disabled:
    backgroundColor: "{colors.unknown-fill}"
    textColor: "{colors.unknown-ink}"
    rounded: "{rounded.md}"
  field-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
  table-header:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.primary-strong}"
    typography: "{typography.label-caps}"
    padding: 12px
    height: 40px
  table-header-sorted:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.primary}"
    typography: "{typography.label-caps}"
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    padding: 12px
    height: 44px
  table-row-hover:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
  table-cell-numeric:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.numeric-md}"
  table-empty:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-lg}"
    padding: "{spacing.3xl}"
  chip-protected:
    backgroundColor: "{colors.protected-fill}"
    textColor: "{colors.protected-ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 24px
  chip-warning:
    backgroundColor: "{colors.warning-fill}"
    textColor: "{colors.warning-ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 24px
  chip-unprotected:
    backgroundColor: "{colors.unprotected-fill}"
    textColor: "{colors.unprotected-ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 24px
  chip-unknown:
    backgroundColor: "{colors.unknown-fill}"
    textColor: "{colors.unknown-ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 10px
    height: 24px
  tag-type:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-caps-sm}"
    rounded: "{rounded.sm}"
    padding: 6px
    height: 20px
  kpi-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  kpi-value:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.numeric-lg}"
  kpi-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-caps}"
  kpi-icon:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-strong}"
    rounded: "{rounded.md}"
    size: 40px
  toast:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 14px
    width: 380px
  toast-rail-protected:
    backgroundColor: "{colors.protected}"
    width: 4px
  toast-rail-warning:
    backgroundColor: "{colors.warning}"
    width: 4px
  toast-rail-unprotected:
    backgroundColor: "{colors.unprotected}"
    width: 4px
  toast-rail-info:
    backgroundColor: "{colors.primary}"
    width: 4px
---

# Corrosion Protection Monitoring — Design System

## Overview

This is an instrument panel, not a product site. A corrosion engineer opens it to answer
one question — *is this structure still protected?* — and then to answer it again for the
next forty test points. The screens that matter are a weekly summary table, a dashboard of
attention-worthy locations, a per-test-point history, and an asset map. Readings arrive as
negative millivolts and are judged against a threshold stored per test point: **≤ −850 mV is
Protected**, above it is not, and no reading at all is a third state that must never be
mistaken for either.

So the register is **institutional and dense**. Newcastle University's blues carry the
identity; everything else is apparatus. The system is tuned for a user who is scanning rather
than reading: tabular figures, tight row heights, uppercase micro-labels, and a palette where
exactly four fills mean something and nothing else is coloured at all.

**What this system gives up.** Warmth, and air. Row heights are 44px, body copy is 13px, and
cards are packed. A first-time visitor will find it busy; a daily user will find it fast. That
trade is deliberate and it is the reason the document exists — the drift this pass cleans up
happened because individual screens kept reaching for a bit more breathing room one page at a
time, and the app stopped looking like one application.

**Status is never communicated by colour alone.** Every protection state carries a glyph and a
word as well as a fill. Readings get taken in the field, printed, photocopied and pasted into
reports; a system that relies on a green-vs-red distinction fails on all four.

**This is a codification pass, not a redesign.** Where an existing value was already the most
common and the most defensible, it survives unchanged. Where seven values were doing one job,
one of the seven was promoted and the rest are errors.

## Colors

The palette is Newcastle University's, which is a hard constraint rather than a choice, and
the work here was in the neutrals and in the semantic fills.

- **Primary — NU Digital Blue (#0073bc).** The single interaction colour. It marks the primary
  action, the active sort, the active nav item and the selected map pin. It appears nowhere
  decorative. One accent, one job.
- **Primary Strong — NU Rich Blue (#003a65).** The pressed and hover state of primary, and the
  ink for table headers and secondary-button labels. Dark enough (11.7:1 on white) to carry
  small uppercase text that #0073bc cannot.
- **Primary Soft — NU Pale Blue (#eaf7fe).** The only tinted fill in the system: hovered table
  rows, hovered secondary buttons, KPI icon tiles. It reads as "the cursor is here", nothing more.
- **Focus — NU Bright Blue (#29b7ea).** Reserved entirely for the focus ring. Nothing else in
  the app may use it, which is what makes keyboard focus unmistakable on a page already full of
  blue.
- **Ink (#051435)** and **Ink Muted (#5f7086).** The neutrals are *not* grey — both carry the
  NU dark-blue hue, which is why text sits on a blue-tinted page without the dishwater cast that
  true greys produce over a cool background. Ink is every value, heading and table cell. Ink
  Muted is every label, caption, unit and placeholder, at 5.06:1 on white. There is no third
  neutral text colour; if something needs to recede further it gets smaller, not lighter.
- **Surface (#ffffff)** and **Surface Sunken (#f3f8fc).** The page is the tinted one and the
  cards are the white one — depth runs the opposite way from the usual white-page/grey-card
  arrangement, which is what lets the app drop shadows almost entirely. Pure white is permitted
  *only* as a raised surface, never as a page background.
- **Border (#d8e7f2)** and **Border Field (#c9dbea).** Two hairlines, and the difference is
  load-bearing: card and table rules are the lighter one, input outlines are the darker one, so
  an editable field is distinguishable from a static panel at a glance without any other cue.

### The four protection states

These are derived from the NU palette rather than imported from a stock alert set, and each is
a triplet — a saturated hue for rails and markers, a fill, and an ink that passes AA on that fill.

- **Protected (#00857e, fill #e0f0f0, ink #005e59)** — NU Digital Teal, not green. Reading ≤ −850 mV.
- **Warning (#fdc82f, fill #fff1cb, ink #705000)** — NU Yellow, with a brown-amber ink because
  the brand yellow cannot carry text at any size. Within tolerance of the threshold but trending.
- **Unprotected (#da1a35, fill #fbe4e7, ink #9f1025)** — NU Red. Reading above threshold.
- **No Data / Unknown (fill #eef2f6, ink #526173)** — deliberately colourless. The absence of a
  reading is not a mild version of a bad reading, and giving it a hue would imply a measurement
  that was never taken.

The fills are the exact composites of the current 12%/25%/12% alpha overlays on white, so this
is the shipped appearance pinned to fixed hex — they stop shifting the moment a chip is placed
on a hovered row or a sunken panel.

## Typography

**Poppins, alone, at three weights.** Poppins is Newcastle University's brand typeface, so this
is the legitimate brand-mandate exception to picking a less ubiquitous face — and because there
is only one family, the hierarchy has to be carried by **case, tracking and weight** rather than
by a display/apparatus pairing. That is the second sacrifice in this system, and it is why the
`label-caps` levels exist at all.

- **Weights are 400, 600 and 800.** Each has a job: 400 is body and table data, 600 is every
  heading, label and button, 800 is uppercase micro-labels only. The shipped CSS also used 500,
  650, 700 and 750 — those are all errors, and 700 in particular was doing 43 different jobs.
- **Tracking moves with size.** Display and headings are tracked in (−0.02em down to −0.005em)
  because Poppins' default spacing is drawn for text sizes and looks loose at 28px. The uppercase
  labels are tracked out (+0.06em, +0.08em at 10px) because set solid, Poppins caps read as a
  single word-shape.
- **Line height moves against size** — 1.1 at display, 1.45–1.5 for body, 1.0 for the caps labels,
  which are always single-line.
- **The scale is ~1.2 from a 13px body**, hand-adjusted: 10, 11, 12, 13, 14, 16, 20, 24, 28. A
  1.2 ratio is right for dense UI, and the shipped sizes already clustered at 11/12/13 — this
  keeps that density and removes 9px, 15px, 17px, 19px, 21px, 22px, 23px, 26px, 27px, 30px, 38px
  and the eleven loose `rem` and `clamp()` values.
- **Numerals are tabular and lining** (`numeric-md`, `numeric-lg`). Every millivolt reading,
  threshold, count and KPI figure uses them, so columns of readings align on the decimal and
  digits do not jitter when a value updates. This is the whole reason numeric levels are separate
  tokens rather than a body style with a utility class.
- **Body measure is capped at 68 characters.** It applies to the few prose areas — empty states,
  modal help text, import instructions. Table cells are exempt.

## Layout

A fixed 245px sidebar, a sticky topbar, and a fluid content column capped at 1280px with a 24px
page gutter. Content is **flush-left throughout**; nothing is centred except modal dialogs and
empty states, because in a scanning interface a stable left edge is worth more than symmetry.

**Spacing is a 4px scale** — 4, 8, 12, 16, 24, 32, 48 — and nothing lands between steps. The
shipped CSS used 5, 7, 9, 11, 13, 14, 18, 21 and 26px paddings; those are rounded onto the scale.
Cards take 20px of padding, modals 24px, table cells 12px across and 10px down.

**Density varies by rank, not by page.** A KPI strip is sparse (20px padding, 24px figures), a
data table is dense (44px rows, 13px text), and a filter bar sits between them. The same
component must not be denser on one page than another — that was the single largest source of
drift in the audit, with Test Points and Recommended Attention rendering the same table at
different row heights.

**Three breakpoints: 600px, 960px, 1280px.** The audit found twenty-four distinct media queries
across 1099px, 1120px, 1121px, 1200px, 1279px, 1280px, 1400px, 1050px, 991px, 992px, 900px, 820px,
768px, 767px, 720px, 700px, 600px, 560px, 430px, 380px and 340px — a set that cannot be reasoned
about and that produced layouts breaking at different widths on different pages. Below 960px the
sidebar collapses and multi-column grids go to one column; below 600px tables scroll horizontally
inside their card rather than reflowing, because a protection reading is meaningless without its
test point, timestamp and threshold on the same row.

**Grids of equal tiles size themselves; they do not get breakpoints.** A strip of comparable
cards — the dashboard metric row, the Test Points stat row, the weekly location grid — uses
`repeat(auto-fit, minmax(<floor>, 1fr))` and reflows on its own. This is what makes three
breakpoints sufficient: the one component that genuinely wanted four column counts
(`.dashboard-metrics`, at 6 / 3 / 2 / 1) needs none at all this way. It also removes a live
contradiction in the shipped CSS, where two overlapping `min-width: 768px and max-width: 991px`
blocks set that same grid to two columns and to three, with source order deciding. Breakpoints
are reserved for changes of **structure** — the sidebar becoming off-canvas, a two-panel editor
becoming one column — never for counting columns.

## Elevation & Depth

Depth is carried by the **tonal inversion** described in Colors — white cards on a tinted page —
and by the two hairline rules. Shadows are a last resort, and there are exactly two.

- **Raised** (cards, KPI tiles, table cards, the toolbar):
  `0 1px 2px rgba(5, 20, 53, 0.04), 0 8px 20px rgba(5, 20, 53, 0.06)`
- **Overlay** (modals, dropdowns, popovers, toasts, the drawer):
  `0 2px 6px rgba(5, 20, 53, 0.08), 0 24px 60px rgba(5, 20, 53, 0.18)`

Both are two-layer — a tight contact shadow plus a wide ambient one — lit from directly above
(x = 0, positive y), and both are coloured with **Ink (#051435)** rather than neutral black, so
the shadow sits in the same blue family as the page it falls on. The audit found thirty distinct
shadows across four different tint bases (`rgba(15,23,42,…)` — which is Tailwind slate-900 and
belongs to no part of this palette — plus `rgba(0,0,0,…)`, `rgba(0,59,92,…)` and
`rgba(5,20,53,…)`), at eleven blur radii. All collapse into the two above.

Nothing that is not actually above something else gets a shadow. A table row, a chip, a form
field, an inline button and a section heading are flat.

The one directional exception is the sidebar, which casts `6px 0 28px rgba(5, 20, 53, 0.18)`
rightward — it is a fixed panel the content scrolls beneath, so the light direction is horizontal
there and that is intentional, not a third level.

## Shapes

**Radius is hierarchical and tracks surface rank** — the larger and more "above" a thing is, the
rounder it is. This replaces twenty shipped values (0, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18,
20, 22, 24, 28px, 50%, 999px and one asymmetric pair).

- **sm (8px)** — controls living inside a dense surface: pagination buttons, sort buttons, icon
  buttons, type tags, in-table buttons.
- **md (10px)** — standalone interactive controls: buttons, inputs, selects, textareas, KPI icon
  tiles.
- **lg (14px)** — cards, panels, table cards, KPI cards, toasts.
- **xl (18px)** — modals and the drawer. They are the only things that sit above the page, and
  the extra 4px is how you can tell without looking at the shadow.
- **full (999px)** — status chips, avatars and the week navigator only. A pill shape in this app
  means *this is a state*, which is precisely why type tags do not get it (see Components).

Icons are Font Awesome at a consistent 16px in table and button contexts, 20px in KPI tiles,
optically centred on the cap height of the adjacent label rather than on its line box.

## Components

### Modal

**One card, three widths.** The audit found six card classes — `.modal-card` (440px),
`.testpoint-modal-card` (440px), `.reading-modal-card` (640px), `.detail-equipment-modal-card`
(560px), `.detail-import-modal-card` (860px), `.testpoints-import-modal-card` (860px) and
`.position-modal-card` (1120px). They collapse to `sm = 440px` (confirmations, single-column
forms), `md = 640px` (multi-field forms such as Add/Edit Reading), `lg = 960px` (import previews
and the position editor). All three are `min(<width>, calc(100vw − 32px))` with
`max-height: calc(100vh − 32px)` and internal scrolling. 1120px is dropped: the position editor's
two-panel layout works at 960px and a dialog wider than that stops reading as a dialog.

Structure is fixed: **header** (title in `heading-lg`, optional subtitle in `body-md` / Ink Muted,
close button), **body**, **footer actions**. The header and footer do not scroll; the body does.

**The close button is round, 32px, Primary Soft fill with a Primary Strong glyph, going solid
Primary on hover.** Today it is a 28px bare glyph positioned absolutely in five of six modals and
a round sticky button in View Position only, and its hover state turns it into a solid red square
— which reads as a destructive action rather than a dismissal. Round wins because it is the one
control in a modal that is not part of the form, and its shape should say so; red is removed
because closing a dialog destroys nothing.

**Footer actions are right-aligned, primary last**, with 8px between them. Secondary (cancel) is
never the visually heavier button, and a destructive confirm uses `button-danger` while its cancel
stays `button-secondary`.

### Table

Tables are the product, and they were the worst drift: `.app-table` / `.standard-table-card` plus
`table-sort-controller.js` already define the shared standard, but ten page-specific `th` rules
override it (`.weekly-table`, `.dashboard-table` ×2, `.history-table`, `.detail-history-table`,
`.testpoint-management-table`, `.asset-map-data-table`, `.drawer-daily-table`, the
`.testpoints-page`/`.detail-page` scoped pair, and a late global block). The standard below is
`.app-table`'s, with the header colour resolved in favour of the late global block.

- **Header** — Surface Sunken background, Primary Strong text, `label-caps` (11px/800/uppercase/
  +0.06em), 40px tall, 12px horizontal padding, bottom hairline in Border. Sticky when the table
  scrolls inside a fixed-height card. The competing header treatments (`#f9fafb`/`#4b5563`,
  `#fff`/`#9ca3af`, `#f8fafc`/`#475569`, `#f8fbfe`/`#003a65`, `#f3f8fc`/`#003a65`, 11/12/14px,
  weights 700 and 800) are all errors.
- **Row** — Surface background, Ink text, `body-md`, **44px tall**, 12px/10px cell padding, bottom
  hairline in Border. One height everywhere; Test Points at 12px/10px and Recommended Attention at
  13px were the user-visible symptom.
- **Hover** — Primary Soft fill on the whole row, no shadow, no border change. Selected rows add a
  4px Primary left rail (the asset-map pattern, promoted).
- **Numeric columns** — right-aligned, `numeric-md`, tabular figures. Every millivolt, threshold,
  count and percentage. The header of a numeric column is right-aligned too, including its sort
  control. A unit (`mV`, `°C`, `µS/cm`, `mg/L`, `pH`) belongs in the header, not repeated in each cell.
- **Sortable vs non-sortable headers** — a sortable header's label is a `<button>` filling the
  cell; a non-sortable header is plain text. That difference must be visible before hover: sortable
  headers carry the sort glyph in its neutral state, non-sortable headers carry nothing and have no
  hover treatment.
- **Sort indicator, three states.** *None*: an opacity-45 up/down chevron pair in Ink Muted,
  always rendered, so the column's affordance is visible. *Ascending*: a single up chevron, header
  text and glyph in Primary, `aria-sort="ascending"`. *Descending*: the same in Primary with a down
  chevron. The active colour is Primary everywhere — `#00a05a`, `#2f855a` and `#0073bc` are
  currently all in use for this one state, and the two greens are not in the palette at all.
- **Empty state** — a single full-width cell, 48px of vertical padding, centred, Ink Muted,
  `body-lg`, one sentence that says what is missing and what to do (*"No readings in this period.
  Widen the date range or import a batch."*). No illustration, no icon.

### Status chip

One component, four variants, used for every protection state on every screen. Pill-shaped, 24px
tall, 10px horizontal padding, `label-caps`, **glyph + word always**:

| State | Glyph | Label | Fill / Ink |
|---|---|---|---|
| Protected (≤ −850 mV) | `fa-circle-check` | PROTECTED | `#e0f0f0` / `#005e59` |
| Warning | `fa-triangle-exclamation` | WARNING | `#fff1cb` / `#705000` |
| Unprotected | `fa-circle-xmark` | UNPROTECTED | `#fbe4e7` / `#9f1025` |
| No Data | `fa-circle-minus` | NO DATA | `#eef2f6` / `#526173` |

All four pairs clear 5.6:1. The glyph is not decorative — it is the non-colour channel, and it is
the reason this table exists rather than a sentence. Chips never change size by context: the
`.standard-table-card .badge` override to 13px/8px×14px is an error, as are the 9px
`.dashboard-condition-badge` and the 10px uppercase `.weekly-condition-badge`. The shipped
`.app-status-badge` classes are already exactly this spec but are used on one page out of six;
rolling them out is the work.

### Type tag

Test point type (`stationary` / `variable`) is **not a status** and must not look like one. Today
it renders as `<span class="testpoint-inline-pill gray">`, which is pixel-identical to the No Data
status chip — so a column of stationary points reads at a glance as a column of missing readings.

The type tag is therefore **outlined, not filled; square-cornered (`sm`, 8px), not pill; 20px tall,
not 24; `label-caps-sm` in Ink Muted on Surface, with a 1px Border Field outline.** Three
differences in shape, weight and fill, so the distinction survives a greyscale print. Type never
takes a semantic colour, because `variable` is not better or worse than `stationary` — it only
means the point has a rectifier and therefore a power input.

### KPI card

One style. The Test Points icon tiles win over the Asset Map "Map Details" grey cards, because an
icon tile scans faster in a row of six and the grey card is indistinguishable from a disabled panel.

Surface background, `lg` radius, 20px padding, the raised shadow, and a two-column grid: a 40px
`md`-radius Primary Soft icon tile on the left, and on the right a `numeric-lg` value above a
`label-caps` Ink Muted label. **The icon tile is always Primary Soft** — the current
blue/green/grey/red/orange tile variants duplicate information the value and its status chip
already carry, and they put the accent on five tiles at once.

Figures are 24px (not 30px as in `.stat-card` and not 24px-with-different-padding as in
`.testpoints-stat-card`). A delta, where shown, sits beneath the label in `body-sm` with its own
arrow glyph and one of the four state inks.

### Buttons

Four variants, two sizes. Every button is an `inline-flex` with 8px between glyph and label, and
`md` radius at `md` size / `sm` radius at `sm` size.

| Variant | Use | Fill / Text |
|---|---|---|
| Primary | The one committing action per view — Save, Import, Add Reading | Primary / Surface |
| Secondary | Everything else that navigates or opens — View, View Position, View Details, Filters, Refresh | Surface / Primary Strong, 1px Border Field outline |
| Ghost | Toolbar affordances that are not actions on data — Reset, column toggles | Surface / Ink Muted, no outline |
| Danger | Delete and irreversible confirms only | Unprotected / Surface |

**md = 40px tall, 16px horizontal padding, `label-md`.** For top-level page and modal actions.
**sm = 32px tall, 12px horizontal padding, `body-sm`.** For controls inside a table row or a dense
toolbar — and that is the *only* legitimate reason to use it.

This settles five competing sizes: `.btn` at 10px/16px, `.hero-btn` at 8px/15px with 12px text and
a 44px min-height, `.asset-map-table-actions .btn.compact` and `.position-map-actions .btn.compact`
at 6px/8px with 10px text, and `.dashboard-table .btn.compact` at 5px/11px with 10px text and an
8px radius. The row-level View / View Position / View Details buttons are all `secondary-sm`; the
map picker buttons are `secondary-sm`; Filters and Refresh are `secondary-md` and Reset is
`ghost-md`.

Disabled buttons drop to 45% opacity and keep their variant colours, so a disabled primary is still
recognisably the primary action.

### Input

40px tall, `md` radius, 12px padding, `body-lg`, Surface fill, Ink text, 1px Border Field outline.
Labels sit above in `label-md`, Ink.

- **Focus** — outline becomes 1px Primary plus a 3px Focus ring at 2px offset. The ring colour is
  used nowhere else.
- **Error** — outline 1px Unprotected, message below in `body-sm` / Unprotected Ink, prefixed with
  `fa-circle-exclamation`. The field's text colour does not change.
- **Read-only** — **Surface Sunken fill, no outline, Ink Muted text, and a right-aligned
  `fa-lock` glyph.** Today only `.settings-field input[readonly]` is styled at all, and everywhere
  else a read-only field is pixel-identical to an editable one, which is the complaint. Removing
  the outline is the load-bearing part: an outline is the affordance, so a field without one does
  not invite a click.
- **Disabled** — Unknown Fill, Ink-muted-dark text, 60% opacity, `not-allowed` cursor. Distinct from
  read-only: read-only means *this value is real but you cannot change it here*, disabled means
  *this control is not available yet*.
- **Placeholder** — Ink Muted, **italic**, and phrased as a format hint, never as a plausible value.
  `placeholder="e.g. −875"`, not `placeholder="-875mV"`; `placeholder="e.g. 28.4"`, not
  `placeholder="28.4 deg C"`. The shipped placeholders on testpoint-update and testpoint-view read
  as entered readings, which in a data-entry form that writes to a protection record is a safety
  issue rather than a cosmetic one. Units belong in the field label or a suffix adornment, not in
  the placeholder — and the conductivity hint must read **µS/cm**, not the `mS/cm` currently in
  `testpoint-update.php` and `history.js`, which contradicts the agreed unit and is out by 1000×.

### Toast

380px, bottom-right, stacked upward with 10px gaps, `lg` radius, Surface fill, Ink text,
`body-md`, the overlay shadow, and a **4px left rail** in Protected / Warning / Unprotected /
Primary for success / warning / error / info. Each carries the matching state glyph and a close
button. Enter 180ms, exit 140ms. Success auto-dismisses at 4s; error and warning persist until
dismissed, because the user may have looked away from a long import.

### Motion

Three durations and two easings, and that is all. **Fast (140ms, ease-out)** for state changes —
hover, focus, chip and button fills. **Medium (200ms, ease-out)** for things entering: modals,
dropdowns, toasts, the drawer. **Exit (140ms, ease-in)** for the same things leaving. Entering
decelerates, leaving accelerates.

**What does not animate:** table rows, sort order changes, chart redraws on filter change, page
transitions, KPI value updates, and anything triggered by scrolling. A reading that fades in is a
reading the engineer waits for. All motion is suppressed under `prefers-reduced-motion: reduce`.

## Do's and Don'ts

- **Do** communicate every protection state with a glyph and a word as well as a fill. Never colour alone.
- **Do** use `{colors.primary}` for exactly one thing per view: the committing action. If two buttons on a screen are blue, one of them is wrong.
- **Don't** add a colour. The palette is twenty-one tokens and it is complete; `#00b050`, `#00a05a`, `#2f855a`, `#7c3aed`, `#2f2f35` and the Tailwind slate and gray ramps found in the audit are not in it and must not come back.
- **Don't** style a status in a page-specific rule. If a chip looks wrong on one page, the fix is in the shared component, not in a `.weekly-` or `.dashboard-` override.
- **Do** keep type tags outlined and square. The moment a type tag is filled and pill-shaped it is a status chip, and the table lies.
- **Don't** give a table header a new background, text colour or font size per page. There is one `table-header`.
- **Do** right-align and tabularise every numeric column, header included.
- **Don't** use `sm` buttons outside a table row or a dense toolbar, and don't use `md` buttons inside one.
- **Do** strip the outline from read-only fields. An outline is a promise that the field is editable.
- **Don't** write a plausible value into a `placeholder`. Format hints only, prefixed `e.g.`, units in the label.
- **Do** write `µS/cm` for conductivity, `mV` for potential, `°C`, `pH`, `mg/L` — and never flip the sign on a millivolt reading.
- **Don't** put a shadow on anything that is not above something else. Rows, chips, fields and inline buttons are flat.
- **Do** land every dimension on the 4px scale and every radius on one of the five steps.
- **Don't** add a breakpoint to change a column count — use `auto-fit` with a sensible `minmax()` floor. The three breakpoints are for structural changes only, and a layout that needs a fourth is a layout that is too fragile.
- **Do** escape interpolated data before it reaches `innerHTML` — the shared `escapeHtml()` helper, or `textContent`.
- **Don't** animate data. Chips, values, rows and charts appear; they do not fade, slide or count up.
