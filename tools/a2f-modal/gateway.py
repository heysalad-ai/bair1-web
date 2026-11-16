"""Small authenticated gateway; no model import or inference before validation."""
import hmac
import io
import wave
from fastapi import HTTPException

async def handle_request(request, infer, key):
    expected = ('Bearer ' + key).encode('utf-8')
    if not hmac.compare_digest(request.headers.get('authorization', '').encode('utf-8'), expected):
        raise HTTPException(status_code=401, detail='Unauthorized')
    audio = bytearray()
    async for chunk in request.stream():
        if len(audio) + len(chunk) > 2_500_044:
            raise HTTPException(status_code=413, detail='Audio is too large')
        audio.extend(chunk)
    try:
        if len(audio) <= 44:
            raise ValueError()
        with wave.open(io.BytesIO(audio), 'rb') as wav:
            if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 24000 or wav.getcomptype() != 'NONE':
                raise ValueError()
            expected = wav.getnframes() * 2
            if not expected or expected > 2_500_000 or len(wav.readframes(wav.getnframes())) != expected:
                raise ValueError()
    except (ValueError, wave.Error, EOFError):
        raise HTTPException(status_code=400, detail='Invalid speech audio') from None
    try:
        return await infer(bytes(audio))
    except Exception:
        raise HTTPException(status_code=503, detail='Face animation is unavailable') from None
