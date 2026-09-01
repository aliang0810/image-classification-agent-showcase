# Image Classification Agent Design System

## Visual Direction

A restrained technical case study for an AI classification workflow. The interface should feel like engineering documentation presented with editorial clarity: near-black surfaces, precise hairlines, product UI as the main visual, and one cyan-green accent for active states and key results.

## Tokens

### Color

- Canvas: `#0b0d0e`
- Surface 1: `#111416`
- Surface 2: `#15191b`
- Surface 3: `#1a1f21`
- Primary text: `#f2f4f2`
- Secondary text: `#b4bbb7`
- Muted text: `#7e8883`
- Accent: `#68d5bd`
- Hairline: `rgba(242, 244, 242, 0.11)`
- Strong hairline: `rgba(242, 244, 242, 0.24)`

Blue, amber, green, and red are reserved for workflow semantics. They must not become general decorative accents.

### Typography

- Display and body: Manrope with system sans-serif fallbacks.
- Technical labels and identifiers: DM Mono with system monospace fallbacks.
- Headlines use weight 500 or 600.
- Body uses weight 400 with generous line height.
- Monospace is limited to section labels, IDs, status, metrics metadata, and code.
- Letter spacing is `0` for narrative copy. Small uppercase technical labels may use modest positive tracking.

### Spacing

Use a 4px base scale:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 112`

Major sections use 112px vertical spacing on desktop and 72px on mobile.

## Layout

- Content width: maximum 1180px.
- Major sections: AGENT, PROMPT, RCA, RESULT.
- Every section starts with the same two-column heading pattern: technical eyebrow on the left, title and summary on the right.
- Section headings use a top datum line and a low-contrast oversized index as the shared navigation coordinate.
- Product and data surfaces use the surface ladder and 1px hairlines.
- Prefer full-width structured panels over collections of floating cards.
- Keep one primary visual or data statement per viewport.

## Ambient Background

- Use a fixed 48px technical grid, edge calibration ticks, and sparse cyan-green circuit pulses.
- Add bounded radar rings, labelled topology nodes, moving data packets, and one compact signal scope to imply live system activity.
- Edge telemetry may show terse system codes and counts; it stays decorative, non-interactive, and below content contrast.
- Reserve the wireframe kinetic core for the first viewport and fade it as the page scrolls.
- Build the core from three orbital planes, segmented instrument rings, radial calibration ticks, and a counter-rotating hexagonal reactor. Avoid dense random ellipses.
- Keep the background monochromatic and low contrast behind long-form content.
- Do not combine topographic waves, colorful particles, and decorative blocks in the same scene.

## Components

### Navigation

- Sticky 64px header.
- Active section uses the accent underline.
- Inactive links use secondary text.

### Panels

- Radius: 6px maximum for standard panels.
- Default elevation: surface contrast plus a 1px hairline.
- Do not use decorative drop shadows.
- Hover may lift one surface level and reveal a 2px accent indicator.

### Tabs

- Tabs stay rectangular with 3-4px radius.
- Active tabs use Surface 3 and an inset accent line.
- Tab labels remain concise and stable in width.

### Metrics

- Use large sans-serif numerals.
- Accent only the primary metric or treatment value.
- Always show metric name, denominator or comparison context, and data-scope notes.

### Workflow

- Treat the workflow canvas as the product screenshot.
- Keep toolbar, overview, detail mode, lineage controls, and inspector visually subordinate to the graph.
- Semantic colors are allowed only to distinguish node roles and paths.

## Motion

- Motion communicates system activity, navigation, or state change.
- Ambient effects stay behind content and never reduce text contrast.
- Hover and selection transitions use 160-240ms.
- Respect `prefers-reduced-motion`.

## Responsive Behavior

- Desktop: multi-column layouts and full workflow workspace.
- Tablet: two-column process grids; horizontally scrollable tab rails.
- Mobile: single-column content, 44px minimum touch targets, no page-level horizontal overflow.
- Fixed-format diagrams retain stable dimensions inside their own scroll or pan container.

## Do

- Use one cyan-green accent consistently.
- Use surface levels and hairlines to create hierarchy.
- Make the workflow, Prompt rules, RCA logic, and outcome metrics the visual protagonists.
- Keep Chinese explanations direct and use English labels only as technical metadata.
- Preserve clear active, hover, focus, and selected states.

## Don't

- Do not add gradient orbs, decorative glass cards, or soft marketing shadows.
- Do not introduce extra accent colors without semantic meaning.
- Do not use monospace for paragraphs.
- Do not nest cards inside cards.
- Do not use pill shapes for standard controls.
- Do not hide methodology or denominator context behind headline metrics.
