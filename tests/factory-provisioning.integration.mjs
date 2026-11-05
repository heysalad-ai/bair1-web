import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {readFileSync} from 'node:fs';
import {DynamoDBClient,CreateTableCommand,DeleteTableCommand,GetItemCommand,UpdateItemCommand} from '@aws-sdk/client-dynamodb';
import {createLoader} from './helpers/load-ts.mjs';
const client=new DynamoDBClient({endpoint:'http://127.0.0.1:18743',region:'local',credentials:{accessKeyId:'localtest',secretAccessKey:'localtest'}});
const load=createLoader({'./aws-dynamo':{dynamoClient:client}}), store=load('src/lib/factory-provisioning.ts'),devices=load('src/lib/devices.ts'),keys=load('src/lib/api-keys.ts'),db=load('src/lib/dynamo.ts');
const tables=[];
const user=()=>({userId:randomUUID(),orgId:`personal:${randomUUID()}`,role:'user',email:'',name:'Synthetic factory',createdAt:new Date().toISOString()});
const id=()=>`XIAO-${randomBytes(6).toString('hex').toUpperCase()}`;
before(async()=>{for(const {Properties:p} of Object.values(JSON.parse(readFileSync('infrastructure/staging-tables.review.json','utf8')).Resources)){const TableName=p.TableName['Fn::Sub'].replace('${TablePrefix}','bair1-');await client.send(new CreateTableCommand({TableName,BillingMode:p.BillingMode,KeySchema:p.KeySchema,AttributeDefinitions:p.AttributeDefinitions,...(p.GlobalSecondaryIndexes?{GlobalSecondaryIndexes:p.GlobalSecondaryIndexes}:{})}));tables.push(TableName);}});
after(async()=>{for(const TableName of tables.reverse())await client.send(new DeleteTableCommand({TableName}));client.destroy();});
test('signup is insufficient; a time-limited factory grant is required',async()=>{
 const a=user();await assert.rejects(store.enrollFactoryUnit(a,id()),e=>e.status===403);
 const g=await store.createFactoryGrant(a.userId,2);assert.ok(g.expiresAt>Date.now()/1000+6.99*86400);await assert.rejects(store.createFactoryGrant(a.userId));
 await client.send(new UpdateItemCommand({TableName:'bair1-access',Key:{scope:{S:`factory:${a.userId}`},entry:{S:'grant'}},UpdateExpression:'SET expiresAt = :e',ExpressionAttributeValues:{':e':{N:'1'}}}));
 await assert.rejects(store.enrollFactoryUnit(a,id()),e=>e.status===403);
});
test('concurrent retries consume one slot, quota is atomic, IDs remain private',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId,1);
 const values=await Promise.all([store.enrollFactoryUnit(a,board),store.enrollFactoryUnit(a,board)]);
 assert.equal(values[0].ownershipVersion,values[1].ownershipVersion);assert.equal((await store.getFactoryGrant(a.userId)).remaining,0);
 assert.equal((await devices.getDevice(board)).visibility,'private');await assert.rejects(store.enrollFactoryUnit(a,id()));
 assert.equal((await store.listFactoryUnits(a)).units.length,1);
});
test('factory grant never takes another owner or an unrelated pending enrollment',async()=>{
 const a=user(),b=user(),board=id(),pending=id();await store.createFactoryGrant(a.userId);await store.createFactoryGrant(b.userId);
 await store.enrollFactoryUnit(a,board);await assert.rejects(store.enrollFactoryUnit(b,board));await assert.rejects(store.configureFactoryUnit(b,board));
 await load('src/lib/device-enrollment.ts').provisionEnrollment(pending,'Synthetic pending');await assert.rejects(store.enrollFactoryUnit(a,pending));
 assert.equal((await store.getFactoryGrant(b.userId)).remaining,25);assert.equal((await devices.getDevice(board)).ownerId,a.userId);
});
test('approved pending board can be adopted once without retaining its enrollment proof',async()=>{
 const a=user(),board=id(),g=await store.createFactoryGrant(a.userId);
 await load('src/lib/device-enrollment.ts').provisionEnrollment(board,'Synthetic pending');
 await client.send(new UpdateItemCommand({TableName:'bair1-devices',Key:{deviceId:{S:board}},UpdateExpression:'SET factoryBatch = :b',ExpressionAttributeValues:{':b':{S:g.batchId}}}));
 await store.enrollFactoryUnit(a,board);
 const {Item}=await client.send(new GetItemCommand({TableName:'bair1-devices',Key:{deviceId:{S:board}},ConsistentRead:true}));assert.ok(!Item.enrollmentHash&&!Item.enrollmentExpiresAt);
});
test('keys are hash-only, upload-only, device-bound; retry revokes only previous factory key',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId);await store.enrollFactoryUnit(a,board);
 const unrelated=await keys.createApiKey({name:'Synthetic independent key',userId:a.userId,orgId:a.orgId,deviceId:board,scopes:['read:readings']});
 const first=await store.configureFactoryUnit(a,board),u=await store.factoryUnit(a,board);
 const {Item}=await client.send(new GetItemCommand({TableName:'bair1-api-keys',Key:{id:{S:u.keyId}},ConsistentRead:true}));assert.ok(!JSON.stringify(Item).includes(first.key));assert.deepEqual(JSON.parse(Item.scopes.S),['write:readings']);assert.equal(Item.deviceId.S,board);
 assert.deepEqual((await keys.validateApiKey(first.key,['write:readings'])).scopes,['write:readings']);assert.equal(await keys.validateApiKey(first.key,['read:readings']),null);
 const second=await store.configureFactoryUnit(a,board);assert.notEqual(second.sessionId,first.sessionId);assert.equal(await keys.validateApiKey(first.key,['write:readings']),null);assert.ok(await keys.validateApiKey(second.key,['write:readings']));assert.ok(await keys.validateApiKey(unrelated.key,['read:readings']));
});
test('fresh receipt is session-bound; stale, cross-unit and invalid readings cannot pass',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId);const u=await store.enrollFactoryUnit(a,board);const c=await store.configureFactoryUnit(a,board),unit=await store.factoryUnit(a,board);
 const raw={factorySessionId:c.sessionId,bootSession:randomBytes(16).toString('hex').toUpperCase(),bmeValid:true,adcD3Raw:1200,adcD2Raw:1500,temperature:21,humidity:50,pressure:1000,firmwareVersion:'bair1-xiao-bme-adc-1.1.0'};
 await db.storeReading({deviceId:board,ownershipVersion:u.ownershipVersion,tenantId:a.orgId,aqi:null,firmwareVersion:raw.firmwareVersion,rawPayload:raw,capturedAt:new Date().toISOString(),eventId:randomUUID()});
 const reading=await db.getLatestReading(board);const result=store.factoryReceipt(unit,reading);assert.ok(result?.sensorsValid);assert.equal(result.bootSession,raw.bootSession);
 assert.equal(store.factoryReceipt(unit,{...reading,factorySessionId:randomUUID()}),null);assert.equal(store.factoryReceipt(unit,{...reading,receivedAt:'2000-01-01T00:00:00Z'}),null);assert.equal(store.factoryReceipt(unit,{...reading,deviceId:id()}),null);assert.equal(store.factoryReceipt(unit,{...reading,humidity:null}).sensorsValid,false);assert.equal(store.factoryReceipt(unit,{...reading,bmeValid:false}).sensorsValid,false);
});
test('ownership changes block configuration and listing instead of reusing former credentials',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId);await store.enrollFactoryUnit(a,board);
 await client.send(new UpdateItemCommand({TableName:'bair1-devices',Key:{deviceId:{S:board}},UpdateExpression:'SET ownerId = :o',ExpressionAttributeValues:{':o':{S:randomUUID()}}}));
 await assert.rejects(store.configureFactoryUnit(a,board));await assert.rejects(store.listFactoryUnits(a));
});
test('two different boards racing for the final slot cannot partially enroll both',async()=>{
 const a=user();await store.createFactoryGrant(a.userId,1);const boards=[id(),id()];
 const result=await Promise.allSettled(boards.map(board=>store.enrollFactoryUnit(a,board)));assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.listFactoryUnits(a)).units.length,1);assert.equal((await store.getFactoryGrant(a.userId)).remaining,0);
 const records=await Promise.all(boards.map(board=>devices.getDevice(board)));assert.equal(records.filter(Boolean).length,1);
});
test('simultaneous configuration requests do not leave two fresh upload keys',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId);await store.enrollFactoryUnit(a,board);
 const result=await Promise.allSettled([store.configureFactoryUnit(a,board),store.configureFactoryUnit(a,board)]);
 const issued=result.filter(r=>r.status==='fulfilled');assert.ok(issued.length>=1);
 const active=await Promise.all(issued.map(r=>keys.validateApiKey(r.value.key,['write:readings'])));assert.equal(active.filter(Boolean).length,1);
});

