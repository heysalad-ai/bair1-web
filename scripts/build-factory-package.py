"""Package a separately compiled, credential-free ESP32-S3 build. Does not flash."""
import hashlib
import json
import pathlib
import re
import shutil
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
build = pathlib.Path(sys.argv[1])
profile = sys.argv[2] if len(sys.argv) > 2 else "bme280-adc"
assert profile in ("bme280-adc", "sps30-i2c")
sps = profile == "sps30-i2c"
folder = "factory-sps30" if sps else "factory-bme280"
sketch = "Bair1_SPS30" if sps else "Bair1_Xiao"
version = "bair1-xiao-sps30-1.0.0" if sps else "bair1-xiao-bme-adc-1.1.0"
manual = "SPS30-MANUAL-SETUP.md" if sps else "MANUAL-SETUP.md"
dest = root / "public/firmware" / folder
dest.mkdir(parents=True, exist_ok=True)
config = (root / "firmware" / sketch / "bair1_config.h").read_text()
for field in ["WIFI_SSID", "WIFI_PASSWORD", "BAIR1_API_KEY", "BAIR1_URL"]:
    assert re.search(rf'{field}\[\]\s*=\s*"";', config), "Public binaries require blank compile-time credentials"
files = []
sources = [(f"{sketch}.ino.bootloader.bin", "bootloader.bin", 0), (f"{sketch}.ino.partitions.bin", "partitions.bin", 0x8000), ("boot_app0.bin", "boot_app0.bin", 0xe000), (f"{sketch}.ino.bin", "application.bin", 0x10000)]
for source, name, address in sources:
    binary = build / source
    assert binary.is_file(), f"Missing compiled artifact: {source}"
    data = binary.read_bytes()
    shutil.copyfile(binary, dest / name)
    files.append({"path": f"/firmware/{folder}/{name}", "address": address, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
manifest = {"version": version, "chip": "ESP32-S3", "fqbn": "esp32:esp32:XIAO_ESP32S3", "arduinoEsp32": "3.3.11", "files": files}
(dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
(root / "src/lib" / ("factory-sps30-release.json" if sps else "factory-release.json")).write_text(json.dumps(manifest, indent=2) + "\n")
shutil.copyfile(root / "scripts/factory_usb.py", dest / "factory_usb.py")
shutil.copyfile(root / "docs/manufacturer" / manual, dest / "MANUAL-SETUP.md")
(dest / "verify_package.py").write_text('''import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parent
for item in json.loads((root/'manifest.json').read_text())['files']:
 data=(root/pathlib.PurePosixPath(item['path']).name).read_bytes()
 if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:
  sys.exit('Firmware verification failed. Download a fresh approved package.')
print('All four firmware file hashes match the release manifest.')
''')
(dest / "flash_board.py").write_text('''import pathlib,re,subprocess,sys
import verify_package
root=pathlib.Path(__file__).resolve().parent
port=input('Enter board COM port (for example COM7): ').strip()
if not re.fullmatch(r'COM[0-9]+',port,re.I):
 sys.exit('Invalid COM port.')
args=[sys.executable,'-m','esptool','--chip','esp32s3','--port',port,'write-flash','0x0','bootloader.bin','0x8000','partitions.bin','0xe000','boot_app0.bin','0x10000','application.bin']
sys.exit(subprocess.run(args,cwd=root).returncode)
''')
(dest / "Flash-Windows.cmd").write_bytes('''@echo off
setlocal
cd /d "%~dp0"
py flash_board.py
if errorlevel 1 exit /b 1
echo Installation complete. Tap RESET and follow MANUAL-SETUP.md.
pause
'''.replace('\n','\r\n').encode())
if sps:
    shutil.copyfile(root / "firmware/Bair1_SPS30/THIRD-PARTY-NOTICES.txt", dest / "THIRD-PARTY-NOTICES.txt")
with zipfile.ZipFile(dest / "Bair1-factory-USB-package.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in dest.iterdir():
        if file.suffix != ".zip": archive.write(file, file.name)
print("Packaged four credential-free binaries, hashes, manual instructions and USB helper.")
