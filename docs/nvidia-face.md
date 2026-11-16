# NVIDIA facial animation on Modal

The authenticated voice route generates verified OpenAI Cedar audio, then calls the owned Modal deployment of NVIDIA's published Audio2Face Mark v2.3 ONNX model. The model emits geometry coefficients; a bounded least-squares retarget uses NVIDIA's matching PCA basis and named blendshape deltas to produce seven mouth/eye controls for the existing SVG bear. This is a stylized 2D retarget, not a 3D mesh or NVIDIA-rendered video.

## Data and playback

Only the requested PCM16 mono 24 kHz voice audio reaches Modal. Device summaries use “Selected unit” instead of an identifying label. No device IDs, coordinates, account identifiers, database credentials, OpenAI key or Modal administrative token are forwarded to the model. There is no application-level audio/frame persistence or cross-customer cache.

Returned frames must be finite, bounded, complete and monotonic, with at most 3,200 frames and a 1 MB HTTP response. Only the seven canonical channels reach the browser. Playback interpolates against `audio.currentTime`, preserving pauses and avoiding wall-clock drift. Digitally silent input windows rest the lips; voiced motion comes from NVIDIA inference and geometry, not amplitude-derived animation.

Each requested summary captures the displayed readings in an explicit snapshot, so live sensor refreshes cannot continually cancel preparation. Changing the device, graph selection or fleet context cancels that snapshot. Stop, hidden pages, component cleanup and superseded requests cancel browser animation callbacks. When a browser blocks playback after asynchronous preparation, Play summary resumes the same clip on a fresh gesture without another provider request. Reduced motion skips the external face request and suppresses facial movement. A missing, failed or malformed face response leaves verified Cedar speech and text available. The UI labels NVIDIA motion only when validated animation is actually playing.

The existing authenticated daily voice budgets cover the request: 10 attempts per user and 100 globally. Speech has a 35-second generation bound; Modal delivery has a 45-second bound; the combined route has a 90-second cap. A cancelled HTTP request can leave an already-running remote inference finishing under its own 40-second limit; the browser generation guard prevents it from playing later.

## Deployment and access

Modal app: `bair1-nvidia-face`, separate from existing Sally/HeySalad deployments. NVIDIA weights and geometry assets are fetched from immutable revision `5451728e07378df93b04523279e134a9993ae71b` of `nvidia/Audio2Face-3D-v2.3-Mark` while building the image. The image build verifies known-pose recovery before publishing. The running model uses CPU inference, one container maximum, no minimum warm containers, and a 30-second scale-down window. No GPU reservation, NGC account or always-on Mac is required.

The public HTTP function is a small CPU gateway. It validates its own bearer secret and bounded WAV before invoking the private model function. Modal's CLI can describe this URL as “unauthenticated” because Modal proxy tokens are not used; our gateway authentication still rejects unsigned requests with HTTP 401. No model work runs before that check.

The existing Modal profile is used only for administration/deployment. A separate, narrowly used service credential is stored in the Modal Secret `bair1-nvidia-face-auth` and as a sensitive Vercel production variable:

- `BAIR1_A2F_HTTP_URL`: the deployment's HTTPS `*.modal.run` endpoint, server-only.
- `BAIR1_A2F_API_KEY`: the service bearer credential, server-only and sensitive.

The HTTP client rejects credentials in URLs, non-HTTPS or non-Modal hosts, redirects and oversized output. It never follows a redirect with the service secret. Disabling the endpoint variable disables the optional stage. Provider failure also preserves speech automatically.

## Verification

- Real model inference on Modal: 254 frames for the generic 8.45-second Cedar clip, 5.613 seconds in the direct model check. Results matched the local ONNX reference within 0.000001 in every returned control.
- Real protected HTTP path: unsigned request 401, invalid authenticated WAV 400, valid sample 200 with 254 frames. The cold HTTP check took 19.042 seconds, including 8.894 seconds of inference; first-use latency is material and may vary.
- Offline numerical/audio/authentication tests do not require Modal credentials, model downloads or paid inference. Node tests cover media-clock interpolation, cancellation, malformed output, voice fallback, reduced motion and rendered SVG controls.
- Actual browser interaction and responsive playback still require a working browser connection. Offline component renders are preview evidence, not a live dashboard capture.

The earlier Apple Silicon MLX probe remains in `tools/a2f-mlx-probe` as research/reference evidence. Production uses the official ONNX weights directly on Modal, without that community runtime or identity-index guessing.

## Sources

- [Official NVIDIA Mark model and license](https://huggingface.co/nvidia/Audio2Face-3D-v2.3-Mark)
- [Official NVIDIA model/geometry outputs](https://github.com/NVIDIA/Audio2Face-3D-SDK/blob/main/docs/README.md)
- [Modal web functions](https://modal.com/docs/guide/webhooks)
- [Modal autoscaling](https://modal.com/docs/guide/scale)
- [Modal deployment operations](../tools/a2f-modal/README.md)
