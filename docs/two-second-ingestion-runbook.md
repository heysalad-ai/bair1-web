> Update: isolated hosted staging validation and a compatible ingestion-pause fallback are now complete. See [staging results](staging-validation.md) and [rollback procedure](compatible-rollback.md). Production deployment and device uploads remain on hold. Earlier local-only status below is historical.

# Review candidate — no deployment or uploads

This branch starts from production commit `dff6951ec7eff3eb86ec96f02a3c369a57fe29da`. The separate M5 checkout and production are unchanged. The original twelve-second filter retained only 5 of 30 distinct samples in the local baseline reproduction.

## Storage and API contract

Every accepted distinct event is written, without a time throttle. A transaction writes the reading and a durable deduplication receipt together. Capture time and server receipt time remain separate. The reading sort key is `ISO-time#SHA256-event-identity`; the API exposes a plain ISO timestamp through `readingAt`. Existing unsuffixed rows remain readable, including inclusive range queries and pagination.

Use an explicit `eventId`, or `bootSession` plus `sequence`, for each measurement and reuse it on retries. Fallback clients with capture time use content identity; clients with neither time nor identity cannot be safely deduplicated. Duplicate requests return HTTP 200, `ok:true`, `stored:false`, `outcome:"duplicate"`. New events return `stored:true`, `outcome:"stored"`. Reusing identity with changed measurements returns 409; storage failure returns 503 without acknowledging the reading. First accepted signal-strength/drop-counter values win. The XIAO firmware accepts stored/duplicate, retains other responses for retry, and never treats a conflict as delivered.

All raw fields are preserved. BME280 temperature, humidity, pressure, altitude and both ADC channels are available as typed read fields; AQI stays null. Invalid JSON shape, identifiers, non-finite measurement fields and payloads over 16 KiB are rejected. Developer writes require ownership, including a transaction condition against concurrent ownership change.

Retention remains **14 days after first receipt**, including backlog; this is not indefinite archival. Deduplication is bounded by receipt retention. DynamoDB TTL deletion is asynchronous. Replaying an expired event can store it again after cleanup, or temporarily return 503 if only its receipt has been removed. Do not treat this as an unlimited event archive.

## Infrastructure review required

`infrastructure/reading-events.review.json` is a draft CloudFormation table definition, parsed locally only. Nothing was created in AWS. It adds `bair1-reading-events` with string partition key `deviceId`, string sort key `eventId`, on-demand billing, `expiresAt` TTL, encryption and point-in-time recovery. Confirm the AWS account, region, resource ownership and existing table configuration before approving any rollout.

The runtime role needs existing read/query permissions plus `dynamodb:PutItem` on both reading and receipt tables, `dynamodb:GetItem` on the receipt table, and `dynamodb:ConditionCheckItem` on `bair1-devices`. Preserve existing device registration/update and API-key permissions. Scope resource ARNs to the approved account/region/table; do not add wildcard table access. Transaction IAM uses the underlying operations, not a separate `TransactWriteItems` policy action. See [AWS transaction IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

At two-second intervals, each device produces 43,200 readings and receipts per day, approximately 604,800 of each over 14 days. Transactions increase write cost; ownership and receipt checks also consume reads. Review AWS/Vercel budget, quotas, expected fleet size and read endpoints before rollout. Existing broad history scans are not a fleet-scale analytics design. This local test is a correctness test, not a hosted throughput or billing benchmark.

## Proposed rollout, only after review

1. Review changes, retention, infrastructure/IAM and firmware limits. Keep blank firmware credentials in shared copies.
2. In an approved staging environment, provision the receipt table and scoped permissions; deploy the candidate. Check real IAM, TTL settings, authentication and HTTP behavior with synthetic staging events.
3. Verify monitoring and read compatibility. Before production writes, retain a rollback build that understands `readingAt` and suffixed keys. The old production reader treats storage keys as timestamps and is **not** a safe rollback after new rows exist. Roll back to a compatible reader/writer or stop new writes and repair forward. Do not delete readings/receipts to roll back.
4. After separate approval, deploy production, verify synthetic events and then flash one device. Check two-second capture, Wi-Fi loss/recovery, TLS, NTP, ADC wiring/calibration and queue behavior on hardware before expanding.

## Firmware review

`firmware/Bair1_Xiao/Bair1_Xiao.ino` and `bair1_config.h` are the two Arduino files. Keep them together in the `Bair1_Xiao` folder. Credentials remain empty. Sampling and HTTPS uploads use separate tasks; each boot gets a new random session identity and retries retain sequence/capture time. D4/D5 serve BME280, D3/D2 are ADC inputs, and D6 stays high impedance because it is tied to D2. The two divider gains remain inherited assumptions requiring physical verification.

The 120-reading queue is RAM only (about four minutes). It drops newest readings when full, loses queued data on reboot and drops pre-NTP readings from upload while printing them to serial. A permanent 400/404/409 at the queue head requires intervention; the firmware retains it rather than silently discarding it. Thus the backend retains every submitted distinct reading in its retention window, but this firmware does **not** guarantee lossless acquisition across startup, long outages or resets. Persistent buffering and a defined recovery policy would be separate work before promising that guarantee.

## Reproduce locally

Use Node 22, Java 17+, Python 3, clang++, ArduinoJson headers and the Arduino ESP32 toolchain. Install npm dependencies with `npm ci --ignore-scripts`. Download DynamoDB Local using [AWS instructions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html), verify its published checksum, and run it on port 18743 in a disposable environment:

```sh
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -inMemory -sharedDb -port 18743 -disableTelemetry
npm test
npm run test:ingestion
npm run lint
npx tsc --noEmit
npm run build
```

The integration suite hardcodes loopback and dummy credentials and creates/deletes five named local tables. Use a dedicated empty local instance; it intentionally fails if these already exist. It invokes the actual Next request handlers over a local HTTP harness with the real DynamoDB SDK, not an in-memory storage mock. It is not a deployed Next/Vercel environment test. Native firmware serialization and acknowledgement functions are extracted from the actual sketch and compiled against ArduinoJson. `ARDUINOJSON_INCLUDE` can override the default local Arduino library path.

Baseline reproduction: export the base revision's `src/lib/dynamo.ts` to a temporary file and run `BAIR1_BASELINE_FILE=/absolute/path/to/baseline.ts node tests/ingestion-baseline.mjs` against the same empty disposable instance; the expected regression is a failed 30-reading assertion (only five retained).
