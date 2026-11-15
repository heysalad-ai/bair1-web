# Dashboard device overview

Mode: Operate. Local extension of the existing Bear One dashboard; preserve its dark green palette, bear identity, Figtree/Bricolage typography and existing measurement/access behavior. The user wants all units and individual units visible without a device dropdown. The user confirmed live readings and device health as the priority.

## Direction contract

THESIS: Make the units themselves the navigation: scan a visible list, then open one unit. Replace the hidden selector without replacing the dashboard's identity.

OWN-WORLD: Existing dark green ground, quiet hairline row separators, readable green-tinted secondary text, accent reserved for focus and recent-data state. No decorative cards, dashboard-stat tiles or invented health scores.

STORY: See every accessible unit's name, workspace, latest available measurement and its capture age. Search by name/ID/workspace. Open a unit for measurements/history and return to the same search.

FIRST VIEWPORT: Existing sidebar and account header, an All devices heading with modest count, one search/refresh toolbar, and an airy list whose aligned readings support comparison. Rows stack into two data columns on mobile. A visible View device link carries the action.

SIGNATURE: Overview-to-detail navigation with ordinary links and browser history; each unit has a shareable URL within the existing authenticated dashboard.

BOUNDARIES: Preserve authorization and measurement-versus-receipt semantics. Missing data is explicit; freshness never asserts hardware connectivity. Read at most 24 visible units in small GraphQL batches per refresh, with cancellation and per-unit failures. Preserve zero values, unknown clocks and partial-loading states. No new auth, simulated production data or inferred factory pass/fail.

Acceptance: no device dropdown; all accessible metadata searchable; 24-unit pagination; real capture-age labels; individual measurements/history links and browser back; refresh/error/empty/long-name states; keyboard and 390/1440px layouts; current unit access remains enforced by existing GraphQL resolvers.

Research: Carbon resource tables support search and progressive detail; ThingsBoard entities overview combines latest telemetry with per-device drill-down. Adapt to PRODUCT.md's consumer audience with a roomy list, rather than making a dense administrative table the default.
