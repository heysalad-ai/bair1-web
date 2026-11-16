# Apple Silicon inference probe

Research-only reproduction of NVIDIA Mark v2.3 inference through the pinned community Speech Swift MLX port. It downloads approximately 73 MB of model weights on first use. The weights are governed by the NVIDIA Open Model License; the community runtime is Apache-2.0. It preserves the existing Cedar voice; no new TTS integration is used.

Requires Apple Silicon, macOS 15+, Swift/Xcode and the Metal compiler component. From this folder:

```sh
swift build -c release --product bear-a2f-probe
.build/release/bear-a2f-probe /absolute/path/to/generic-sample.wav /absolute/path/to/private-motion.json
```

Use generic audio for checks. Keep output motion private and outside Git. Do not commit downloaded weights or local build output. The repository ignores `.build` below this folder.

Verified locally: 8.45s Cedar sample -> 254 frames, 301 finite coefficients per frame, 3.98s inference after loading. Initial build lacked the Metal toolchain; installing the official Xcode component allowed the build to pass.

These identity-specific geometry coefficients are not ARKit blendshapes. This probe neither retargets them to Bear One nor serves a production endpoint. The proper matching geometry/basis or a documented retarget is required for that path; do not guess coefficient indices into mouth or eye controls.
