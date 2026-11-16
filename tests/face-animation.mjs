import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { createLoader } from './helpers/load-ts.mjs';
const {FACE_CHANNELS,validateFaceAnimation,sampleFace,REST_FACE}=createLoader()('src/lib/face-animation.ts');
const {pcmToWav}=createLoader()('src/lib/openai-speech.ts');
const clip=()=>({source:'nvidia-audio2face',duration:1,frames:Array.from({length:31},(_,i)=>({time:i/30,values:[i/30,0,0,0,0,0,0]}))});
test('timeline interpolates against the media clock and returns to rest',()=>{
 const animation=validateFaceAnimation(clip(),1);
 assert.ok(Math.abs(sampleFace(animation,.5).jaw-.5)<.00001);
 assert.deepEqual(sampleFace(animation,1),REST_FACE);assert.deepEqual(sampleFace(animation,-1),REST_FACE);
 for(const mutate of [x=>x.frames.reverse(),x=>x.frames[1].values[0]=NaN,x=>x.frames.splice(10),x=>x.duration=-1,x=>x.source='synthetic']){const bad=clip();mutate(bad);assert.throws(()=>validateFaceAnimation(bad,1));}
});
test('actual protobuf gRPC round trip sends PCM and checks complete named output',async()=>{
 const definition=loadSync(join(process.cwd(),'vendor/nvidia-a2f/nvidia_ace.services.a2f_controller.v1.proto'),{keepCase:true,defaults:true,oneofs:true});
 const service=definition['nvidia_ace.services.a2f_controller.v1.A2FControllerService'];
 let mode='valid', header,bytes=0,endMarker=false,authorization;
 const server=new grpc.Server();server.addService(service,{ProcessAudioStream(call){
  authorization=call.metadata.get('authorization')[0];
  call.on('data',packet=>{if(packet.audio_stream_header)header=packet.audio_stream_header;if(packet.audio_with_emotion)bytes+=packet.audio_with_emotion.audio_buffer.length;if(packet.end_of_audio)endMarker=true;});
  call.on('end',()=>{call.write({animation_data_stream_header:{skel_animation_header:{blend_shapes:[...FACE_CHANNELS]}}});
   const frames=clip().frames.map(frame=>({time_code:frame.time,values:frame.values}));
   if(mode==='invalid')frames[1].time_code=-1;
   call.write({animation_data:{skel_animation:{blend_shape_weights:frames}}});
   call.write({status:{code:mode==='error'?3:0}});call.end();
  });
 }});
 const port=await new Promise((resolve,reject)=>server.bindAsync('127.0.0.1:0',grpc.ServerCredentials.createInsecure(),(error,port)=>error?reject(error):resolve(port)));
 const previous={target:process.env.BAIR1_A2F_TARGET,key:process.env.BAIR1_A2F_API_KEY};
 process.env.BAIR1_A2F_TARGET=`127.0.0.1:${port}`;process.env.BAIR1_A2F_API_KEY='fixture';
 // Test transport is loopback-only. Production adapter always selects TLS.
 const load=createLoader({'@grpc/grpc-js':{...grpc,credentials:{...grpc.credentials,createSsl:()=>grpc.credentials.createInsecure()}}});
 const {generateFaceAnimation,speechPcm}=load('src/lib/nvidia-face.ts');
 try{
  const wav=pcmToWav(Buffer.alloc(48000));const result=await generateFaceAnimation(wav);
  assert.equal(result.frames.length,31);assert.equal(header.audio_header.samples_per_second,24000);assert.equal(bytes,48000);assert.ok(endMarker);assert.equal(authorization,'Bearer fixture');
  mode='error';await assert.rejects(generateFaceAnimation(wav),/could not be verified/);
  mode='invalid';await assert.rejects(generateFaceAnimation(wav),/could not be verified/);
  assert.throws(()=>speechPcm(Buffer.from('not a WAV')));
  await assert.rejects(generateFaceAnimation(wav,AbortSignal.abort()),/cancelled/);
 }finally{server.forceShutdown();for(const [name,value] of [['BAIR1_A2F_TARGET',previous.target],['BAIR1_A2F_API_KEY',previous.key]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
test('missing or failed NVIDIA service preserves verified voice without an active claim',async()=>{
 let configured=false,failed=false;
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
 const {POST}=createLoader({
 '@/lib/auth':{requireAuth:async()=>({user:{userId:'fixture-user'}})},
 '@/lib/usage-budget':{usageGate:async()=>null},
 '@/lib/openai-speech':{MAX_SPEECH_CHARACTERS:1200,generateBearSpeech:async()=>({audio:Buffer.from('fixture'),transcript:'Fixture.'})},
 '@/lib/nvidia-face':{faceServiceConfigured:()=>configured,generateFaceAnimation:async()=>{if(failed)throw new Error('private-provider-error');return clip();}}
 })('src/app/api/voice/speak/route.ts');
 const request=()=>new Request('https://fixture.invalid/api/voice/speak',{method:'POST',body:JSON.stringify({text:'Fixture.'})});
 try{let result=await (await POST(request())).json();assert.equal(result.faceStatus,'not-configured');assert.equal(result.animation,null);assert.match(result.audio,/^data:audio/);
 configured=true;result=await (await POST(request())).json();assert.equal(result.faceStatus,'ready');
 failed=true;result=await (await POST(request())).json();assert.equal(result.faceStatus,'unavailable');assert.equal(result.animation,null);assert.ok(!JSON.stringify(result).includes('private-provider-error'));assert.match(result.audio,/^data:audio/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
