# Factory USB provisioning acceptance ledger

Registered before implementation on 5 November 2026.

| Requirement | Proof required | State |
| --- | --- | --- |
| Hardware identity matches existing firmware, including byte order | Generated MAC fixtures independently evaluated as little-endian uint64 versus browser derivation | Software pass; physical comparison at factory |
| Restricted factory enrollment without manual codes | Nine loopback DynamoDB tests include grant expiry, quota races, retry, ownership and cross-account rejection | Pass |
| Per-device upload key and safe retry | Transaction tests: hash-only storage, device/write-only scope, previous factory key revoked, ownership checked | Pass |
| USB configuration survives restart and never prints credentials | Actual sketch compiles; actual parser runs natively with NVS/USB boundary fakes; manual helper tests | Software pass; physical power-cycle check at factory |
| Approved browser flashing | Four compiled binary hashes pinned in browser bundle, MD5 flash verification, ESP32-S3/security guard, explicit operator action, manual package verified | Software pass; physical flash at factory |
| Passed requires a fresh receipt from this provisioning session | Tests reject stale/other-session/cross-device/invalid-sensor receipts and configuration races; simulated UI requires new boot session after power cycle | Software pass; physical sensor upload at factory |
| Usable factory workflow | 1440/390/1280 screenshots, keyboard focus/error/manual recovery, CSV download without credentials; finish reviewer ship after two fixes | Pass on simulated UI |
| Release remains compatible | 43 default tests, 12 access tests, 13 ingestion tests, restore test, native firmware replies; typecheck/build; lint 0 errors/24 existing warnings; runtime dependency audit 0 | Pass locally |
| Manufacturer can follow guide | Rendered screenshot PDF matching deployed UI; exact account login and recovery steps | Pending |

Software simulations are not evidence of a physical flash or sensor measurement. Record the deployed revision and hardware verification separately.

## Reference build

- FQBN `esp32:esp32:XIAO_ESP32S3`, Arduino ESP32 3.3.11, USB CDC enabled, default 8 MB layout.
- Sketch 1,050,360 bytes (31%); globals 48,216 bytes (14%).
- Public binaries have empty compile-time Wi-Fi credentials, upload key and URL. Settings are written later over USB into one NVS value. NVS is not claimed to be encrypted.
- Native ctags override was required on this Mac; the normal bundled ctags executable has an incompatible CPU architecture. No system toolchain was replaced.
- Browser flasher: esptool-js 0.7.1 with SHA-256 input checks and MD5 flash verification. It rejects other chip families and protected flash configurations.
- Manual path: Python 3.10+, esptool 5.3.1, pyserial 3.5. Windows batch entry has verified CRLF and delegates validated COM input to Python without shell interpolation. Actual Windows drivers and physical flashing remain factory acceptance items.
- Test results are page-memory observations; reports contain no upload key or Wi-Fi password. Reloaded pages can resume a unit and check a fresh receipt again.
- Factory grant expiry restricts provisioning; it does not automatically revoke existing device upload keys. Revocation remains available through Devices & access.
