"""Verify public firmware package integrity and ensure it contains no private configuration."""
import hashlib,json,pathlib,re,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
for folder_name,manifest_name,version,manual_name in [('factory-bme280','factory-release.json','bair1-xiao-bme-adc-1.1.0','MANUAL-SETUP.md'),('factory-sps30','factory-sps30-release.json','bair1-xiao-sps30-1.0.0','SPS30-MANUAL-SETUP.md')]:
 folder=root/'public/firmware'/folder_name
 manifest=json.loads((folder/'manifest.json').read_text())
 assert manifest==json.loads((root/'src/lib'/manifest_name).read_text())
 assert set(manifest)=={'version','chip','fqbn','arduinoEsp32','files'}
 assert manifest['version']==version and manifest['chip']=='ESP32-S3'
 assert len(manifest['files'])==4
 assert [x['address'] for x in manifest['files']]==[0,0x8000,0xe000,0x10000]
 with zipfile.ZipFile(folder/'Bair1-factory-USB-package.zip') as z:
  for item in manifest['files']:
   assert set(item)=={'path','address','size','sha256'}
   assert re.fullmatch(r'[0-9a-f]{64}',item['sha256'])
   p=pathlib.PurePosixPath(item['path']);assert str(p.parent)=='/firmware/'+folder_name
   data=(folder/p.name).read_bytes();assert len(data)==item['size'] and hashlib.sha256(data).hexdigest()==item['sha256']
   assert z.read(p.name)==data
  assert z.read('factory_usb.py')==(root/'scripts/factory_usb.py').read_bytes()
  assert z.read('MANUAL-SETUP.md')==(root/'docs/manufacturer'/manual_name).read_bytes()
  cmd=z.read('Flash-Windows.cmd');assert bytes([13,10]) in cmd and b'py flash_board.py' in cmd
  assert 'manifest.json' in z.namelist() and 'verify_package.py' in z.namelist()
  assert all('/' not in name and not name.startswith('.') for name in z.namelist())
for sketch in ('Bair1_Xiao','Bair1_SPS30'):
 config=(root/'firmware'/sketch/'bair1_config.h').read_text()
 for name in ('WIFI_SSID','WIFI_PASSWORD','BAIR1_API_KEY','BAIR1_URL'):
  assert re.search(rf'{name}\[\]\s*=\s*"";',config)
sps=root/'public/firmware/factory-sps30'
with zipfile.ZipFile(sps/'Bair1-factory-USB-package.zip') as z:
 assert z.read('THIRD-PARTY-NOTICES.txt')==(root/'firmware/Bair1_SPS30/THIRD-PARTY-NOTICES.txt').read_bytes()
print('Factory release verified: four exact firmware hashes, matching pinned manifest, ZIP/manual/helper consistency, Windows CRLF and blank build-time credentials.')
