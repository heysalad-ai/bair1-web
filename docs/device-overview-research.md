# Device overview and individual units

Researched 15 November 2026. The user prioritised live readings and device health, with every unit visible and individual-unit detail without a dropdown.

## Pattern choice

[Carbon's resource-table guidance](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) supports search, aligned comparison and progressive detail; it recommends a dedicated page or side panel when expanded information becomes crowded. [ThingsBoard's entities overview](https://thingsboard.io/docs/reference/widgets/tables/entities-table/) combines device identities with their latest telemetry, search and pagination. Its [entity-alias guidance](https://thingsboard.io/docs/pe/user-guide/aliases/) separates multi-entity overviews from single-entity detail states.

For Bear One's existing consumer-facing design, the chosen adaptation is a roomy list rather than a dense administrative table. Compared with a selector, units remain visible and comparable. Compared with a large metric-card wall, aligned rows keep names, values and reading ages easy to scan without decorative chrome. A map remains a per-unit context view rather than the primary way to identify hardware.

## Implemented behavior

- All accessible device metadata is searchable by name, ID or workspace; 24 units appear per page.
- Visible units progressively load measurements in sequential four-unit GraphQL batches and refresh each minute. Changing search/page aborts the old work. Per-unit failures clear that unit's values without hiding other devices.
- The overview uses the latest available reported measurement, with particulate data preferred. A missing value is a dash; zero remains zero. Stale, unknown-clock, waiting and unavailable states are distinct.
- Freshness comes from that measurement's capture time, never a new gateway receipt. Labels describe data recency, not electrical health, cellular registration or a manufacturing pass.
- Each unit has an authenticated, bookmarkable URL, measurements and history/export links. Browser Back retains the previous search. Sign-in return paths and canonical app redirects preserve device/view context, with external return URLs rejected. Account identity changes remount the dashboard state.
- Individual units prioritise reported measurements. Other measurement names remain available in a disclosure instead of filling the page with empty values.

## Boundaries

Authorization continues through the existing GraphQL registry and per-device read checks. The UI cannot grant device access. It does not average unrelated units, infer factory acceptance, expose raw private telemetry, alter ownership or replace authentication. The surface extends the existing green palette, typography, branding and navigation.

Local visual review uses the actual dashboard components with isolated synthetic auth/data adapters, explicitly labelled. Those screenshots verify layout and interaction, not production sign-in or real telemetry. Test adapters live outside the repository and are not included in the shipped app. Production-build authorization smoke tests remain separate from the browser review.
