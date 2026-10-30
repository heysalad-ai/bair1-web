# Production deployment — 30 October 2026

Authorized by Peter: deploy the reviewed Bair1 backend to production and update the public manufacturer instructions. Device flashing remains on hold. Use synthetic HTTP telemetry only; do not operate hardware or contact the manufacturer.

Acceptance criteria recorded before production changes:
- Confirm production and origin/main still match the reviewed base; preserve existing production settings and data.
- Provision/verify the production receipt table, TTL and recovery settings; verify runtime permissions for the atomic reading/receipt transaction.
- Build production-configured candidate and ingestion-paused fallback on Node 24 without switching live domains first.
- Test synthetic two-second readings, duplicates/conflicts, auth, raw/typed fields and mixed-format reads against the candidate; verify fallback rejects writes and reads existing history. Keep test identifiers/credentials out of committed evidence and remove only task-created fixtures afterward.
- Promote the tested production candidate; confirm Bair1 live aliases point to it and verify the same contract through https://app.bair1.live/api/readings. Leave the compatible fallback ready, not active.
- Publish updated manufacturer instructions and a new public review ZIP. Clearly distinguish backend availability from the continuing hardware-flashing hold; keep secrets/configuration blank and verify anonymous downloads/checksums.
- Preserve deployable source provenance and evidence. Revoke temporary test keys/bypass and remove temporary local secrets. Do not revoke the runtime identity needed by production.


## Deployment and verification

The reviewed backend is live at **https://app.bair1.live/api/readings**. Device flashing remains on hold.

- Application source: reviewed revision `b27d290`; production work adds provisioning/verification scripts, instructions and evidence, with no application-code changes. CI runtime is aligned to verified Node 24.
- Initial promoted production candidate: `dpl_Ee4Sy5MxRRk13ob9cqsSR1reKn8T` — https://bair1-live-48y2yj6pk-hey-salad-inc.vercel.app . Built with production configuration on Node 24, tested before promotion.
- Compatible production-configured fallback: `dpl_2xXhGi3vkLT4VhChxbH31x5rSZFo` — https://bair1-live-heh0t8g17-hey-salad-inc.vercel.app . It has `BAIR1_INGESTION_MODE=paused`, reads production history and returns HTTP 503 for both ingestion routes. It is **ready but not active on the live custom domains**.
- `app.bair1.live`, `bair1.live` and `www.bair1.live` were verified pointing to the tested candidate after promotion. Any later Git-triggered deployment of the same release source is recorded in the final handoff evidence.
- Production receipt table `bair1-reading-events` is ACTIVE with on-demand billing and `expiresAt` TTL enabled. Both readings and receipts have point-in-time recovery enabled. Existing reading TTL remains enabled; expiry values remain 14 days after first receipt.
- A new production runtime IAM identity is restricted to the six Bair1 production tables and their indexes. Actual transactions succeeded; policy simulation denies staging-table access. Existing AWS identities were not revoked or modified. Other production environment settings were retained.
- Before switching traffic: **12/12** distinct readings stored; mixed legacy/new history, duplicate retries, conflicts, authentication, ownership and BME/ADC raw/typed fields passed. The fallback read the same data and rejected uploads.
- After promotion, the unauthenticated public domain (without a Vercel bypass) accepted authenticated developer-key requests: **30/30** paced readings stored. Observed send intervals: 2000–2002 ms. Eight concurrent retries returned duplicate; conflicts returned 409; missing auth 401; wrong owner 404; invalid fields 400. Direct database inspection verified **43 synthetic rows and 42 receipts**, including one legacy-format row.
- The actual firmware acknowledgement parser accepted production stored/duplicate replies and rejected conflicts. The live TLS chain verified using only the firmware's bundled public root CA.
- Builds passed on hosted Node 24. Local unit/configuration checks, lint and TypeScript passed; lint retains 25 pre-existing warnings. Existing staging evidence covers 600-sample backlog, database pagination, lost replies and ownership races.

## Operational rollback

If ingestion needs to be paused, promote the production fallback above in Vercel project `bair1-live`, scope `hey-salad-inc`. This preserves compatible reads and rejects new measurements with a retry response. Do not restore the old unmodified twelve-second backend or delete receipts. Do not promote a staging deployment; those use separate storage/credentials.

A pause can fill the firmware's four-minute RAM queue and cause new readings to be dropped. This fallback protects already stored history; it does not provide lossless device buffering. After repair, deploy/verify the active candidate and resume through the usual controlled promotion.

## Manufacturer handoff

Public repository: https://github.com/heysalad-ai/bair1-xiao-bme280-firmware . The updated `v1.0.1-review` package states that the production server is live while device flashing remains on hold. It includes English and Chinese instructions, the production endpoint, build steps, network checks, error handling and known buffering/retention limits.

The two source files remain byte-identical to the compiled review package. Wi-Fi credentials, API key and endpoint remain blank in the public header. The manufacturer can review/configure/compile; Peter must privately provide a dedicated developer key and explicitly approve a particular board before flashing. No manufacturer message or hardware operation was performed.

## Scope of verification

This verifies production ingestion/read compatibility and the software/firmware protocol. It does not establish physical sensor accuracy, voltage-divider correctness, factory-network access in China, ESP32 Wi-Fi/NTP/TLS execution, power-loss recovery, a long-duration soak, fleet-scale capacity, actual 14-day TTL deletion or backup restoration. Full Auth0, payments and live Notehub-provider flows were not acceptance-tested; their production settings were preserved.
