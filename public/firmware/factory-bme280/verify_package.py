import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parent
for item in json.loads((root/'manifest.json').read_text())['files']:
 data=(root/pathlib.PurePosixPath(item['path']).name).read_bytes()
 if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:
  sys.exit('Firmware verification failed. Download a fresh approved package.')
print('All four firmware file hashes match the release manifest.')
