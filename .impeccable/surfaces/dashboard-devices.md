# Dashboard device overview

Mode: Operate. Extend the user-approved Bear One UI kit: dark green surfaces, bear identity, Figtree/Bricolage typography, lime selections and chart strokes. The user wants a visual fleet overview with directly accessible device graphs and an animated, helpful bear companion. Live readings and device health remain the primary information priority.

## Direction contract

THESIS: See every accessible unit, recognise its stored-data status, then open its graph through an ordinary device link.

OWN-WORLD: Preserve the approved dark green ground, quiet surfaces, readable green-tinted secondary text, lime selections, rounded controls, and existing bear illustration. Status always combines shape, words and colour; it never claims an air-quality or safety assessment.

FORM: A responsive grid of linked unit cards replaces the former airy list direction, as approved through the UI-kit review. Each card presents identity, workspace/access, primary measurement, compact secondary values and capture age. Detail pages use selectable measurement tiles above a prominent time graph. The animated bear provides contextual interface messages and optional user-triggered speech.

STORY: Scan and search the fleet, filter the visible page by stored-data status, open a unit, select a measurement and time window, inspect a summary and recorded location, then return to the fleet. History pagination and CSV remain available separately.

FIRST VIEWPORT: Retained account/navigation shell, Your units heading and count, bear companion, search/refresh controls, status filters and the first linked units. Avoid a redundant brand eyebrow above the heading. On a device, preserve the title/access context and place measurements and graph before secondary technical details.

SIGNATURE: The recognisable bear responds to real fetch, capture and access states. The graph and summary change together with the selected metric. Speech is opt-in, displays its exact text, can be stopped or muted, and never autoplays.

RESPONSIVE: Cards flow from a desktop grid to a mobile column. Measurement tiles scroll horizontally on narrow screens, time controls remain usable, and the navigation changes to the existing mobile bar. Keep keyboard controls, visible focus, accessible plotted readings and reduced-motion behaviour.

BOUNDARIES: Preserve authorization and measurement-versus-receipt semantics. Missing data is explicit; freshness never asserts hardware connectivity. Read at most 24 visible units in small GraphQL batches per refresh, with cancellation and per-unit failures. Preserve zero values, unknown clocks and partial-loading states. No new auth, simulated production data, invented location or inferred factory pass/fail. Do not expand permissions or change ownership for this release.

## Integrated device monitoring

The primary device overview contains latest measurements, automatically loaded time graph, numeric window summary, and recorded location. Default to the latest 200 stored readings so inactive units remain inspectable; offer rolling 24-hour, 7-day and 14-day windows. Label partial pages and keep full pagination/CSV in History & export. Summaries describe loaded measurements only and never imply time-weighted averages, regulatory assessments or factory acceptance. Maps use reported or registered coordinates only and distinguish stored position from a live GPS fix. Missing coordinates produce an empty state rather than a default city. Sparse samples remain visible as dots while gaps remain unconnected.

Acceptance: no device dropdown; searchable accessible metadata; 24-unit pagination; truthful capture-age labels; ordinary unit URLs and browser back; automatic graphs and working metric/range controls; zero/missing/error/access states; optional speech; keyboard and desktop/mobile layouts; existing per-device access enforcement; development showcase excluded from production.

Research: Carbon resource discovery and ThingsBoard progressive device detail informed the original navigation. The user-approved Bear One kit now supplies the card-grid and graph-led visual authority. Preserve the consumer audience and concise language rather than turning it into a dense administrative table.
