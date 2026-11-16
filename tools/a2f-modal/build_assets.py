"""Fetch pinned public NVIDIA assets and verify the rig before baking an image."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request
from bair1_face_engine import build_projection

ROOT = Path('/opt/bair1-model')
REVISION = '5451728e07378df93b04523279e134a9993ae71b'
FILES = ['network.onnx', 'network_info.json', 'model_config.json', 'implicit_emo_db.npz', 'model_data.npz', 'bs_skin.npz', 'bs_skin_config.json']
ROOT.mkdir(parents=True, exist_ok=True)

def download(name):
    url = f'https://huggingface.co/nvidia/Audio2Face-3D-v2.3-Mark/resolve/{REVISION}/{name}'
    with urllib.request.urlopen(url, timeout=180) as response, (ROOT / name).open('wb') as destination:
        while chunk := response.read(1 << 20):
            destination.write(chunk)

with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(download, FILES))
build_projection(ROOT)
# Only compact runtime assets remain in the image; no reconstruction matrices
# or customer audio are stored by a running inference container.
for name in ['model_data.npz', 'bs_skin.npz', 'bs_skin_config.json']:
    (ROOT / name).unlink()
