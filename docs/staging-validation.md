# Staging validation and compatible rollback — 30 October 2026

Authorized: isolated staging resources/deployments, synthetic telemetry, a compatible rollback, and public firmware sharing. Production deployment, production telemetry writes and device flashing remain on hold.

Acceptance criteria recorded before changes:
- Staging uses an isolated Vercel project and separate DynamoDB tables; verify resource names and runtime permissions. No production table writes or alias changes.
- Deploy actual Next.js staging build and verify HTTPS ingestion, capture-time preservation, retry deduplication, conflict and auth failures using synthetic readings. Inspect persisted rows directly.
- Verify legacy and new-format history via staging HTTP reads.
- Prepare an immutable ingestion-paused rollback deployment that reads both formats, rejects new readings without acknowledgment, leaves rows/receipts intact, and allows a resumed candidate to deduplicate retries.
- Re-run tests, lint, type checking and build for relevant changes. Report hosting/IAM/TTL limits explicitly.
- Publish only credential-free firmware and manufacturer instructions in a public HeySalad repository or gist; verify public download contents and compile the exact published files.
- Record unchanged production deployment identity after validation. Do not flash hardware or send communications to the manufacturer.


## Final results

**PASS for the bounded staging ingestion and rollback checks. Production deployment and device flashing remain on hold.**

- Separate Vercel project: `bair1-ingestion-staging`. Final candidate and fallback are READY preview deployments on **Node 24**, matching the production project's configured runtime.
- Candidate: https://bair1-ingestion-staging-m2u57i3m7-hey-salad-inc.vercel.app
- Ingestion-paused fallback: https://bair1-ingestion-staging-f53ihwnip-hey-salad-inc.vercel.app
- Separate AWS tables: `bair1-staging-20261030-*` in `eu-west-2` (six tables). The dedicated runtime IAM user's policy simulation allows staging reads/writes and denies production readings-table reads/writes. Hosted transactions succeeded with that runtime identity.
- Readings and receipt tables are ACTIVE, on-demand, with `expiresAt` TTL ENABLED and point-in-time recovery ENABLED. Actual expiry/deletion after 14 days and backup restoration were not exercised.
- Hosted candidate retained **600/600** out-of-order backlog samples and **30/30** readings sent at approximately two-second intervals. Exact capture times, raw payload, BME280 and both ADC channels survived read-back. Mixed legacy/new history crossed a database page boundary and returned all rows.
- Twelve concurrent retries returned duplicate; changed content returned 409; missing authentication returned 401; another owner's key returned 404; invalid numeric data returned 400.
- Hosted fallback read **631** existing rows, refused both ingestion routes with 503, preserved receipts, and allowed the active candidate to deduplicate an old event after the pause. A new event plus retry created exactly one additional row: **632 total**, also readable through the fallback.
- Actual hosted stored/duplicate/conflict replies passed the firmware acknowledgement parser. Firmware compiled with networking enabled: 1,041,172 flash bytes (31%) and 48,120 static RAM bytes (14%). Published configuration is blank and additionally requires an explicit approved endpoint before upload can start.
- Local checks: **5/5 unit/configuration tests, 11/11 integration tests**, TypeScript and production build passed. Lint: zero errors, 25 pre-existing warnings. Local Node was 22.23.2; hosted build/runtime validation additionally passed Node 24.
- Production deployment identity was compared before/after and remained unchanged. No production table writes, production configuration changes, real device uploads, board flashing or manufacturer messages were performed.

Vercel created an initial bootstrap deployment labelled “Production” inside the new, isolated staging project. It had no production credentials or production domains and was not used as validation evidence. The final validated deployments above are explicitly previews. Earlier successful Node 22 staging tests were repeated on Node 24; the final evidence JSON points to Node 24.

## Public manufacturer handoff

- Repository: https://github.com/heysalad-ai/bair1-xiao-bme280-firmware
- Prerelease: https://github.com/heysalad-ai/bair1-xiao-bme280-firmware/releases/tag/v1.0.0-review
- ZIP: https://github.com/heysalad-ai/bair1-xiao-bme280-firmware/releases/download/v1.0.0-review/Bair1_Xiao-review-2026-10-30.zip

Anonymous downloads of both source files and the release ZIP were byte-checked against the compiled source. The package includes the two Arduino files, build/wiring instructions, explicit hold notice, software verification, licence and checksums. Wi-Fi credentials, API key and upload endpoint remain empty. A public certificate is included; no private keys or server credentials are present.

## Remaining review before production or flashing

1. Approve the 14-day retention policy and realistic fleet capacity/cost. This was a bounded correctness and small-load test, not a fleet benchmark or long-term soak.
2. Review the production receipt-table/IAM changes and prepare a production-configured ingestion-pause fallback from the reviewed source. Never promote the staging deployments: they use staging data/credentials. See `compatible-rollback.md`.
3. Review the RAM-only firmware queue, pre-NTP drops, reboot loss and blocked-head behavior. Persistent buffering is still required if all readings must survive long outages/resets.
4. Confirm the exact board, wiring, voltage dividers and physical meanings of the ADC inputs; privately provision a dedicated developer credential for this test after approval.
5. Approve production rollout and then a separate one-board bench test. Physical sensor accuracy, real ESP32 Wi-Fi/TLS/NTP, outage recovery and power behavior remain unverified.

This staging project validates the ingestion/read APIs. Full Auth0/dashboard, live Notehub-provider configuration and payment services were not configured or exercised. Notehub compatibility is covered locally, and its pause response was checked on the hosted fallback.

Staging resources are retained for review and incur normal AWS/Vercel usage charges. Synthetic readings/receipts have 14-day TTL; tables, IAM identity and deployments do not automatically disappear. Review cleanup after approval; do not delete storage needed for rollback evidence prematurely.

Temporary staging developer keys and the automated test bypass were revoked after validation. Local copies of AWS credentials and test secrets were removed. The staging service identity remains configured only in the isolated Vercel project for review.
