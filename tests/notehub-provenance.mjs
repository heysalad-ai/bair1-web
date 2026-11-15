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

function sensorEvent() {
 const deviceId='XIAO-'+randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
 const bootSession=randomUUID().replaceAll('-','').toUpperCase(),sequence=17;
 const capturedAt=Math.floor(Date.now()/1000)-90;
 return {device:randomUUID(),event:randomUUID(),when:capturedAt+65,body:{deviceId,bootSession,sequence,uptimeMs:120000,eventId:`${deviceId}:${bootSession}:${sequence}`,capturedAt,pm1:1,pm25:2,pm4:3,pm10:4,sps30:{valid:true,pm1:1,pm25:2,pm4:3,pm10:4,nc05:10,nc1:20,nc25:30,nc4:40,nc10:50,typicalParticleSize:0.5,numberConcentrationUnits:'#/cm3'}}};
}
test('host sensor capture time and origin survive delayed Notehub queuing without changing cloud ownership identity',()=>{
 const input=sensorEvent(),options={idSalt:randomUUID()};
 const out=normalizeNotehubEvent(input,options);
 assert.equal(out.capturedAt,new Date(input.body.capturedAt*1000).toISOString());
 assert.equal(out.capturedAtSource,'device');
 assert.equal(out.sanitizedPayload.sourceSample.deviceId,input.body.deviceId);
 assert.equal(out.sanitizedPayload.sourceSample.eventId,input.body.eventId);
 assert.equal(out.sanitizedPayload.sourceSample.sequence,input.body.sequence);
 assert.notEqual(out.publicDeviceId,input.body.deviceId);
 assert.equal(out.eventId,input.body.eventId);
 assert.deepEqual(out.sanitizedPayload.sps30,{valid:true,pm1:1,pm25:2,pm4:3,pm10:4,nc05:10,nc1:20,nc25:30,nc4:40,nc10:50,typicalParticleSize:0.5,numberConcentrationUnits:'#/cm3',massConcentrationUnits:'µg/m3',typicalParticleSizeUnits:'µm'});
});
test('invalid or future source capture times fall back to gateway time',()=>{
 for(const value of [true,{},Math.floor(Date.now()/1000)+3600,'not-a-time']) {
  const input=sensorEvent();input.body.capturedAt=value;
  const out=normalizeNotehubEvent(input,{idSalt:randomUUID()});
  assert.equal(out.capturedAt,new Date(input.when*1000).toISOString());
  assert.equal(out.capturedAtSource,'gateway');
 }
});
test('unverified origin tuples and malformed particle values are omitted from retained provenance',()=>{
 const input=sensorEvent();input.body.eventId=randomUUID();input.body.sps30.nc1=true;
 input.body.imei=randomUUID();input.body.iccid=randomUUID();input.body.sps30.secret=randomUUID();
 const out=normalizeNotehubEvent(input,{idSalt:randomUUID()});
 assert.equal(out.sanitizedPayload.sourceSample,undefined);
 assert.equal(out.sanitizedPayload.sps30,undefined);
 assert.equal(out.sanitizedPayload.imei,undefined);
 assert.equal(out.sanitizedPayload.iccid,undefined);
 assert.equal(out.capturedAt,new Date(input.when*1000).toISOString());
});
test('lost host acknowledgement uses stable sample identity across distinct Notehub events and gateway enrichment',()=>{
 const input=sensorEvent(),options={idSalt:randomUUID()};
 const a=normalizeNotehubEvent(input,options);
 const b=normalizeNotehubEvent({...input,event:randomUUID(),when:input.when+10,best_lat:1,best_lon:2,transport:'cell'},options);
 assert.equal(a.eventId,input.body.eventId);
 assert.equal(b.eventId,a.eventId);
 assert.deepEqual(b.identityPayload,a.identityPayload);
 assert.notDeepEqual(b.sanitizedPayload,a.sanitizedPayload);
 const changed=normalizeNotehubEvent({...input,body:{...input.body,pm25:99}},options);
 assert.notDeepEqual(changed.identityPayload,a.identityPayload);
 const other=normalizeNotehubEvent({...input,device:randomUUID()},options);
 assert.notEqual(other.publicDeviceId,a.publicDeviceId);
});
