// Explicit production acceptance only; ordinary builds never call a provider.
if (process.env.BAIR1_VERIFY_FACE_ON_BUILD !== '1') process.exit(0);
try {
  const target = process.env.BAIR1_A2F_HTTP_URL;
  const key = process.env.BAIR1_A2F_API_KEY;
  if (!target || !key) throw new Error();
  const url = new URL(target);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run') || url.port || url.username || url.password || url.search || url.hash) throw new Error();
  // One second of synthetic silence, never customer audio or an OpenAI call.
  const wav = Buffer.alloc(48044);
  wav.write('RIFF'); wav.writeUInt32LE(48036,4); wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
  wav.write('data',36); wav.writeUInt32LE(48000,40);
  const response = await fetch(url, {method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'audio/wav'},body:wav,redirect:'error',signal:AbortSignal.timeout(60000)});
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(); }
  const reader=response.body.getReader(), chunks=[];let bytes=0;
  try { while(true) {const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_000_000){await reader.cancel();throw new Error();}chunks.push(value);} } finally {reader.releaseLock();}
  const animation=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (animation.source!=='nvidia-audio2face' || animation.duration!==1 || !Array.isArray(animation.frames) || animation.frames.length!==31) throw new Error();
  let previous=-1;
  for(const frame of animation.frames){if(!Number.isFinite(frame.time)||frame.time<=previous||frame.time>1.1||!Array.isArray(frame.values)||frame.values.length!==7||frame.values.some(x=>!Number.isFinite(x)||x<0||x>1))throw new Error();previous=frame.time;}
  if(animation.frames[0].time>0.15 || previous<0.5)throw new Error();
  console.log('Production NVIDIA/Modal acceptance passed: authenticated inference, 31 complete frames, no customer data.');
} catch {
  console.error('Production NVIDIA/Modal acceptance failed. Check the protected service configuration; no credentials are logged.');
  process.exit(1);
}