test('SPS30 profile is immutable, consumes one slot, rejects another profile and another owner',async()=>{
 const a=user(),b=user(),board=id();await store.createFactoryGrant(a.userId);await store.createFactoryGrant(b.userId);
 const unit=await store.enrollFactoryUnit(a,board,'sps30-i2c');assert.equal(unit.profile,'sps30-i2c');
 await assert.rejects(store.enrollFactoryUnit(a,board));await assert.rejects(store.configureFactoryUnit(a,board));
 await assert.rejects(store.enrollFactoryUnit(b,board,'sps30-i2c'));await assert.rejects(store.configureFactoryUnit(b,board,'sps30-i2c'));
 assert.equal((await store.getFactoryGrant(a.userId)).remaining,24);
 await assert.rejects(store.enrollFactoryUnit(a,id(),'uart'));assert.equal((await store.getFactoryGrant(a.userId)).remaining,24);
});
test('actual stored SPS30 receipt preserves zero and rejects stale, warming, bad-status and missing frames',async()=>{
 const a=user(),board=id();await store.createFactoryGrant(a.userId);const u=await store.enrollFactoryUnit(a,board,'sps30-i2c');
 const c=await store.configureFactoryUnit(a,board,'sps30-i2c'),unit=await store.factoryUnit(a,board);
 const raw={factorySessionId:c.sessionId,bootSession:randomBytes(16).toString('hex').toUpperCase(),sps30Valid:true,sensorModel:'SPS30',sensorProfile:'sps30-i2c',sensorAgeMs:30,sensorUptimeMs:35000,sensorStatus:0,pm1:0,pm25:0,pm4:0,pm10:0,firmwareVersion:'bair1-xiao-sps30-1.0.0'};
 await db.storeReading({deviceId:board,ownershipVersion:u.ownershipVersion,tenantId:a.orgId,aqi:null,firmwareVersion:raw.firmwareVersion,rawPayload:raw,capturedAt:new Date().toISOString(),eventId:randomUUID()});
 const reading=await db.getLatestReading(board);assert.equal(store.factoryReceipt(unit,reading).sensorsValid,true);
 for(const patch of [{pm25:null},{pm1:NaN},{pm10:1001},{pm4:-1},{sps30Valid:false},{sensorAgeMs:3000},{sensorUptimeMs:29999},{sensorStatus:1},{sensorModel:'BME280'},{sensorProfile:'bme280-adc'},{firmwareVersion:'bair1-xiao-bme-adc-1.1.0'},{capturedAt:'2000-01-01T00:00:00Z'},{receivedAt:'2000-01-01T00:00:00Z'}]){
  assert.notEqual(store.factoryReceipt(unit,{...reading,...patch})?.sensorsValid,true);
 }
 const newer=await store.configureFactoryUnit(a,board,'sps30-i2c');assert.notEqual(c.sessionId,newer.sessionId);assert.equal(store.factoryReceipt(await store.factoryUnit(a,board),reading),null);
});

test('compiled SPS30 payload uploads through the actual POST handler after factory enrollment',async()=>{
 const payload=JSON.parse(readFileSync('/tmp/bair1-sps30-firmware-payload.json','utf8'));
 const a=user(),board=payload.deviceId;await store.createFactoryGrant(a.userId);
 await store.enrollFactoryUnit(a,board,'sps30-i2c');const c=await store.configureFactoryUnit(a,board,'sps30-i2c');
 payload.factorySessionId=c.sessionId;payload.capturedAt=Math.floor(Date.now()/1000);
 const route=load('src/app/api/readings/route.ts');
 const request=()=>new NextRequest('https://synthetic.invalid/api/readings',{method:'POST',headers:{Authorization:'Bearer '+c.key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const first=await route.POST(request());assert.equal(first.status,200);assert.equal((await first.json()).stored,true);
 const duplicate=await route.POST(request());assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).outcome,'duplicate');
 const receipt=store.factoryReceipt(await store.factoryUnit(a,board),await db.getLatestReading(board));assert.equal(receipt.sensorsValid,true);assert.equal(receipt.pm25,0);
 payload.deviceId=id();assert.equal((await route.POST(request())).status,404);
});
