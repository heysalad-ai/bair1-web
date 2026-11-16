# Bair1 NVIDIA face service

Runs the official NVIDIA Audio2Face Mark v2.3 ONNX graph on Modal CPU workers, then fits named controls against NVIDIA's matching geometry assets. No CUDA SDK, rented GPU, NGC key or local Mac dependency is required.

`build_assets.py` fetches immutable public NVIDIA assets, constructs a compact geometry projection and checks recovery of independent known jaw/pucker/blink poses. Model assets remain in the private image; they are not committed or sent to the browser. Model use is governed by the [NVIDIA Open Model License](https://huggingface.co/nvidia/Audio2Face-3D-v2.3-Mark).

`gateway.py` authenticates and validates bounded PCM WAV before invoking the private model. `engine.py` performs anti-aliased 24→16 kHz resampling, batched model inference, constrained geometry retargeting and digital-silence lip rest. The public gateway has no model imports or database/OpenAI credentials.

## Deploy

Use the existing Modal profile. The app is isolated as `bair1-nvidia-face`; do not overwrite another app. A named Modal Secret `bair1-nvidia-face-auth` must already contain `BAIR1_A2F_API_KEY`. Configure that same narrow credential as a sensitive Vercel production variable, plus the returned endpoint in `BAIR1_A2F_HTTP_URL`. Never use the Modal administrative token as an inference credential.

```sh
uvx --python 3.12 --from modal==1.6.4 --with fastapi==0.163.1 modal deploy tools/a2f-modal/modal_app.py
```

The deployment uses one CPU model container maximum and scales to zero. Cold starts can be noticeable. Existing Bair1 voice budgets limit application calls; deployment does not change workspace billing settings or existing apps.

## Acceptance checks

The private smoke entrypoints use account authentication and a generic WAV. `http_smoke` retrieves the service credential only inside Modal, where it checks the deployed endpoint; no plaintext service key is returned to the operator.

```sh
uvx --python 3.12 --from modal==1.6.4 --with fastapi==0.163.1 modal run tools/a2f-modal/modal_app.py::http_smoke --sample /absolute/path/to/generic.wav --output /absolute/private/path/frames.json
```

Expect unsigned 401, invalid audio 400 and valid audio 200 with complete finite frames. The output is private test evidence, not a repository fixture. The deployed endpoint uses custom bearer authentication; Modal CLI's “unauthenticated” proxy label does not bypass this gateway.

Offline CI checks require no account, model or network inference:

```sh
pip install -r tools/a2f-modal/requirements.txt
python -m unittest discover -s tools/a2f-modal -p 'test_*.py'
```

Before activation, run the real endpoint check, Node/Python tests, build and HTTP smoke, then verify the production revision. For an explicit production-build check, temporarily set `BAIR1_VERIFY_FACE_ON_BUILD=1`: the build probes authenticated inference using one second of synthetic silence and logs no credentials or customer data. Remove this non-secret flag after acceptance so ordinary builds remain independent of provider availability. Manual browser checks must be reported separately. See [architecture and evidence](../../docs/nvidia-face.md).
