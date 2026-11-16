import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
const clip=()=>({source:'nvidia-audio2face',duration:1,frames:Array.from({length:31},(_,i)=>({time:i/30,values:[i/30,0,0,0,0,0,0]}))});
test('media-clock frames are cancelled and stale frames cannot wake the bear',async()=>{
 const {SpeechPlayback}=createLoader()('src/lib/speech-playback.ts');const states=[];const callbacks=new Map();let next=0;
 const previous={request:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
 globalThis.requestAnimationFrame=callback=>{callbacks.set(++next,callback);return next;};globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
 const audio={currentTime:.5,play:async()=>{},pause(){},removeAttribute(){},load(){}};
 const player=new SpeechPlayback(async()=>Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ==',animation:clip(),faceStatus:'ready'}),state=>states.push(state),()=>audio);
 try{await player.speak('Fixture.');assert.equal(states.at(-1).face.jaw,.5);const callback=[...callbacks.values()][0];player.stop();assert.equal(callbacks.size,0);callback();assert.equal(states.at(-1).face,undefined);assert.equal(states.at(-1).speaking,false);}finally{player.stop();globalThis.requestAnimationFrame=previous.request;globalThis.cancelAnimationFrame=previous.cancel;}
});

test('reduced motion skips the face request and ignores unsolicited motion',async()=>{
 const {SpeechPlayback}=createLoader()('src/lib/speech-playback.ts');const states=[];
 const audio={currentTime:.5,play:async()=>{},pause(){},removeAttribute(){},load(){}};
 const player=new SpeechPlayback(async(_,init)=>{assert.equal(JSON.parse(init.body).animate,false);return Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ==',animation:clip(),faceStatus:'ready'});},state=>states.push(state),()=>audio,false);
 await player.speak('Fixture.');assert.equal(states.at(-1).speaking,true);assert.equal(states.at(-1).face,undefined);assert.equal(states.at(-1).faceStatus,'disabled');player.stop();
});
test('malformed face output keeps the voice and never claims active NVIDIA motion',async()=>{
 const {SpeechPlayback}=createLoader()('src/lib/speech-playback.ts');const states=[];
 const player=new SpeechPlayback(async()=>Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ==',animation:{...clip(),source:'invalid'},faceStatus:'ready'}),state=>states.push(state),()=>({currentTime:0,play:async()=>{},pause(){},removeAttribute(){},load(){}}));
 await player.speak('Fixture.');assert.equal(states.at(-1).speaking,true);assert.equal(states.at(-1).faceStatus,'unavailable');assert.equal(states.at(-1).face,undefined);player.stop();
});

test('a browser gesture resumes the exact prepared snapshot without another request',async()=>{
 const {SpeechPlayback}=createLoader()('src/lib/speech-playback.ts');
 const {spokenSnapshot}=createLoader()('src/lib/spoken-summary.ts');
 const captured=spokenSnapshot('Temperature is 21.5 degrees Celsius. Capture time is unknown.');
 const states=[],requests=[];let plays=0,audios=0;
 const audio={currentTime:0,play:async()=>{if(++plays===1){const error=new Error('Gesture required');error.name='NotAllowedError';throw error;}},pause(){},removeAttribute(){},load(){}};
 const player=new SpeechPlayback(async(_,init)=>{requests.push(JSON.parse(init.body));return Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ=='});},state=>states.push(state),()=>{audios++;return audio;});
 await player.speak(captured.text);assert.equal(states.at(-1).ready,true);assert.equal(states.at(-1).error,'');
 const updated=spokenSnapshot('Temperature is 22.5 degrees Celsius. Capture time is unknown.');assert.notEqual(captured.source,updated.source);
 await player.speak(captured.text);assert.equal(requests.length,1);assert.equal(audios,1);assert.equal(plays,2);assert.equal(states.at(-1).speaking,true);assert.notEqual(states.at(-1).ready,true);
 assert.match(requests[0].text,/21\.5/);assert.doesNotMatch(requests[0].text,/22\.5/);assert.match(requests[0].text,/Capture time is unknown/);player.stop();
});
test('stopping a prepared clip discards it before another context can play',async()=>{
 const {SpeechPlayback}=createLoader()('src/lib/speech-playback.ts');let requests=0,plays=0;const states=[],audios=[];
 const player=new SpeechPlayback(async()=>{requests++;return Response.json({audio:'data:audio/wav;base64,Zml4dHVyZQ=='});},state=>states.push(state),()=>{const audio={paused:false,currentTime:0,play:async()=>{if(++plays===1){const error=new Error();error.name='NotAllowedError';throw error;}},pause(){this.paused=true;},removeAttribute(){},load(){}};audios.push(audio);return audio;});
 await player.speak('First snapshot.');player.stop();assert.notEqual(states.at(-1).ready,true);
 await player.speak('Another snapshot.');assert.equal(requests,2);assert.equal(audios[0].paused,true);assert.equal(states.at(-1).speaking,true);player.stop();
});
