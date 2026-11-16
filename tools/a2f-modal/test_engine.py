import io
import unittest
import wave

import numpy as np
from fastapi import HTTPException
from engine import read_audio, solve_weights
from gateway import handle_request


def wav_bytes(rate=24000, channels=1):
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        samples = (np.sin(2 * np.pi * 1000 * np.arange(2400) / rate) * 16384).astype('<i2')
        wav.writeframes(samples.tobytes())
    return buffer.getvalue()


class MathTests(unittest.TestCase):
    def test_known_bounded_solution_and_inactive_controls(self):
        rhs = np.array([[.3, .6]])
        result = solve_weights(rhs, np.eye(2), 1, np.array([True, False]), iterations=20)
        np.testing.assert_allclose(result, [[.3, 0]], atol=1e-8)
        with self.assertRaises(ValueError):
            solve_weights(np.array([[np.nan, 0]]), np.eye(2), 1, np.array([True, True]), iterations=1)

    def test_resampling_preserves_duration_and_tone_amplitude(self):
        audio, duration = read_audio(wav_bytes())
        self.assertEqual(len(audio), 1600)
        self.assertAlmostEqual(duration, .1)
        self.assertAlmostEqual(float(np.sqrt(np.mean(audio[50:-50] ** 2))), .3535, places=2)
        with self.assertRaises(ValueError):
            read_audio(wav_bytes(rate=16000))

    def test_truncated_and_empty_audio_rejected(self):
        with self.assertRaises(ValueError):
            read_audio(wav_bytes()[:-10])
        with self.assertRaises(ValueError):
            read_audio(b'')


class Request:
    def __init__(self, body, authorization='Bearer fixture-key'):
        self.headers = {'authorization': authorization}
        self.body = body
        self.read = False

    async def stream(self):
        self.read = True
        yield self.body


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = 0

    async def infer(self, audio):
        self.calls += 1
        return {'source': 'nvidia-audio2face', 'frames': []}

    async def test_authentication_precedes_body_and_model(self):
        request = Request(b'invalid', authorization='Bearer wrong')
        with self.assertRaises(HTTPException) as context:
            await handle_request(request, self.infer, 'fixture-key')
        self.assertEqual(context.exception.status_code, 401)
        self.assertFalse(request.read)
        self.assertEqual(self.calls, 0)

    async def test_invalid_and_oversized_audio_never_loads_model(self):
        for body, status in [(b'RIFF' + b'bad' * 20, 400), (b'x' * 2_500_045, 413)]:
            with self.assertRaises(HTTPException) as context:
                await handle_request(Request(body), self.infer, 'fixture-key')
            self.assertEqual(context.exception.status_code, status)
        self.assertEqual(self.calls, 0)

    async def test_authenticated_valid_audio_reaches_inference(self):
        result = await handle_request(Request(wav_bytes()), self.infer, 'fixture-key')
        self.assertEqual(self.calls, 1)
        self.assertEqual(result['source'], 'nvidia-audio2face')

    async def test_provider_failure_is_sanitized(self):
        async def fail(audio):
            raise RuntimeError('private-provider-detail')
        with self.assertRaises(HTTPException) as context:
            await handle_request(Request(wav_bytes()), fail, 'fixture-key')
        self.assertEqual(context.exception.status_code, 503)
        self.assertNotIn('private-provider-detail', context.exception.detail)


if __name__ == '__main__':
    unittest.main()
