# Review candidate: operations and rollout

No resource, IAM grant, environment flag, branch protection, merge, deployment,
backup restore or physical operation is applied by this change.

## Service controls

Requests reserve both a subject and fleet-wide daily counter in one transaction
in the access table. Failed downstream calls consume the reservation. TTL cleans
up counters; the UTC day key is the reset mechanism. Missing configuration or
storage failure returns 503 before paid providers. Subject identity is hashed.
Concurrent-worker coverage proves that excess reservations do not consume global
capacity. These are request ceilings, not measured token/currency billing budgets.

| Flow | Per subject / UTC day | Across all workers / UTC day |
| --- | ---: | ---: |
| Private/public chat | 30 | 300 |
| Voice | 10 | 100 |
| Environmental lookup | 120 | 1,000 |
| Public insight generation | 40 per feed | 100 |
| Workspace writes | 50 | 500 |
| Share creation | 50 | 500 |
| Optional ingestion geolocation | 120 per API key | 1,000 |

Chat is bounded to 64 KiB, 20 messages and 8,000 characters per text part. Incoming
assistant tool metadata is discarded before model conversion. Public chat enables
only the selected published feed tool, with private tools additionally guarded.
Model output is capped, retries disabled and multi-step generation bounded. Google
and voice fetches time out. Public insight uses explicit generation rather than
page-load or periodic model calls; its local cache is only an optimization. A paid
provider's own account budget remains a separate mandatory rollout setting. Chat
can make multiple tool calls within a reservation, and voice may call several
context providers; flow counts must not be represented as exact provider bills.
Optional geolocation skips enrichment if its reservation is denied, preserving
measurement acceptance. Legacy bulk backfill is retired (platform-authenticated
410) because it scanned and rewrote private records without a migration review.

## Storage and access

API-key revocation is re-read consistently from the base table after a GSI match;
stale index results cannot re-enable a revoked key. The existing token lookup
hash remains compatible. CodeQL flags SHA-256 as password hashing on PR #5. Source
mints 192-bit random API secrets, rather than user-chosen passwords, so offline
password guessing is not the same threat model. This is a security-review item,
not a disabled rule or a claim that the check passed. Do not dismiss the alert or
bypass protection automatically. Assess generated-key provenance and legacy
records before approving a disposition. Reference:
https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/

Registry scans are limited to 1,000 examined records, with an explicit error
instead of an incomplete access list. For scale, review and add the two GSIs in
infrastructure/registry-indexes.review.json to the EXISTING managed devices table,
one at a time, wait for ACTIVE, verify representative queries, then enable
BAIR1_REGISTRY_INDEXES_ENABLED=true in staging. The index is a candidate-ID lookup;
current owner/workspace data is re-read from the base table. Never enable the flag
before indexes exist. Use the same staged deployment to enable access/usage storage.

Review deletion protection and PITR on all seven existing tables. Import unmanaged
tables into the owning infrastructure stack before applying declarative changes;
never create a second resource with an existing name. Reading/receipt retention
is 14 days; Notecard event history is 90 days. Latest-state records and workspace
memberships do not silently expire. Existing raw network identifiers are not bulk
rewritten; define an approved purge/retention migration before exposing exports
of legacy raw records (the new exports omit raw JSON entirely).

infrastructure/operations.review.json contains per-operation DynamoDB error and
throttle alarms plus an UNATTACHED runtime IAM policy limited to the selected
namespace. Alarm actions require an existing London-region notification topic
and an approved recipient test. No emails are sent by this work. The runtime
policy cannot provision/delete tables, restore backups, change IAM or alter PITR.
Review separately any current checkout/customer tables outside this IoT scope;
do not replace a broader application policy without inventorying those paths.

## Acceptance and promotion sequence

1. Provision a separate staging namespace for ALL required tables/indexes, matching
   key schemas/TTLs, customer access storage and minimal runtime IAM. Give previews
   that prefix explicitly. The current preview failure deliberately prevents
   production-table fallback. No production binding belongs in preview variables.
2. Build the candidate AND a fallback from this schema-compatible code. Use the
   current authorizer and enrollment partitions in both. The old October fallback
   must not be promoted unchanged.
3. Run the full CI ladder and two independent Auth0 staging identities. Verify
   enrollment replay, same-default-org denial, workspace invite/revocation, wrong
   device API keys, share expiry/revocation, pressure units, 43-field export and
   preservation of a 600-event backlog. Do not operate a physical sensor.
4. Rehearse AWS PITR restore into NEW staging names for registry, readings,
   receipts, commands/state, memberships, API keys and users at a common recovery
   timestamp. Re-enable TTL/PITR/deletion protection and indexes on restored tables
   where necessary. In an isolated app verify ownership, expired/revoked keys and
   shares, history and retry deduplication. Record RPO/RTO and consistency findings.
   The local snapshot-copy regression proves reader/receipt compatibility only;
   it does not prove AWS backups, recovery duration or cross-table consistency.
5. Compare synthetic staging latency/error rates in the existing compute region
   and London, using equal concurrency and the same isolated data. Record p50/p95,
   cold/warm behavior and API failures. Select region after evidence; no region
   change is made here. Add provider spend alerts and notification delivery proof.
6. Run a freshness monitor on deliberately published feeds or authorized private
   device summaries. Emit only aggregate age/status, no identifiers/coordinates.
   Configure a maximum accepted measurement age per hardware cadence and alert
   only on a meaningful state change. Do not label heartbeat freshness as capture
   freshness. Hosted scheduling/alert delivery requires approval and staging proof.
7. Review infrastructure/branch-protection.review.json for main. Required contexts:
   Secret Scan, Build, Database and firmware contracts, CodeQL; one fresh review,
   resolved discussions and no admin bypass. Resolve the CodeQL disposition and
   preview namespace before enabling protection/promoting this stack.
8. Present the exact candidate/fallback SHAs, namespace/IAM diff, configuration,
   migration and rollback evidence for explicit production approval. Then, and
   only then, merge/promote the approved candidate. No device flashing is included.

## Local and CI evidence

The workflow runs on stacked PRs, uses read-only repository permissions, and adds
lint, actual DynamoDB Local transaction suites, a snapshot-copy restore regression
and the native firmware serializer/reply parser. Database download bytes and
ArduinoJson commit are pinned. A changed upstream archive intentionally fails until
reviewed. The test runner reserves loopback port 18743 and owns/cleans its temporary
process. All device IDs and owners in fixtures are generated. Cloud acceptance,
provider calls and Auth0 staging acceptance remain unexecuted gates.
