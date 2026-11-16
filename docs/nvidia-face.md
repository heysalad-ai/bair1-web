# NVIDIA facial animation integration

Status: prepared and software-tested; not active in production. No Audio2Face endpoint or NVIDIA key was found in the production configuration. Do not label this release NVIDIA-powered until real inference and browser playback have passed.

## Data path

After an authenticated Read summary request passes the existing voice budget, OpenAI generates the verified Cedar WAV. If a trusted Audio2Face service is configured, the server sends that exact PCM16 mono 24 kHz audio through NVIDIA's `A2FControllerService.ProcessAudioStream` gRPC method. It sends the audio header, bounded one-second chunks and EndOfAudio marker, then consumes named ARKit frames and successful completion.

Only seven named mouth/eye channels reach the browser. They are validated, bounded to 3,200 frames, and interpolated against `audio.currentTime`. The SVG bear maps jaw opening, lip pucker, smile and blinking onto its existing artwork. This is a stylized 2D retarget, not a 3D mesh or NVIDIA-rendered video. Reduced motion suppresses facial movement. Stop, cancellation, hidden pages and unmounting cancel playback and pending animation callbacks.

No device identifiers, coordinates, identity metadata or provider credentials are sent with the NVIDIA request. The input is the selected voice audio. The browser never receives the service key or endpoint. A missing, failed or malformed face response leaves verified Cedar audio available; it does not produce a false NVIDIA-active state. Additional inference has a 12-second deadline; the combined route is bounded to 60 seconds. Existing daily voice budgets cover both stages.

## Required production service

Use an owned Audio2Face NIM service or a supported hosted endpoint offering the pinned NVIDIA protocol in `vendor/nvidia-a2f`. The former demo at build.nvidia.com/nvidia/audio2face-3d is deprecated. The official SDK lists Linux/Windows and a compatible NVIDIA GPU; neither this Mac nor the Vercel application is that inference host.

The service needs TLS and a gateway that actually validates the bearer credential. A standalone NIM port must not be exposed publicly: merely attaching an authorization header does not make an unauthenticated NIM secure. Keep the model container internal behind the authenticated gateway, and verify unauthorized calls are rejected before configuring Bair1.

Server-only configuration, supplied through the deployment provider's secret manager:

- `BAIR1_A2F_TARGET`: trusted gRPC DNS hostname and port (no URL scheme).
- `BAIR1_A2F_API_KEY`: the gateway/service bearer credential.
- `BAIR1_A2F_FUNCTION_ID`: only when the selected hosted service requires it.

Do not enter credentials in this document or commit them. Review the NVIDIA model/container terms for the chosen deployment. Choose a GPU host, region, shutdown policy and spending limit before provisioning new paid infrastructure. NVIDIA's official deployment examples and support matrix, rather than an untested compose recipe, define the model-specific GPU/runtime setup.

## Acceptance before activation

1. Run one generic Cedar WAV through the real NVIDIA endpoint, recording service/model version, duration and frame count without credentials or customer data.
2. Check complete monotonic frames, mapped jaw/eye channels, mouth pauses during silence, no changed voice and no drift through the entire clip. Check response payload and end-to-end latency against the route limits.
3. Check authenticated and unauthorized gateway requests, cancellation, timeouts and provider failure while Cedar/text remain usable.
4. In the actual dashboard, check Read summary, Stop, hidden tab, device change, reduced motion and mobile/desktop rendering. Synthetic fixture output cannot satisfy real inference acceptance.
5. Configure production secrets, deploy the tested revision, repeat the hosted check and record deployment SHA. Remove both A2F configuration values to disable the optional stage if needed.

## Apple Silicon investigation

The community Speech Swift port runs NVIDIA's v2.3 model through MLX, but returns identity-specific geometry coefficient vectors (Mark: 301), not NIM's named ARKit controls. Its own documentation requires a matching rig or retarget projection. It is not a drop-in replacement for this adapter; raw coefficients must never be guessed into named channels. The pinned probe in `tools/a2f-mlx-probe` ran successfully on the local Apple Silicon Mac: the 8.45-second Cedar sample produced 254 frames of 301 finite coefficients in 3.98 seconds after loading. This is real model inference, not an ARKit retarget or a hosted production service. No uptime claim is made.

## Sources

- [NVIDIA SDK and system requirements](https://github.com/NVIDIA/Audio2Face-3D-SDK)
- [NVIDIA official sample protocols and deployment resources](https://github.com/NVIDIA/Audio2Face-3D-Samples)
- [Deprecated hosted endpoint](https://build.nvidia.com/nvidia/audio2face-3d)
- [Community MLX port and coefficient/rig limitations](https://github.com/soniqo/speech-swift/blob/main/docs/models/audio2face3d.md)

## Software verification

`tests/face-animation.mjs` performs a real local gRPC/protobuf round trip with a synthetic service, checks PCM metadata/chunk transport, status/error handling, malformed frames, media-clock interpolation, stale callback cancellation and voice fallback. This tests protocol integration; it does not run NVIDIA inference. Existing speech, authorization and firmware suites remain required.
