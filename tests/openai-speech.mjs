import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createLoader } from './helpers/load-ts.mjs';
const { generateBearSpeech, pcmToWav } = createLoader()('src/lib/openai-speech.ts');
class Socket extends EventEmitter {
  sent=[]; terminated=false; closed=false;
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed=true; }
  terminate() { this.terminated=true; }
  event(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
}
function session(text='Temperature is 21.5 degrees Celsius.') {
  const socket=new Socket(); let headers;
  const promise=generateBearSpeech(text,{apiKey:'fixture-key',subject:'fixture-user',connect:(url,h)=>{assert.match(url,/gpt-realtime-2.1-mini/);headers=h;return socket;}});
  return {socket,promise,headers};
}
function complete(socket,transcript) {
  socket.event({type:'response.output_audio.delta',delta:Buffer.from([0,0,1,0]).toString('base64')});
  socket.event({type:'response.output_audio_transcript.done',transcript});
  socket.event({type:'response.done',response:{status:'completed'}});
}
test('speech emits a single output-only request and returns verified PCM WAV',async()=>{
  const {socket,promise,headers}=session();
  assert.equal(headers.Authorization,'Bearer fixture-key');
  assert.match(headers['OpenAI-Safety-Identifier'],/^[a-f0-9]{64}$/);
  socket.event({type:'session.created'});socket.event({type:'session.updated'});socket.event({type:'session.updated'});
  assert.equal(socket.sent.length,2);
  assert.equal(socket.sent[0].session.audio.input.turn_detection,null);
  assert.equal(socket.sent[0].session.audio.output.voice,'cedar');
  assert.equal(socket.sent[1].response.conversation,'none');
  complete(socket,'Temperature is 21.5 degrees Celsius.');
  const result=await promise;
  assert.equal(result.audio.toString('ascii',0,4),'RIFF');
  assert.equal(result.audio.readUInt32LE(24),24000);
  assert.equal(result.audio.readUInt32LE(40),4);
  assert.equal(result.audio.length,48);assert.equal(socket.closed,true);
});
test('changed number or added reassurance is rejected',async()=>{
  for(const text of ['Temperature is 22.5 degrees Celsius.','Temperature is 21.5 degrees Celsius. Everything is safe.']) {
    const {socket,promise}=session();complete(socket,text);
    await assert.rejects(promise,/could not be verified/);assert.equal(socket.terminated,true);
  }
});
test('sign, decimal and unit marks must not disappear during verification',async()=>{
  for(const [source,spoken] of [['Temperature is -21.5 degrees.','Temperature is 21.5 degrees.'],['Temperature is 21.5 degrees.','Temperature is 215 degrees.'],['Humidity is 45%.','Humidity is 45.']]) {
    const {socket,promise}=session(source);complete(socket,spoken);await assert.rejects(promise,/could not be verified/);
  }
});
test('spoken minus is equivalent to a negative sign, never to a positive value',async()=>{
  const {socket,promise}=session('Temperature is -2.5 degrees Celsius.');complete(socket,'Temperature is minus 2.5 degrees Celsius.');assert.ok((await promise).audio.length>44);
  const changed=session('Temperature is 2.5 degrees Celsius.');complete(changed.socket,'Temperature is minus 2.5 degrees Celsius.');await assert.rejects(changed.promise,/could not be verified/);
});
test('provider errors are sanitized and aborted connections terminate',async()=>{
  const {socket,promise}=session();socket.event({type:'error',error:{message:'fixture-secret'}});
  await assert.rejects(promise,error=>!error.message.includes('fixture-secret'));
  const controller=new AbortController();const aborted=new Socket();
  const pending=generateBearSpeech('Test.',{apiKey:'fixture',signal:controller.signal,connect:()=>aborted});
  controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(aborted.terminated,true);
});
test('incomplete, malformed and excessive audio cannot be played',async()=>{
  for(const event of [{type:'response.done',response:{status:'incomplete'}},{type:'response.output_audio.delta',delta:Buffer.alloc(2_500_001).toString('base64')}]) {
    const {socket,promise}=session();socket.event(event);await assert.rejects(promise);
  }
  const {socket,promise}=session();socket.emit('message',Buffer.from('{invalid'));await assert.rejects(promise,/unreadable/);
  assert.equal(pcmToWav(Buffer.alloc(0)).length,44);
});
test('empty, oversized and already-aborted requests never connect',async()=>{
  for(const text of ['', 'a'.repeat(1201)]) await assert.rejects(generateBearSpeech(text,{apiKey:'fixture',connect:()=>assert.fail('connected')}));
  await assert.rejects(generateBearSpeech('Test.',{apiKey:'fixture',signal:AbortSignal.abort(),connect:()=>assert.fail('connected')}));
});
const { SpeechPlayback }=createLoader()('src/lib/speech-playback.ts');
function player(request,play=async()=>{}) {
  const states=[];const audios=[];
  const playback=new SpeechPlayback(request,state=>states.push(state),()=>{
    const audio={paused:false,play,pause(){this.paused=true;},removeAttribute(){},load(){}};audios.push(audio);return audio;
  });
  return {playback,states,audios};
}
const ok=()=>Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ=='});
test('cancelled or superseded fetch cannot start stale audio',async()=>{
  let resolve;let signal;const {playback,audios,states}=player((_,init)=>{signal=init.signal;return new Promise(r=>resolve=r);});
  const pending=playback.speak('Test.');playback.stop();assert.equal(signal.aborted,true);resolve(ok());await pending;
  assert.equal(audios.length,0);assert.equal(states.at(-1).speaking,false);
});
test('playback starts, ends and releases audio',async()=>{
  const {playback,audios,states}=player(async()=>ok());await playback.speak('Test.');
  assert.equal(states.at(-1).speaking,true);audios[0].onended();
  assert.equal(audios[0].paused,true);assert.equal(states.at(-1).speaking,false);
});
test('autoplay rejection and decoding errors produce recoverable state',async()=>{
  const denied=player(async()=>ok(),async()=>{throw new Error('Playback blocked');});await denied.playback.speak('Test.');
  assert.equal(denied.states.at(-1).error,'Playback blocked');assert.equal(denied.audios[0].paused,true);
  const decoded=player(async()=>ok());await decoded.playback.speak('Test.');decoded.audios[0].onerror();
  assert.match(decoded.states.at(-1).error,/could not be played/);
});
test('stop while play is pending remains silent when play resolves',async()=>{
  let finish;const {playback,audios,states}=player(async()=>ok(),()=>new Promise(r=>finish=r));
  const pending=playback.speak('Test.');await new Promise(r=>setImmediate(r));playback.stop();finish();await pending;
  assert.equal(audios[0].paused,true);assert.equal(states.at(-1).speaking,false);
});
test('voice route authenticates before parsing, gates cost and sanitizes provider errors',async()=>{
  let authorized=false,limited=false,called=0,fail=false;
  const prior=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
  try {
    const {POST}=createLoader({
      '@/lib/auth':{requireAuth:async()=>authorized?{user:{userId:'fixture-user'}}:Response.json({error:'Unauthorized'},{status:401})},
      '@/lib/usage-budget':{usageGate:async()=>limited?Response.json({error:'Limit'},{status:429}):null},
      '@/lib/openai-speech':{MAX_SPEECH_CHARACTERS:1200,generateBearSpeech:async()=>{called++;if(fail)throw new Error('fixture-secret');return {audio:Buffer.from('fixture'),transcript:'Test.'};}}
    })('src/app/api/voice/speak/route.ts');
    const request=(body='{"text":"Test."}')=>new Request('https://fixture.invalid/api/voice/speak',{method:'POST',body});
    assert.equal((await POST(request('{bad'))).status,401);assert.equal(called,0);
    authorized=true;assert.equal((await POST(request('{bad'))).status,400);
    assert.equal((await POST(request(JSON.stringify({text:'a'.repeat(1201)})))).status,400);
    limited=true;assert.equal((await POST(request())).status,429);assert.equal(called,0);
    limited=false;const success=await POST(request());assert.equal(success.status,200);assert.equal(success.headers.get('cache-control'),'private, no-store');
    fail=true;const error=await POST(request());assert.equal(error.status,503);assert.ok(!(await error.text()).includes('fixture-secret'));
  } finally {if(prior===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prior;}
});
