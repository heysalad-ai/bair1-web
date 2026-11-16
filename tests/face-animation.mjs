import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
const {validateFaceAnimation,sampleFace,REST_FACE}=createLoader()('src/lib/face-animation.ts');
const {pcmToWav}=createLoader()('src/lib/openai-speech.ts');
const clip=()=>({source:'nvidia-audio2face',duration:1,frames:Array.from({length:31},(_,i)=>({time:i/30,values:[i/30,0,0,0,0,0,0]}))});
test('timeline interpolates against the media clock and returns to rest',()=>{
 const animation=validateFaceAnimation(clip(),1);
 assert.ok(Math.abs(sampleFace(animation,.5).jaw-.5)<.00001);
 assert.deepEqual(sampleFace(animation,1),REST_FACE);assert.deepEqual(sampleFace(animation,-1),REST_FACE);
 for(const mutate of [x=>x.frames.reverse(),x=>x.frames[1].values[0]=NaN,x=>x.frames.splice(10),x=>x.duration=-1,x=>x.source='synthetic']){const bad=clip();mutate(bad);assert.throws(()=>validateFaceAnimation(bad,1));}
});
test('Modal transport sends only the WAV, bounds the response and rejects untrusted targets',async()=>{
 const previous={url:process.env.BAIR1_A2F_HTTP_URL,key:process.env.BAIR1_A2F_API_KEY};
 process.env.BAIR1_A2F_HTTP_URL='https://fixture--bair1.modal.run/';process.env.BAIR1_A2F_API_KEY='fixture';
 const {generateFaceAnimation,speechPcm}=createLoader()('src/lib/nvidia-face.ts');
 const wav=pcmToWav(Buffer.alloc(48000));
 try{
  const result=await generateFaceAnimation(wav,undefined,{fetcher:async(url,init)=>{assert.equal(url.hostname,'fixture--bair1.modal.run');assert.equal(init.headers.Authorization,'Bearer fixture');assert.equal(init.redirect,'error');assert.deepEqual(Buffer.from(init.body),wav);return Response.json(clip());}});
  assert.equal(result.frames.length,31);
  for(const response of [Response.json({error:'private-provider-message'},{status:503}),Response.json({...clip(),duration:3}),new Response('x'.repeat(1_000_001)),new Response('{}',{headers:{'content-length':'1000001'}})]){
   await assert.rejects(generateFaceAnimation(wav,undefined,{fetcher:async()=>response}),error=>error.message==='NVIDIA face animation is unavailable');
  }
  await assert.rejects(generateFaceAnimation(wav,AbortSignal.abort()),/cancelled/);
  for(const url of ['http://fixture.modal.run/','https://fixture.invalid/','https://user:password@fixture.modal.run/','https://fixture.modal.run/?key=fixture']){process.env.BAIR1_A2F_HTTP_URL=url;await assert.rejects(generateFaceAnimation(wav,undefined,{fetcher:()=>assert.fail('untrusted request')}),/configuration/);}
  assert.throws(()=>speechPcm(Buffer.from('not a WAV')));
 }finally{for(const [name,value] of [['BAIR1_A2F_HTTP_URL',previous.url],['BAIR1_A2F_API_KEY',previous.key]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
test('missing or failed NVIDIA service preserves verified voice without an active claim',async()=>{
 let configured=false,failed=false,modelCalls=0;
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
 const {POST}=createLoader({
 '@/lib/auth':{requireAuth:async()=>({user:{userId:'fixture-user'}})},
 '@/lib/usage-budget':{usageGate:async()=>null},
 '@/lib/openai-speech':{MAX_SPEECH_CHARACTERS:1200,generateBearSpeech:async()=>({audio:Buffer.from('fixture'),transcript:'Fixture.'})},
 '@/lib/nvidia-face':{faceServiceConfigured:()=>configured,generateFaceAnimation:async()=>{modelCalls++;if(failed)throw new Error('private-provider-error');return clip();}}
 })('src/app/api/voice/speak/route.ts');
 const request=(animate=true)=>new Request('https://fixture.invalid/api/voice/speak',{method:'POST',body:JSON.stringify({text:'Fixture.',animate})});
 try{let result=await (await POST(request())).json();assert.equal(result.faceStatus,'not-configured');assert.equal(result.animation,null);assert.match(result.audio,/^data:audio/);
 configured=true;const before=modelCalls;result=await (await POST(request(false))).json();assert.equal(result.faceStatus,'disabled');assert.equal(modelCalls,before);result=await (await POST(request())).json();assert.equal(result.faceStatus,'ready');
 failed=true;result=await (await POST(request())).json();assert.equal(result.faceStatus,'unavailable');assert.equal(result.animation,null);assert.ok(!JSON.stringify(result).includes('private-provider-error'));assert.match(result.audio,/^data:audio/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
