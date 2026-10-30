> Update: isolated hosted staging validation and a compatible ingestion-pause fallback are now complete. See [staging results](staging-validation.md) and [rollback procedure](compatible-rollback.md). Production deployment and device uploads remain on hold. Earlier local-only status below is historical.

# Two-second ingestion — review only

No device uploads, live telemetry writes, deployment, table creation in AWS or hosted environment changes are authorized for this work. Synthetic fixtures and a local DynamoDB instance only.

Acceptance criteria registered before implementation:
- Reproduce the production throttle: post 30 distinct samples two seconds apart and observe fewer than 30 retained on baseline.
- Retain all distinct samples, including a 600-sample backlog at two-second capture intervals, out-of-order delivery, same-time distinct events, and multiple devices. Check raw ADC/BME values and exact capture times in local DynamoDB and read API responses.
- Retries (including concurrent delivery and a lost HTTP response) must create one reading; changed measurement content using an existing event ID must be an explicit conflict, not overwrite or acknowledge success.
- Missing/unusable device time remains labelled unknown. Validate JSON, identifiers, measurement numbers and payload size. Missing/wrong keys and wrong-owner devices cannot write.
- Preserve existing reads, range boundaries, legacy rows, null AQI and Notehub response compatibility.
- Real local database transactions, failure paths and HTTP handler tests; no network storage mocks for integration results. Document schema, IAM, retention, capacity and rollout/rollback implications.
- Run existing tests, new regression/integration tests, TypeScript, lint and production build.
- Compile the actual XIAO sketch with the network path linked; feed its native-generated payload into the local endpoint and feed real backend replies through its acknowledgement parser. Explicitly distinguish native protocol testing from unperformed hardware verification.


## Results — 30 October 2026

- Baseline: expected regression reproduced, **5/30** distinct two-second samples retained.
- Fixed backend: **600/600**, including reverse-order 48-hour backlog, exact acquisition times, BME/ADC values and raw payload. Added 1,800-byte padding per event so history exceeds DynamoDB's single-query page and exercises pagination.
- **10/10 integration tests passed** using actual handlers over loopback HTTP and DynamoDB Local 3.3.2 (Java 17), including concurrent retries, lost replies, conflicts, clock handling, ownership races, invalid/auth failures, missing receipt-table rollback and Notehub compatibility.
- Existing tests: **4/4 passed**. TypeScript passed. ESLint: zero errors, 25 existing warnings in unrelated files. Production build passed; Next emits an existing multiple-lockfile workspace-root warning.
- Actual sketch serializer compiled natively. Its output survived a backend round-trip unchanged; actual stored/duplicate/conflict replies were fed into the sketch's acknowledgement parser and accepted/accepted/rejected respectively.
- XIAO ESP32-S3 firmware compiled with ESP32 3.3.11 and ArduinoJson 7.4.3, using a temporary copy with nonempty synthetic SSID/API key so networking was linked. **1,041,188 bytes flash (31%), 48,120 bytes static RAM (14%)**. Real credentials remain blank. Local ARM-compatible Arduino ctags was selected with `runtime.tools.ctags.path=/tmp/bair1-arduino-ctags` because the packaged ctags binary was incompatible with this host.
- Infrastructure JSON parsed locally. AWS schema validation, IAM, hosted capacity, TTL execution, physical readings, Wi-Fi/TLS/NTP on hardware and power-loss behavior remain untested. No claim of hardware or production acceptance.

Raw verification output is in `docs/evidence/two-second-ingestion/`. The regression script intentionally exits nonzero against the original source. See `two-second-ingestion-runbook.md` for reproduction, review requirements, retention/capacity, rollback and firmware limitations. All changes are local and uncommitted on `codex/bair1-two-second-ingestion`; no cloud resource, telemetry upload, deployment or device flash was performed.
