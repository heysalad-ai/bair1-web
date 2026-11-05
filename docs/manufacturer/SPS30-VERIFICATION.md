# SPS30 factory release acceptance

Target: Seeed XIAO ESP32-S3 with Sensirion SPS30, Saddle Sense RevC 1.0.3 reference. I2C SDA D4/GPIO5, SCL D5/GPIO6, SEL grounded, regulated 5V sensor power, common ground. Not the older D3 probe or UART prototype.

Required before software release:
- Preserve the existing BME280 1.1.0 workflow and manifests.
- Bind each enrollment to a selected sensor profile; reject silent profile changes.
- Only accept current-session, correct-version, fresh SPS30 mass readings after warm-up. Zero is valid; missing/nonfinite/out-of-range data, sensor errors and stale frames fail.
- Maintain private ownership, grant expiry/quota, device-bound keys, revocation and power-cycle receipt checks.
- Compile actual ESP32-S3 firmware with pinned official Sensirion driver; package no credentials, pin binary hashes and verify manual fallback rejects another profile/board.
- Run backend regressions, typecheck, lint, production build and desktop/mobile rendered UI review.
- Merge reviewed commit and verify the deployed profile and package integrity.
- Produce branded Simplified Chinese PDF with screenshots, wiring, manual fallback and physical acceptance checklist.

Physical acceptance remains with the manufacturer: first one reference unit, 10-minute sensor run, reference instrument comparison if accuracy is required, saved settings after power cycle, then repeat for the batch. Software verification cannot establish actual wiring, fan operation, sensor accuracy or USB flashing on their hardware. Diagnostic firmware does not certify battery, LED, BLE, enclosure or complete product operation.

## Verification evidence (5 November 2026)

- Actual sketch compiled with ESP32 Arduino 3.3.11 for esp32:esp32:XIAO_ESP32S3; Sensirion I2C SPS30 1.0.0 and Sensirion Core 0.7.3. Program 1,030,816 bytes; globals 47,880 bytes. No hardware flashed.
- Native execution of actual serializer/validator covers valid zero PM, failed driver return, warm-up, age, device status, invalid range and null-on-failure. Actual USB parser tested for both firmware builds.
- Local DynamoDB factory suite: 12 tests, including compiled serializer payload through real POST handler, duplicate acknowledgment, cross-device rejection, profile binding, quota/ownership/key behavior and stale/invalid receipts. Access 12, ingestion 13, restore 1 checks passed.
- Browser desktop 1280 and mobile 390: simulated identity/configuration/PM receipt/new-boot workflow verified. Impeccable detector empty; independent finish reviewer ship at this simulated UI scope; documenter confirmed incumbent design preserved. No real sensor/USB result claimed.
- Existing BME280 binary hashes remain unchanged; its manual helper now rejects cross-profile settings. Both packages have pinned hashes, complete ZIP contents and blank build-time credentials.

Build, production HTTP smoke, CI and deployment are recorded in the pull request. Hardware acceptance remains pending with the manufacturer.
