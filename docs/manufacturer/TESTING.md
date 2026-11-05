# Bair1 factory server test

This guide covers a board running the XIAO BME280 + dual ADC firmware. The factory operator performs the physical test. Bair1 provisions enrollment and checks the uploaded evidence. A working Wi-Fi connection alone does not complete this test: real measurements must reach the server and be read back correctly.

## Before the factory begins

The Bair1 operator provisions the exact device ID using the protected enrollment administration route. This creates an unowned, private pending device and returns a one-time code that expires after 24 hours. The factory receives this code separately from its login password and upload key. If the code expires, contact Bair1; do not guess another device ID or use the server's system credential.

Bair1 supplies two dedicated test sign-ins in a private credentials handoff. The aliases identify test accounts; they are not confirmed email inboxes. No platform admin role is required. Password recovery requires an operator-controlled mailbox. Passwords, enrollment codes and API keys must never be included in firmware repositories, screenshots, serial captures or this guide. Each account starts with private access and no customer devices. The second account is for the isolation check, not a second owner of the same board.

## 1. Sign in

1. Open https://app.bair1.live and select **Sign in**.
2. Choose email/password login and use test account A from the private handoff. Google login with a similar email is a different identity; do not substitute it.
3. Open **Devices & access**. The setup has three steps: **Enroll your board**, **Create an upload key**, **Verify an upload**.

If the updated setup is not deployed yet, the current screen has **Enroll a device** near the top and **Create API key** farther down. The same account and permissions requirements apply.

## 2. Enroll the board

1. Read the device ID printed by the board. Preserve the exact spelling and case.
2. Enter the ID, a descriptive test-board name and the one-time enrollment code from Bair1.
3. Select **Enroll device privately**. Confirm the board appears in the device selector.
4. Enrollment is performed once. Do not repeat it for each upload or reboot. A used, expired or incorrect code is rejected. If a device is already owned, Bair1 must review any transfer; another account cannot claim it by copying its ID.

A firmware configuration file does not enroll a board. Neither its Wi-Fi credentials nor its API key is a one-time enrollment code.

## 3. Create the firmware key

1. Stay signed in as account A. Select **Create an upload key**.
2. Keep the **Firmware upload** preset. Choose the enrolled board and name the key for this test run.
3. Select **Create upload key**. This preset grants only `write:readings`, restricted to the chosen device.
4. Copy the full value once and save it locally. It cannot be recovered from the dashboard afterward. If lost, revoke it and create a replacement.
5. In the local `bair1_config.h`, set `BAIR1_URL` to `https://app.bair1.live/api/readings` and `BAIR1_API_KEY` to that upload key. Set Wi-Fi credentials locally. Keep TLS certificate verification enabled and leave the board's generated device identity unchanged.

On the older screen, choose the board in **Limit key to device**, select **Write readings**, and deselect unrelated permissions. A default read/export key will not upload. Do not use `https://bair1.com`, a Vercel preview URL, an Auth0 login token, a Notehub secret or a platform/system key as the device destination or credential.

## 4. Upload actual measurements

Run the agreed bench firmware on the actual board. This guide does not authorize unattended flashing, restarting equipment or operating actuators. The default sample interval is two seconds.

The board must POST its actual BME280 and dual ADC payload as JSON, with `Content-Type: application/json` and `Authorization: Bearer <UPLOAD_KEY>`. Keep the key out of logs. The payload must preserve the event identity and measured timestamp across retries; a new measurement must get a new event identity.

Successful first acceptance is HTTP 200 with `ok: true`, `outcome: "stored"` and `stored: true`. An unchanged retry is HTTP 200 with `ok: true`, `outcome: "duplicate"` and `stored: false`. A duplicate is acknowledged: it must not create a second reading. The firmware removes a queued sample only after a valid acknowledgment, not after any arbitrary HTTP 200.

For this firmware, a BME280-only board reports temperature, humidity and pressure. Dual ADC channels report raw counts and configured pin/input voltage values. Particulate fields and calculated AQI may be absent: do not fabricate them or treat a PM concentration as AQI. Divider gains come from the supplied hardware configuration; upload success does not validate those gains or sensor calibration.

## 5. Verify readback

