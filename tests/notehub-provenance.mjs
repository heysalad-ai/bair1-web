import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLoader} from './helpers/load-ts.mjs';
const {normalizeNotehubEvent}=createLoader()('src/lib/notehub.ts');
test('Notehub rejects invented numeric conversions and distinguishes gateway capture from receipt',()=>{
 const base={device:randomUUID(),event:randomUUID(),received:Math.floor(Date.now()/1000)-3600,body:{temperature:true,humidity:[],pressure:101000}},options={idSalt:randomUUID()};
 const unknown=normalizeNotehubEvent(base,options);assert.equal(unknown.captureKnown,false);assert.equal(unknown.sanitizedPayload.capturedAt,null);assert.equal(unknown.temperature,null);assert.equal(unknown.humidity,null);assert.equal(unknown.pressure,null);assert.equal(unknown.eventId,base.event);
 assert.ok(Date.parse(unknown.receivedAt)>base.received*1000);
 const known=normalizeNotehubEvent({...base,when:base.received,body:{temperature:21,pressure:101000,pressureUnit:'Pa'}},options);
 assert.equal(known.captureKnown,true);assert.equal(known.pressure,1010);assert.equal(known.pressureUnit,'hPa');
});
