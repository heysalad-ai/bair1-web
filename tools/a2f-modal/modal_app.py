"""Isolated Bair1 NVIDIA model deployment; never modifies existing Modal apps."""
from pathlib import Path
import os
import modal
from fastapi import Request

HERE = Path(__file__).parent
app = modal.App('bair1-nvidia-face')
model_image = (modal.Image.debian_slim(python_version='3.12')
    .pip_install('numpy==2.5.5', 'scipy==1.18.1', 'onnxruntime==1.32.0', 'fastapi==0.163.1')
    .add_local_file(HERE / 'engine.py', '/root/bair1_face_engine.py', copy=True)
    .add_local_file(HERE / 'build_assets.py', '/root/build_assets.py', copy=True)
    .run_commands('python /root/build_assets.py'))
web_image = (modal.Image.debian_slim(python_version='3.12').pip_install('fastapi==0.163.1')
    .add_local_file(HERE / 'gateway.py', '/root/bair1_face_gateway.py', copy=True))

@app.cls(image=model_image, cpu=4, memory=2048, min_containers=0, max_containers=1, scaledown_window=30, timeout=40, startup_timeout=120)
class NvidiaFace:
    @modal.enter()
    def load(self):
        from bair1_face_engine import FaceEngine
        self.engine = FaceEngine()

    @modal.method()
    def animate(self, audio: bytes):
        return self.engine.infer(audio)

@app.function(image=web_image, cpu=.125, memory=256, min_containers=0, max_containers=1, scaledown_window=10, timeout=60, secrets=[modal.Secret.from_name('bair1-nvidia-face-auth', required_keys=['BAIR1_A2F_API_KEY'])])
@modal.concurrent(max_inputs=4)
@modal.fastapi_endpoint(method='POST', docs=False)
async def animate(request: Request):
    from bair1_face_gateway import handle_request
    async def infer(audio):
        return await NvidiaFace().animate.remote.aio(audio)
    from fastapi.responses import JSONResponse
    result = await handle_request(request, infer, os.environ['BAIR1_A2F_API_KEY'])
    return JSONResponse(result, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})

@app.local_entrypoint()
def smoke(sample: str, output: str = ''):
    import json
    audio = Path(sample).read_bytes()
    result = NvidiaFace().animate.remote(audio)
    if output:
        Path(output).write_text(json.dumps(result))
    print(json.dumps({'model': result['model'], 'frames': len(result['frames']), 'duration': result['duration'], 'inferenceSeconds': result['inferenceSeconds']}))

@app.function(image=web_image, cpu=.125, memory=256, min_containers=0, max_containers=1, scaledown_window=2, timeout=90, secrets=[modal.Secret.from_name('bair1-nvidia-face-auth', required_keys=['BAIR1_A2F_API_KEY'])])
def verify_endpoint(audio: bytes):
    import json
    import time
    import urllib.request
    import urllib.error
    url = modal.Function.from_name('bair1-nvidia-face', 'animate').get_web_url()
    def post(data, authenticated):
        headers = {'Content-Type': 'audio/wav'}
        if authenticated:
            headers['Authorization'] = 'Bearer ' + os.environ['BAIR1_A2F_API_KEY']
        request = urllib.request.Request(url, data=data, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=70) as response:
                return response.status, response.read(1_000_001)
        except urllib.error.HTTPError as error:
            return error.code, b''
    anonymous, _ = post(b'invalid', False)
    invalid, _ = post(b'invalid', True)
    start = time.monotonic()
    status, body = post(audio, True)
    if anonymous != 401 or invalid != 400 or status != 200 or len(body) > 1_000_000:
        return {'ok': False, 'anonymousStatus': anonymous, 'invalidAudioStatus': invalid, 'status': status}
    result = json.loads(body)
    return {'ok': True, 'anonymousStatus': anonymous, 'invalidAudioStatus': invalid, 'status': status, 'animation': result, 'roundTripSeconds': round(time.monotonic() - start, 3)}

@app.local_entrypoint()
def http_smoke(sample: str, output: str = ''):
    import json
    result = verify_endpoint.remote(Path(sample).read_bytes())
    animation = result.pop('animation', None)
    if animation and output:
        Path(output).write_text(json.dumps(animation))
    if animation:
        result.update({'model': animation['model'], 'frames': len(animation['frames']), 'duration': animation['duration'], 'inferenceSeconds': animation['inferenceSeconds']})
    print(json.dumps(result))
    if not result['ok']:
        raise RuntimeError('Modal HTTP acceptance failed')