1. Select the test board in the top device selector.
2. Open **Devices & access → Verify an upload → Check latest upload**.
3. Confirm a new server receipt and compare the displayed temperature, humidity and pressure against the serial payload. A missing or old reading is not proof that the current upload worked.
4. Open **History** and compare representative records: captured timestamp/clock status, event identity, temperature, humidity, pressure in hPa, both raw ADC counts and all reported voltage fields. Export history where needed. Null or unsupported fields must remain missing, rather than turn into zero or fabricated values.
5. A firmware upload key has no read privilege. For independent API readback, create a separate **Read & export** key in the same account, restricted to the same board. Use `/api/v1/devices/<DEVICE_ID>/readings`; keep its bearer token in a protected local environment variable.

The latest-upload check proves storage and authorized readback of one reading. It does not independently establish calibration, completeness of a whole run or end-to-end hardware reliability.

## 6. Proposed factory acceptance run

Use these criteria for this bench handoff. Record deviations rather than marking untested items as passed.

| Check | Required observation |
| --- | --- |
| Enrollment | Account A owns the exact board; its upload key is board-restricted and grants write:readings. |
| Timed upload run | Ten uninterrupted minutes at the two-second interval; approximately 300 generated measurements. Record actual generated, acknowledged, stored, duplicate and dropped counts, including any startup/warm-up differences. Explain every discrepancy. |
| Data preservation | Match representative serial payloads to stored/exported records across all BME280 and dual ADC fields, event identities and timestamps. No supplied nonzero value may disappear; reported zero values must remain zero. |
| Retry | Replay one original payload unchanged: outcome duplicate, with no extra stored row. Change the payload while retaining its event identity: HTTP 409. This is an API exercise, not a hardware command. |
| Short Wi-Fi interruption | Under the factory's supervised bench procedure, interrupt connectivity for 30 seconds and restore it. Record queued, dropped and drained counts and match the recovered events. Do not restart the board during this check. |
| Missing/invalid key | A separate controlled API request without a valid key receives 401 and stores no sample. Do not deliberately replace the running board's key just for this check: firmware stops retries after 401/403 until configuration/restart. |
| Customer isolation | Sign out; sign in as test account B. It must not list or read account A's board. A read-capable B key must receive 404 for A's board. Do not share the board or workspace before this check. |
| Revocation | At the end of the run, revoke A's upload key. One controlled API request using that key receives 401. Do not expect the running board to recover until a valid replacement is configured under the supervised process. |
| Sign-off | Factory operator supplies the evidence below; Bair1 checks it and records pass/fail for each row. |

The queue holds 120 samples in RAM, about four minutes at the default interval. Newest samples are dropped when full and a reboot loses the queue. This release does not promise durable offline retention. Power-loss retention is a separate limitation, not an acceptance claim.

## Error recovery

| Response | Meaning and next step |
| --- | --- |
| `404 enroll this device before uploading` | The route was reached, but this device is not enrolled. Bair1 provisions the board, then A claims its one-time code before retrying. |
| `404 device not found` | Check the owning account, the API key's device restriction, and any ownership/access change. Do not transfer ownership merely to silence this error. |
| `401 unauthorized` | Missing, incorrect, revoked or insufficiently scoped key. Check `write:readings`. The firmware may require a supervised restart after its configuration is corrected. |
| `400` | Invalid payload. Inspect the non-secret error message and preserve valid measurement types/units. |
| `409` | The same event identity was used for different data. Retry the original event unchanged; give a new measurement a new identity. |
| `503` | Storage unavailable or ingestion paused. No acknowledgment: retain and retry the sample within the queue's limits. |
| Timeout, DNS or TLS failure | Investigate connectivity, device time and certificate trust separately. Do not disable TLS verification. |

The manufacturer's confirmed enrollment error is an application response, not evidence of a China/Vercel connectivity block. The factory should still validate its own network during the timed run; other connectivity problems can coexist.

## Evidence to return

Supply the run's UTC start/end, firmware version, board name and operator; generated/acknowledged/stored/duplicate/dropped counts; non-secret acknowledgment and error lines; representative BME/ADC readback comparisons; interruption/drain results; isolation/revocation outcomes; and each acceptance row marked pass, fail or not tested. Share the actual device ID with Bair1 privately when needed to correlate a run. Redact keys, passwords, enrollment codes, Wi-Fi details, network identifiers and precise locations from shared evidence.

After sign-off, revoke unused keys and have the Bair1 operator disable/remove the temporary Auth0 identities. These accounts and keys do not automatically expire; only the one-time enrollment code expires after 24 hours.
