#!/usr/bin/env bash
set -euo pipefail
python3 - <<'PYTHON'
import socket
with socket.socket() as server:
 try: server.bind(('127.0.0.1',18743))
 except OSError: raise SystemExit('Port 18743 is occupied; stop the existing local test database first')
PYTHON
# Local loopback only. Download is pinned by digest; upstream changes fail closed.
task_dir=$(mktemp -d "${TMPDIR:-/tmp}/bair1-db.XXXXXX")
cleanup() { if [ -n "${database_pid:-}" ]; then kill "$database_pid" 2>/dev/null || true; fi; rm -rf "$task_dir"; }
trap cleanup EXIT
curl --fail --silent --show-error --location https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.zip -o "$task_dir/database.zip"
python3 - "$task_dir/database.zip" <<'PY'
import hashlib, pathlib, sys
assert hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest() == '667cde09f96f4785cede4d107d8066011e5eeceb5dd4566ea8c74c0d378fe919', 'DynamoDB Local download changed; review and update the pinned version'
PY
unzip -q "$task_dir/database.zip" -d "$task_dir/database"
java -Djava.library.path="$task_dir/database/DynamoDBLocal_lib" -jar "$task_dir/database/DynamoDBLocal.jar" -inMemory -sharedDb -port 18743 -disableTelemetry > "$task_dir/database.log" 2>&1 &
database_pid=$!
python3 - <<'PY'
import socket,time
for attempt in range(100):
 try:
  with socket.create_connection(('127.0.0.1',18743),timeout=.2): break
 except OSError: time.sleep(.1)
else: raise SystemExit('DynamoDB Local failed to start')
PY
npm run test:access
npm run test:ingestion

npm run test:restore
