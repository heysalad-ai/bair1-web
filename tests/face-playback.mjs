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
