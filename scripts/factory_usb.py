"""Factory USB fallback. Requires pyserial==3.5; never prints configuration secrets."""
import argparse
import json
import re
import sys
import time
import uuid
from pathlib import Path

UPLOAD_URL = "https://app.bair1.live/api/readings"
VERSION = "bair1-xiao-bme-adc-1.1.0"
class FactorySetupError(ValueError):
    """Safe operator messages authored here, never raw serial/configuration content."""

def exchange(port, command, timeout=10):
    request_id = str(uuid.uuid4())
    command = {**command, "requestId": request_id}
    port.write((json.dumps(command, separators=(",", ":")) + "\n").encode())
    port.flush()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        line = port.readline(4097)
        if not line or len(line) > 4096:
            continue
        try:
            value = json.loads(line)
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(value, dict) or value.get("requestId") != request_id:
            continue
        if value.get("bair1") == "error":
            raise FactorySetupError("Board rejected its settings. Reconnect and prepare fresh settings.")
        return value
    raise FactorySetupError("No factory reply. Install factory firmware, close Serial Monitor, and retry.")

def identity(port):
    value = exchange(port, {"bair1": "identify"})
    if (value.get("bair1") != "identity" or value.get("protocolVersion") != 1
            or value.get("chip") != "ESP32-S3" or value.get("firmwareVersion") != VERSION
            or not re.fullmatch(r"XIAO-[0-9A-F]{12}", str(value.get("deviceId", "")))
            or not re.fullmatch(r"[0-9A-F]{32}", str(value.get("bootSession", "")))):
        raise FactorySetupError("Unsupported board/firmware. Install the approved BME280 + dual ADC build.")
    return value

def configure(port, settings):
    board = identity(port)
    fields = ("deviceId", "ssid", "password", "apiKey", "url", "factorySessionId")
    if any(not isinstance(settings.get(field), str) for field in fields):
        raise FactorySetupError("Invalid settings file. Download it again from factory setup.")
    if settings["deviceId"] != board["deviceId"]:
        raise FactorySetupError("Wrong board connected. This settings file belongs to another unit.")
    if settings["url"] != UPLOAD_URL:
        raise FactorySetupError("Unexpected server URL. Download fresh settings from Bair1.")
    command = {field: settings[field] for field in fields}
    reply = exchange(port, {**command, "bair1": "configure", "bootSession": board["bootSession"]})
    if reply.get("bair1") != "configured" or reply.get("deviceId") != board["deviceId"] or reply.get("bootSession") != board["bootSession"]:
        raise FactorySetupError("Configuration acknowledgment did not match this board.")

def main():
    parser = argparse.ArgumentParser(description="Identify or configure one Bair1 factory board over USB.")
    parser.add_argument("--port", required=True, help="COM port on Windows or /dev/cu.usbmodem... on macOS")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--identify", action="store_true")
    action.add_argument("--config", type=Path, help="Private settings JSON downloaded from Bair1")
    args = parser.parse_args()
    try:
        import serial
        with serial.Serial(args.port, 115200, timeout=0.5, write_timeout=5, exclusive=sys.platform != "win32") as port:
            time.sleep(2)  # Opening a port can restart an ESP32-S3.
            if args.identify:
                print(identity(port)["deviceId"])
            else:
                settings = json.loads(args.config.read_text(encoding="utf-8"))
                configure(port, settings)
                print("Settings acknowledged. Board is restarting. Check upload in the web tool, then delete the private settings file.")
    except ImportError:
        parser.exit(1, "Install pyserial==3.5 as described in MANUAL-SETUP.md.\n")
    except FactorySetupError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        # Serial and JSON library errors can include input or port content. Do not echo them.
        parser.exit(1, "USB setup failed. Check the selected port, approved firmware, matching settings file, and close other serial applications. Reconnect and retry.\n")

if __name__ == "__main__":
    main()
