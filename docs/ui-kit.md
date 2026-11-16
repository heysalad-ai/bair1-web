# Bear One UI kit

The dashboard's shared tokens, components and motion rules. Review them live with `npm run dev` at **/ui-kit** (development only — the route returns 404 in production builds). Everything on that page is generated sample data, labelled as such, and never touches authentication or stored readings.

## Files

| Area | Location |
| --- | --- |
| Tokens and primitive styles | `src/app/ui-kit.css` (imported by `globals.css`) |
| Buttons, icon buttons, status indicator, segmented control, skeleton, breadcrumbs, icons | `src/components/ui/kit.tsx` |
| Empty / error / unavailable / access-denied / loading | `src/components/ui/StateMessage.tsx` |
| Bear illustration (animatable vector of `public/bear-logo.png`) | `src/components/bear/BearFigure.tsx` |
| Bear companion (message, opt-in speech) | `src/components/bear/BearCompanion.tsx` |
| Bear moods and messages from UI state | `src/lib/bear-state.ts` |
| Data-status tones, counts, new-capture detection | `src/lib/fleet-insights.ts` |
| Spoken summary text | `src/lib/spoken-summary.ts` |
| Fleet overview (presentational) | `src/components/fleet/FleetView.tsx` |
| Unit overview (presentational), chart, location | `src/components/device/*` |
| Data containers (authenticated fetching only) | `src/components/DeviceFleet.tsx`, `src/components/DeviceDetail.tsx` |

Presentational views receive data as props; only the containers call `useAuthenticatedFetch`. The showcase renders the presentational views directly, so no fetch override or auth bypass exists.

## Colour

Dark, committed green ground (`--b1-bg`, `--b1-surface`, `--b1-surface-2/3`). Text tokens `--b1-ink`, `--b1-ink-2`, `--b1-muted` all meet WCAG AA (≥ 4.5:1) on surfaces. `--b1-primary` is reserved for focus, selection and chart lines.

Status colours (`--b1-ok`, `--b1-warn`, `--b1-stale`, `--b1-info`, `--b1-danger`, `--b1-neutral`) describe **stored-data status only** — never air quality, health or safety. Every status pairs colour with a distinct glyph and a word:

| Tone | Glyph | Label |
| --- | --- | --- |
| recent | filled dot | Recent data |
| delayed | half-filled dot | Delayed data |
| stale | ring | No recent data |
| unknown | diamond | Capture time unknown |
| nodata | dash | No readings yet |
| error | triangle | Unable to load |

The bear's orb follows the same rule: lime when resting, an amber ring for "attention", hollow grey when empty. It does not rate air.

## Type and spacing

Bricolage Grotesque for display (`.b1-title`, `.b1-h2`, unit names), Figtree for body. Numbers use tabular figures (`.b1-num`). Kit headings opt out of the editorial h1–h3 fluid scale in `globals.css` via the `b1-` class prefix. Spacing steps: 4, 8, 12, 16, 24, 32 px. Radii: 8 / 14 / 20 px.

## Components

- **Button** — `default`, `primary`, `ghost`; `md` / `sm`. **IconButton** always has an accessible label.
- **Segmented** — single choice as an ARIA radio group with roving tab index and arrow keys. Used for time windows.
- **Metric tiles** — also a radio group: selecting a tile changes the graph *and* its summary together. Each tile shows the latest value, its capture age, and a sparkline drawn from history that is already loaded (no extra requests).
- **Unit card** — whole card is one link; status, primary measurement, up to three secondary values, capture age. A "New reading" badge appears only when a later poll carries a strictly newer capture time.
- **Chart** — Recharts area chart, UTC axis, unit label, dashed per-reading average, tooltip with recorded time + value + unit. Lines break at missing values and gaps > 5 min; stored readings retain visible dots at every sample count so isolated samples remain inspectable. A visually hidden caption and a "View plotted readings" table carry the same data for assistive technology.
- **StateMessage** — one shape for empty, error, unavailable, access-denied and loading, with the bear in a matching mood.

## Bear companion

Moods: `idle`, `greeting` (once per browser session), `loading`, `newData`, `attention`, `empty`, `speaking`. Moods and messages come only from `bear-state.ts`, which reads real UI state (fetch progress, data-status counts, access/fetch failures, new captures). The bear never claims to have analysed data and never comments on health or safety.

**Read summary** requests OpenAI speech only after a click. The server uses Cedar via `gpt-realtime-2.1-mini`, retains the existing authentication and daily voice budgets, and verifies the returned transcript against the displayed summary before returning WAV audio. The project key stays server-side. AI-generated voice is disclosed beside the controls. Preparing, Cancel, Stop, Mute (remembered per browser), Hide and error states are supported; playback is cancelled when the text changes, the page is hidden, or the component unmounts. Unsupported browsers get text. Nothing autoplays. See [voice architecture](bear-voice.md).

## Motion

- 140–450 ms, ease-out; a spring only for the segmented-control thumb.
- Content is visible without animation: entrances start at ≥ 60 % opacity and never gate data.
- Perpetual motion is limited to the bear's slow breathing/orb float and genuine loading indicators.
- `prefers-reduced-motion`: the app is wrapped in `MotionConfig reducedMotion="user"`, the bear holds a static pose, chart animation is off, and CSS transforms/shimmer are removed.

## Data truthfulness rules the UI enforces

Capture time drives freshness (a gateway receipt never makes a reading look recent); zero values are shown as `0.0`; unconfirmed pressure shows "Unit unconfirmed"; partial pages are labelled; averages are per reading; locations are shown only from a stored reading or the registered position (never a default city, never called a live fix); the fleet overview fetches latest values for the visible page only (≤ 24 units, batches of 4).
