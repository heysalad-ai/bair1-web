from pathlib import Path
import subprocess
binary=Path('/tmp/bair1-native-contract-path').read_text()
with open('/tmp/bair1-firmware-replies.jsonl','rb') as f:subprocess.run([binary,'ack'],stdin=f,check=True)
