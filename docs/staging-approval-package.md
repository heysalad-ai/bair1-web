# Staging approval package

The changes are committed as a draft stack, beginning at PR #5. Production,
customer records and physical hardware are unchanged. Approval of this package
would authorize staging provisioning/configuration and staging-only acceptance;
it does not authorize a main merge, production promotion, customer migration,
provider spending, notification messages or physical device commands.

## Concrete resource proposal

Use infrastructure/staging-tables.review.json in eu-west-2 with prefix
bair1-staging-customer-isolation-. It contains seven NEW on-demand, encrypted,
PITR-enabled and deletion-protected tables: readings, reading-events, devices,
commands, access, api-keys and users. It includes the registry, API-key and membership
indexes used by the candidate. Tables are retained on stack deletion/replacement.
Readings/receipt rows expire after 14 days, Notecard history after 90 days; commands,
shares, invitations and usage records use their own expiry semantics. PITR/storage
and optional request traffic can incur AWS charges; no capacity or cost benchmark
has been established for this unused staging namespace.

The template's parameter pattern rejects production table names. AWS
ValidateTemplate accepted its syntax. Local integration tests construct the key
and GSI schemas directly from this template and use only a fixed loopback database.
The indexed-schema tests caught empty owner/workspace attributes on unclaimed enrollment records; new sparse records now omit those attributes and claims remain conditional. Before adding indexes to existing production tables, review and remove only invalid empty index attributes on unclaimed records through an approved migration. Do not alter real owner identities. This is not proof of cloud provisioning, IAM or PITR restore.

Review the runtime policy in operations.review.json with the SAME staging prefix.
Attach it only to a dedicated preview runtime identity after verifying the identity
and current deployment mechanism. Do not attach a production wildcard policy or
copy a production sensor key into staging. The 70 alarm resources in the operations
template are a separate monitoring proposal, not part of this staging request;
recipient notification testing and alarm cost review need separate approval.

## Preview configuration proposed for approval

| Setting | Staging value |
| --- | --- |
| AWS_REGION | eu-west-2 |
| BAIR1_TABLE_PREFIX | bair1-staging-customer-isolation- |
| BAIR1_ACCESS_ENABLED | true, after table/index readiness |
| BAIR1_REGISTRY_INDEXES_ENABLED | true, after both GSIs are ACTIVE |
| BAIR1_PAID_FEATURES_ENABLED | false |
| BAIR1_INGESTION_MODE | active for synthetic staging events only |
| Auth0 | Isolated staging client/redirects and two independently controlled identities |
| SENSOR_API_KEY / Notehub route secret / device salt | New staging-only secrets entered through the hosting provider's secret controls |
| ADMIN_BOOTSTRAP_SECRET / ADMIN_BOOTSTRAP_SUB | Staging-only approval secret and the exact approved staging admin subject |
| OPENAI / GOOGLE / ELEVENLABS provider keys | Omit from staging acceptance |
| Stripe / checkout credentials | Omit; payment testing is outside this request |

No real secret or subject belongs in this document, command history, PR body or
chat. The paid-feature flag is independent from access storage and defaults off;
workspace/enrollment tests do not enable model, voice or Google provider requests.
Optional geolocation skips enrichment while disabled, preserving measurements.

## Staging acceptance and remaining gates

Run two-account own-device success and other-owner denial across REST, GraphQL,
CSV, shares and commands. Use synthetic registration, clock, sparse-event and
600-event backlog fixtures. Create/revoke explicit membership, test one-time
invitations/enrollment, expiry, key binding, stale key-index revocation and ownership
races. Acknowledge commands only in the synthetic test harness; do not connect a
physical sensor. Paid AI/voice/environment paths must fail before providers, while
local fake-provider tests exercise allowed data selection. Verify desktop/mobile
states through real Auth0 sessions. First assignment to a workspace explicitly shares retained owner history when workspace visibility is selected. Later moves between workspaces are blocked pending a reviewed migration; old customer history must not follow a reassignment silently. Staging secrets and disposable records stay
within the isolated namespace.

Before production, resolve the CodeQL API-token hash classification without rule
suppression or administrative bypass, review the 16 moderate development-tool
advisories, rehearse cloud PITR and compatible rollback, confirm notification and
provider budget controls, and approve an explicit legacy subject/history mapping.
The old production fallback is not schema-compatible without rebuilding it.
A separate approval must name the exact candidate/fallback and production settings.

Final customer-view refinements show actual workspace names, lead with reported
measurements (including genuine zero), distinguish permission loss from service
failure, and plot missing values/gaps without joining them. Recorded time is
labelled as such when capture provenance is unknown. Table data remains accessible
alongside the chart; changing a time range is disabled while a page is in flight.
