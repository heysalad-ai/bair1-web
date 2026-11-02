# Customer isolation implementation and acceptance

Changes are split into reviewable PRs. No hosted deployment, environment change,
IAM change, physical command or customer-record migration is part of a code push.

## PR 1 — server authorization

- Anonymous private AI/voice requests fail before data/provider access.
- Same-default-organisation membership never grants another owner's device access.
- Every command operation checks target ownership; system credentials stay privileged.
- Registration cannot overwrite an existing owner. Admin routes are platform-only.
- Public latest data is limited to deliberately published devices.
- Existing own-device REST reads and ingestion remain compatible.
- Actual route tests reproduce denial with synthetic actors; no live customer probes.
- Unit tests, lint, typecheck and production build pass; existing warnings are recorded.

## PR 2 — sharing, tenancy and data contracts

- Workspace access requires explicit membership; legacy default records stay owner-only.
- Enrollment requires verified one-time proof; transfers cannot inherit private history.
- Shares expire, revoke individually, bind to ownership and return explicit safe fields.
- Public responses omit precise locations and private/raw fields by default.
- Versioned readings expose normalized units, capabilities, capture/receipt provenance.
- Latest/history requests are bounded and avoid scanning all readings.
- Schema/IAM/migration requirements are reviewable and fail closed before provisioning.

## PR 3 — customer UI

- Selected device, workspace and visibility agree across views.
- Empty/loading/denied/error/stale/offline states are distinct; fetch success is not live.
- Device changes clear previous measurements/location immediately.
- Supported environmental/ADC/particulate fields are visible with units and provenance.
- Sharing/enrollment controls match backend rules; public and private AI are separated.
- Desktop/mobile keyboard, layout and synthetic runtime/browser checks pass.

## PR 4 — operational safeguards

- CI exercises tenant/ownership, data contracts, database transaction and UI regressions.
- Reviewed infrastructure enables scoped storage/usage controls, deletion protection,
  monitoring, restore rehearsals and staging region comparisons without applying changes.
- Branch-protection and rollout plans name required checks and compatible rollback.

Full-stack claims require a staged rollout after infrastructure review. Do not report
production isolation, restore readiness or physical calibration from local tests alone.
