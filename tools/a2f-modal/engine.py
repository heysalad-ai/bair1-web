"""NVIDIA Mark ONNX inference and geometry-based, bounded ARKit retarget.

Uses NVIDIA's published PCA basis and named blendshape deltas, not guessed
coefficient indices or amplitude-generated mouth animation.
"""
import io
import json
from pathlib import Path
import time
import wave

import numpy as np
import onnxruntime as ort
from scipy.signal import resample_poly

CHANNELS = ['jawOpen', 'mouthClose', 'mouthPucker', 'mouthSmileLeft', 'mouthSmileRight', 'eyeBlinkLeft', 'eyeBlinkRight']
MAX_AUDIO_BYTES = 2_500_044


def read_audio(data):
    if not 44 < len(data) <= MAX_AUDIO_BYTES:
        raise ValueError('Invalid audio size')
    with wave.open(io.BytesIO(data), 'rb') as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 24000 or wav.getcomptype() != 'NONE':
            raise ValueError('Expected mono PCM16 at 24 kHz')
        pcm = wav.readframes(wav.getnframes())
        if len(pcm) != wav.getnframes() * 2 or not pcm:
            raise ValueError('Truncated audio')
    audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768
    return resample_poly(audio, 2, 3).astype(np.float32), len(audio) / 24000


def solve_weights(rhs, hessian, lipschitz, active, iterations=2000):
    weights = np.zeros_like(rhs, dtype=np.float64)
    for _ in range(iterations):
        gradient = np.einsum('ij,jk->ik', weights, hessian, optimize=False)
        weights = np.clip(weights + (rhs - gradient) / lipschitz, 0, 1) * active
    if not np.isfinite(weights).all():
        raise ValueError('Invalid retarget output')
    return weights


def build_projection(directory):
    directory = Path(directory)
    with np.load(directory / 'bs_skin.npz', allow_pickle=False) as shapes, np.load(directory / 'model_data.npz', allow_pickle=False) as model:
        names = [value.decode() for value in shapes['poseNames'] if value.decode() != 'neutral']
        if len(names) != 52 or not all(name in names for name in CHANNELS):
            raise ValueError('Unexpected NVIDIA rig')
        mask = shapes['frontalMask']
        basis = np.stack([shapes[name][mask].reshape(-1) for name in names], axis=1).astype(np.float64)
        pca = model['shapes_matrix_skin'][:, mask, :].reshape(272, -1).astype(np.float64)
        offset = (model['shapes_mean_skin'][mask] - shapes['neutral'][mask]).reshape(-1).astype(np.float64)
    # Reference einsum avoids stale Accelerate floating-point flags observed
    # with the local NumPy/BLAS combination during independent verification.
    hessian = np.einsum('ij,ik->jk', basis, basis, optimize=False)
    projection = np.einsum('ij,jk->ik', pca, basis, optimize=False)
    bias = np.einsum('i,ij->j', offset, basis, optimize=False)
    active = np.array(json.loads((directory / 'bs_skin_config.json').read_text())['blendshape_params']['bsSolveActivePoses'], dtype=bool)
    ridge = np.trace(hessian) * 1e-5 / 52
    hessian += np.eye(52) * ridge
    lipschitz = np.linalg.eigvalsh(hessian).max()
    if not all(np.isfinite(x).all() for x in [hessian, projection, bias]):
        raise ValueError('Invalid NVIDIA geometry')
    # Independent known-pose recovery, not a model-output self-comparison.
    for name in ['jawOpen', 'mouthPucker', 'eyeBlinkLeft']:
        index = names.index(name)
        rhs = hessian[index:index + 1] - np.eye(52)[index:index + 1] * ridge
        recovered = solve_weights(rhs, hessian, lipschitz, active)
        if recovered[0, index] < .99 or np.max(np.delete(recovered[0], index)) > .02:
            raise ValueError('NVIDIA rig recovery failed')
    np.savez(directory / 'projection.npz', hessian=hessian, projection=projection, bias=bias, active=active, lipschitz=lipschitz, names=np.array(names))


class FaceEngine:
    def __init__(self, directory='/opt/bair1-model'):
        root = Path(directory)
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(root / 'network.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
        info = json.loads((root / 'network_info.json').read_text())
        config = json.loads((root / 'model_config.json').read_text())['config']
        if info['id'] != {'type': 'regression', 'actor': 'mark', 'version': '2.3', 'output': 'geometry'}:
            raise ValueError('Unexpected model identity')
        self.window = info['audio_params']['buffer_len']
        self.offset = info['audio_params']['buffer_ofs']
        self.strength = config['input_strength']
        with np.load(root / 'implicit_emo_db.npz', allow_pickle=False) as emotions:
            names = [value.decode() for value in emotions['emo_spec_names']]
            index = names.index(config['source_shot'])
            start = int(emotions['emo_spec_start'][index])
            implicit = emotions['emo_db'][start + int(config['source_frame'])]
        self.emotion = np.concatenate([implicit, np.array(info['params']['default_emotion'], dtype=np.float32)]).reshape(1, 1, 26)
        with np.load(root / 'projection.npz', allow_pickle=False) as projection:
            self.hessian = projection['hessian']
            self.projection = projection['projection']
            self.bias = projection['bias']
            self.active = projection['active']
            self.lipschitz = float(projection['lipschitz'])
            self.channels = [projection['names'].tolist().index(name) for name in CHANNELS]

    def infer(self, data):
        start = time.monotonic()
        audio, duration = read_audio(data)
        hop = 533  # Rounded 16 kHz / 30 fps, matching the reference MLX probe.
        targets = np.arange(0, len(audio), hop, dtype=np.int64)
        coefficients = []
        for offset in range(0, len(targets), 16):
            batch = targets[offset:offset + 16]
            indices = batch[:, None] - self.offset + np.arange(self.window)[None, :]
            valid = (indices >= 0) & (indices < len(audio))
            windows = audio[np.clip(indices, 0, len(audio) - 1)] * valid
            inputs = (windows[:, None, :] * self.strength).astype(np.float32)
            emotion = np.repeat(self.emotion, len(batch), axis=0)
            result = self.session.run(['result'], {'input': inputs, 'emotion': emotion})[0]
            if result.shape != (len(batch), 1, 301) or not np.isfinite(result).all():
                raise ValueError('Invalid NVIDIA inference output')
            coefficients.append(result[:, 0, :272])
        skin = np.concatenate(coefficients).astype(np.float64)
        rhs = np.einsum('ij,jk->ik', skin, self.projection, optimize=False) + self.bias
        weights = solve_weights(rhs, self.hessian, self.lipschitz, self.active)[:, self.channels]
        # Rest the lips only in digitally silent windows. Voiced movement is
        # inferred by NVIDIA and retargeted from geometry, never from energy.
        for i, target in enumerate(targets):
            segment = audio[max(0, target - 400):min(len(audio), target + 400)]
            if len(segment) and float(np.sqrt(np.mean(segment ** 2))) < 1 / 32768:
                weights[i, :5] = 0
        frames = [{'time': round(float(target) / 16000, 6), 'values': np.round(values, 6).tolist()} for target, values in zip(targets, weights)]
        return {'source': 'nvidia-audio2face', 'duration': duration, 'frames': frames, 'model': 'nvidia/Audio2Face-3D-v2.3-Mark', 'inferenceSeconds': round(time.monotonic() - start, 3)}
