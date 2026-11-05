# Bair1 factory USB setup: manual fallback

For Seeed XIAO ESP32-S3 with BME280 on D4/D5 and ADC on D3/D2 only.
Do not use this package for MG24, ESP32-C3, SPS30, or camera boards.

## Prepare Windows

1. Install Python 3.10 or later, including the Windows Python launcher (`py`).
2. Unzip the complete factory package into a local folder. Do not run from inside the ZIP.
3. Open Command Prompt in that folder. Install the pinned tools:

   ```bat
   py -m pip install esptool==5.3.1 pyserial==3.5
   ```

4. Connect one board with a USB data cable. Find its COM port in Device Manager > Ports.
   Close Arduino Serial Monitor and browser USB connections before using a command.

## Install the approved firmware

5. Run `Flash-Windows.cmd`, enter the COM port (for example `COM7`), and keep the board
   connected until esptool reports hash verification and finishes successfully.
   The script verifies downloaded file SHA-256 hashes before it flashes and fixes the chip to ESP32-S3.
6. If connection fails, hold BOOT, tap RESET, release BOOT, check the COM port again, and retry.
   After a successful install tap RESET. A COM port may change after restarting.

On macOS/Linux, use the same Python dependencies with `python3`. Verify the manifest hashes
before installing, then run this command, substituting the board's serial port:

```sh
python3 verify_package.py
python3 -m esptool --chip esp32s3 --port /dev/cu.usbmodemYOURPORT write-flash 0x0 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 application.bin
```

## Detect, register and configure

7. Read the board's hardware-derived identity:

   ```bat
   py factory_usb.py --port COM7 --identify
   ```

8. Sign into `https://app.bair1.live/firmware#installer` with Account A from the confidential PDF.
   Under Factory USB setup, enter the factory's **2.4 GHz** Wi-Fi name and password.
9. Expand **Manual USB setup** and paste the ID printed by the helper. Click
   **Download private USB settings**. No enrollment code or manual API key creation is needed.
   The file contains a device-scoped upload key and Wi-Fi password. Keep it private.
10. Save the settings file in the local package folder and write it to the board:

   ```bat
   py factory_usb.py --port COM7 --config Bair1-private-USB-settings.json
   ```

   The helper refuses a file belonging to a different board. It reports acknowledgment
   without printing passwords or keys. The board restarts after saving.
11. Back in the web tool click **Check upload**. A matching fresh upload with valid BME280
   and ADC fields must appear. A USB acknowledgment alone is not a server-test pass.
12. Unplug and reconnect the board. Check that another sample arrives without rewriting settings.
    Record the power-cycle result. Keep the first unit running for ten minutes and confirm
    samples continue; two-second sampling is the nominal interval, not a delivery guarantee.
13. Delete the private settings file, including duplicate downloads, after configuration.
    Repeat steps 7-13 for each remaining board. Download the test report before leaving the page;
    its observed results are kept only in the current browser page.

## Recover from problems

- Factory access expired/no slots: contact Peter. Repeating setup of the same enrolled unit
  in the same batch does not consume another slot.
- Wrong Wi-Fi password or upload key: prepare fresh settings for this same unit, write them,
  then check upload. This revokes only its previous key created by the factory tool.
- Already owned/registered: stop and contact Peter. Do not invent a different ID or erase ownership.
- No upload: check 2.4 GHz Wi-Fi, internet access, DNS/time sync and stable USB power.
- Sensor check failed: check BME280 power and D4/D5 wiring. Do not count a successful USB flash
  or local serial measurement as proof of server receipt or sensor calibration.

Factory provisioning access lasts seven days. Device upload keys persist until revoked;
they are independent of enrollment/access expiry. Storage is ordinary ESP32 NVS: settings
persist across power loss, and this package does not claim encrypted storage or secure boot.
