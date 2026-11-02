# Implementation verification and handoff — 2 November 2026

The review candidate is a stack of draft PRs, not a production release:
#5 server authorization; #6 workspaces, enrollment and shares; #7 measurement
contract/customer views; #8 usage/operational controls; #9 ownership/identity/
provenance races; #10 dependency remediation; final customer/staging readiness.
Review in that order. Do not merge the final branch alone without its dependencies.

| Acceptance item | Evidence / status |
| --- | --- |
| Owner and explicit workspace boundaries | Offline actual-handler tests plus local database membership/revocation/race tests pass |
| Enrollment, key binding and revocable shares | One-time proof, owner/generation, expiry/replay and stale-index revocation tests pass |
| Data flow and field contract | 43-field projection/export, cursor/range, sparse timestamps, unit/provenance and missing-data checks pass |
| Real persistence/firmware protocol | 600-event HTTP backlog, duplicate/conflict/retry, native serializer and acknowledgement parser pass |
| Restore compatibility | Isolated local snapshot-copy restores ownership, history and receipts; cloud PITR not rehearsed |
| Customer UI | Synthetic 1280 px desktop and 390 px mobile review: workspace name, field order, zeros, unknown/stale/empty/denied states, selection clearing, history/chart/export controls; no horizontal overflow in reviewed mobile views |
| Production-build route guards | 13 real Next server HTTP status/header checks pass using isolated table names, dummy credentials and no identities/providers/devices |
| Runtime dependencies | npm audit --omit=dev reports zero findings for the candidate; full audit retains 16 moderate development-tool findings |
| Static/build gates | TypeScript and production build pass; lint has zero errors and 24 existing warnings |
| Secrets | Staged gitleaks scans pass; fixtures generate IDs and secrets; no real device/location/credential is added |
| Staging resource proposal | AWS ValidateTemplate accepts the seven-table template and separate operations template; local schema tests use the reviewed table/GSI definition |
| Hosted acceptance | Not run. Requires approved isolated resources/configuration and two independent identities |
| Production / hardware | Unchanged; current main and production deployment independently checked |

Final local suite: 34 offline tests, 12 database access/budget/index/race tests,
12 HTTP/database ingestion tests, one restore regression and 13 production-build
HTTP checks (72), plus the actual native firmware assertions. GitHub CI checks
build/lint/types/runtime audit, offline tests, production HTTP guards, database,
firmware and secrets. Preview hosting intentionally fails until an isolated
BAIR1_TABLE_PREFIX is configured. Do not remove the guard to make preview green.

Voice also requires an explicit location for external environmental context; absent location does not silently use a default coordinate. Device values are described as last recorded, with capture/calibration uncertainty.

Chat escapes untrusted model HTML before limited formatting, and private/public clients show service errors instead of silently dropping the response.

The CodeQL password-hash classification on the existing random API-token lookup
still requires security-review disposition; no rule is suppressed or alert
dismissed. Development minimatch advisories remain documented rather than forcing
incompatible tooling. No local result establishes cloud restore readiness,
physical calibration, firmware installation or production customer isolation.

For the next authorization, review staging-approval-package.md. It proposes
staging only, with paid features disabled, new secrets and no real customer data.
Production merge/promotion, legacy identity/history changes, notifications,
provider spending and hardware operations remain separate approval gates.
