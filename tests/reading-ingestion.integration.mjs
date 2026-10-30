import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { NextRequest } from 'next/server.js';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { createLoader } from './helpers/load-ts.mjs';

// This suite cannot target AWS: endpoint and credentials are hardcoded local fixtures.
const client = new DynamoDBClient({endpoint:'http://127.0.0.1:18743',region:'local',credentials:{accessKeyId:'localtest',secretAccessKey:'localtest'}});
const load = createLoader({'./aws-dynamo':{dynamoClient:client}});
const db=load('src/lib/dynamo.ts');
const route=load('src/app/api/readings/route.ts');
const readRoute=load('src/app/api/v1/devices/[deviceId]/readings/route.ts');
const notehubRoute=load('src/app/api/integrations/notehub/route.ts');
const keys=load('src/lib/api-keys.ts');
const devices=load('src/lib/devices.ts');
let server, origin, key, otherKey, readOnlyKey;
const owner=randomUUID();
const tables=[['bair1-readings','deviceId','timestamp'],['bair1-reading-events','deviceId','eventId'],['bair1-devices','deviceId'],['bair1-api-keys','id'],['bair1-commands','deviceId','commandId']];
let discardReply=false;
const created=[];
before(async()=>{
 delete process.env.SENSOR_API_KEY;
 for(const [TableName,pk,sk] of tables){
  const input={TableName,BillingMode:'PAY_PER_REQUEST',KeySchema:[{AttributeName:pk,KeyType:'HASH'},...(sk?[{AttributeName:sk,KeyType:'RANGE'}]:[])],AttributeDefinitions:[{AttributeName:pk,AttributeType:'S'},...(sk?[{AttributeName:sk,AttributeType:'S'}]:[])]};
  if(TableName==='bair1-api-keys'){
   input.AttributeDefinitions.push({AttributeName:'keyHash',AttributeType:'S'});
   input.GlobalSecondaryIndexes=[{IndexName:'keyHash-index',KeySchema:[{AttributeName:'keyHash',KeyType:'HASH'}],Projection:{ProjectionType:'ALL'}}];
  }
  await client.send(new CreateTableCommand(input));created.push(TableName);
 }
 key=(await keys.createApiKey({name:'local test',userId:owner,orgId:'local',scopes:['read:readings','write:readings']})).key;
 otherKey=(await keys.createApiKey({name:'local other',userId:randomUUID(),orgId:'local',scopes:['write:readings']})).key;
 readOnlyKey=(await keys.createApiKey({name:'local readonly',userId:owner,orgId:'local',scopes:['read:readings']})).key;
 server=createServer(async(req,res)=>{
  try {
   const chunks=[]; for await(const chunk of req) chunks.push(chunk);
   const request=new NextRequest(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   let response;
   if(req.method==='POST'&&req.url==='/api/readings') response=await route.POST(request);
   else if(req.method==='POST'&&req.url==='/api/integrations/notehub') response=await notehubRoute.POST(request);
   else {const deviceId=new URL(request.url).pathname.split('/')[4];response=await readRoute.GET(request,{params:Promise.resolve({deviceId})});}
   if(discardReply){discardReply=false;res.destroy();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500);res.end('test handler failed');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 for(const TableName of created.reverse())await client.send(new DeleteTableCommand({TableName}));
 client.destroy();
});
function sample(deviceId,sequence,time=Date.now()-60000,extra={}){return {deviceId,eventId:`${deviceId}:${sequence}`,bootSession:'local-boot',sequence,sample:sequence,capturedAt:new Date(time).toISOString(),temperature:21.5,humidity:55,pressure:1010,altitudeMeters:27,adcD3Raw:2000,adcD2Raw:1000,adcD3PinVoltage:1.5,adcD2PinVoltage:0.75,adcD3InputVoltage:3,adcD2InputVoltage:1.5,aqi:null,...extra};}
async function post(payload,apiKey=key){const res=await fetch(origin+'/api/readings',{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{Authorization:'Bearer '+apiKey}:{})},body:JSON.stringify(payload)});return {status:res.status,body:await res.json()};}
async function rawRows(deviceId){
 const items=[];let cursor;
 do {const result=await client.send(new QueryCommand({TableName:'bair1-readings',KeyConditionExpression:'deviceId = :d',ExpressionAttributeValues:{':d':{S:deviceId}},ConsistentRead:true,ExclusiveStartKey:cursor}));items.push(...(result.Items??[]));cursor=result.LastEvaluatedKey;}while(cursor);
 return items;
}

test('600 two-second samples survive out-of-order backlog and read-back with every original field',async()=>{
 const deviceId=randomUUID(), start=Date.now()-2*86400000;
 const samples=Array.from({length:600},(_,i)=>sample(deviceId,i,start+i*2000,{padding:'x'.repeat(1800)}));
 // Latest first, then the full backlog. No recent-reading filter may discard older samples.
 for(const s of [...samples].reverse()){const r=await post(s);assert.equal(r.status,200);assert.equal(r.body.outcome,'stored');assert.equal(r.body.capturedAt,s.capturedAt);}
 const rows=await db.getReadingsInRange(deviceId,samples[0].capturedAt,samples.at(-1).capturedAt);
 assert.equal(rows.length,600);
 for(let i=0;i<600;i++)for(const field of ['temperature','humidity','pressure','altitudeMeters','adcD3Raw','adcD2Raw','adcD3PinVoltage','adcD2PinVoltage','adcD3InputVoltage','adcD2InputVoltage','sample','aqi'])assert.equal(rows[i][field],samples[i][field],`${i}:${field}`);
 assert.equal(rows[0].timestamp,samples[0].capturedAt);assert.equal(rows.at(-1).timestamp,samples.at(-1).capturedAt);
 const response=await fetch(`${origin}/api/v1/devices/${deviceId}/readings?limit=1000`,{headers:{Authorization:'Bearer '+key}});
 assert.equal(response.status,200);assert.equal((await response.json()).data.length,600);
 const stored=await rawRows(deviceId);assert.equal(stored.length,600);
 const raw=stored[0];assert.deepEqual(JSON.parse(raw.rawPayload.S),samples[0]);
 assert.ok(Number(raw.expiresAt.N)>Math.floor(Date.now()/1000)+13*86400,'backlog retention starts at receipt');
 assert.equal((await db.getLatestReading(deviceId)).sample,599);
});

test('same instant distinct events, multiple devices, reboot sequence and inclusive range boundaries',async()=>{
 const d=randomUUID(), other=randomUUID(), t=Date.now()-60000;
 for(const s of [sample(d,1,t),sample(d,2,t),sample(other,1,t)])assert.equal((await post(s)).body.outcome,'stored');
 assert.equal((await db.getReadingsInRange(d,new Date(t).toISOString(),new Date(t).toISOString())).length,2);
 assert.equal((await db.getReadings(other)).length,1);
 const withoutExplicit=sample(d,1,t+2000);delete withoutExplicit.eventId;
 await post(withoutExplicit);await post({...withoutExplicit,bootSession:'new-boot'});
 assert.equal((await db.getReadings(d)).length,4);
});

test('sequential/concurrent retry and lost HTTP acknowledgement store exactly once',async()=>{
 const d=randomUUID(), payload=sample(d,1);
 const results=await Promise.all(Array.from({length:12},()=>post(payload)));
 assert.ok(results.every(r=>r.status===200),JSON.stringify(results.map(r=>r.status)));
 assert.equal(results.filter(r=>r.body.outcome==='stored').length,1);
 assert.equal(results.filter(r=>r.body.outcome==='duplicate').length,11);
 const accepted=results.find(r=>r.body.outcome==='stored').body;
 assert.ok(results.every(r=>r.body.receivedAt===accepted.receivedAt));
 assert.equal((await rawRows(d)).length,1);
 discardReply=true;await assert.rejects(post(sample(d,2)));
 // Retry the identical payload, including capture time, after losing the response.
 const second=sample(d,3);discardReply=true;await assert.rejects(post(second));
 assert.equal((await post(second)).body.outcome,'duplicate');
 assert.equal((await rawRows(d)).length,3);
});

test('event identity reuse with changed measurements conflicts; transient retry counters do not',async()=>{
 const d=randomUUID(), payload=sample(d,1);
 await post(payload);
 assert.equal((await post({...payload,temperature:99})).status,409);
 assert.equal((await post({...payload,capturedAt:new Date(Date.now()).toISOString()})).status,409);
 assert.equal((await post({...payload,rssi:-60,droppedSamples:4})).body.outcome,'duplicate');
 assert.equal((await rawRows(d)).length,1);
 assert.equal(JSON.parse((await rawRows(d))[0].rawPayload.S).temperature,21.5);
});

test('unknown clock is explicit, stable identity still deduplicates, legacy and epoch inputs work',async()=>{
 const d=randomUUID(), payload=sample(d,1,0,{capturedAt:null});
 const r=await post(payload);assert.equal(r.body.clockQuality,'unknown');assert.equal(r.body.capturedAt,null);
 assert.equal((await post(payload)).body.outcome,'duplicate');
 const noTime=sample(d,2,0,{capturedAt:'not-a-time'});assert.equal((await post(noTime)).body.clockQuality,'unknown');
 const epoch=Math.floor((Date.now()-60000)/1000);const timed=sample(d,3,0,{capturedAt:epoch});assert.equal((await post(timed)).body.capturedAt,new Date(epoch*1000).toISOString());
 const legacyTime=new Date(Date.now()-3600000).toISOString();
 await client.send(new PutItemCommand({TableName:'bair1-readings',Item:{deviceId:{S:d},timestamp:{S:legacyTime},rawPayload:{S:'{"temperature":20}'}}}));
 const rows=await db.getReadingsInRange(d,legacyTime,legacyTime);assert.equal(rows.length,1);assert.equal(rows[0].clockQuality,'unknown');assert.equal(rows[0].timestamp,legacyTime);
});

test('auth, ownership, shape, size and finite-value failures do not persist readings',async()=>{
 const d=randomUUID(), payload=sample(d,1);await post(payload);
 assert.equal((await post(sample(d,2),null)).status,401);
 assert.equal((await post(sample(d,2),randomUUID())).status,401);
 assert.equal((await post(sample(d,2),readOnlyKey)).status,401);
 assert.equal((await post(sample(d,2),otherKey)).status,404);
 for(const value of [null,[],42,{...payload,deviceId:''},{...payload,eventId:{}},{...payload,adcD3Raw:'Infinity'}])assert.equal((await post(value)).status,400);
 assert.equal((await post({...payload,padding:'x'.repeat(17000)})).status,413);
 const malformed=await fetch(origin+'/api/readings',{method:'POST',headers:{Authorization:'Bearer '+key},body:'{'});assert.equal(malformed.status,400);
 const infinity=await fetch(origin+'/api/readings',{method:'POST',headers:{Authorization:'Bearer '+key},body:JSON.stringify(payload).replace('21.5','1e400')});assert.equal(infinity.status,400);
 assert.equal((await rawRows(d)).length,1);
});

test('missing event table fails closed, never acknowledges or leaves a partial reading',async()=>{
 const d=randomUUID();await client.send(new DeleteTableCommand({TableName:'bair1-reading-events'}));
 const r=await post(sample(d,1));assert.equal(r.status,503);assert.equal(r.body.stored,false);assert.equal((await rawRows(d)).length,0);
 await client.send(new CreateTableCommand({TableName:'bair1-reading-events',BillingMode:'PAY_PER_REQUEST',KeySchema:[{AttributeName:'deviceId',KeyType:'HASH'},{AttributeName:'eventId',KeyType:'RANGE'}],AttributeDefinitions:[{AttributeName:'deviceId',AttributeType:'S'},{AttributeName:'eventId',AttributeType:'S'}]}));
});

test('actual native firmware payload round-trips and captures real replies for acknowledgement check',async()=>{
 if(!process.env.BAIR1_FIRMWARE_FIXTURE) throw new Error('Generate the native firmware fixture first');
 const payload=JSON.parse(readFileSync(process.env.BAIR1_FIRMWARE_FIXTURE,'utf8'));
 payload.deviceId=randomUUID(); // identifiers in fixtures are synthetic and generated at runtime
 const stored=await post(payload), duplicate=await post(payload), conflict=await post({...payload,temperature:payload.temperature+1});
 assert.equal(stored.body.outcome,'stored');assert.equal(duplicate.body.outcome,'duplicate');assert.equal(conflict.status,409);
 const rows=await rawRows(payload.deviceId);assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].rawPayload.S),payload);
 writeFileSync('/tmp/bair1-firmware-replies.jsonl',[stored,duplicate,conflict].map(x=>JSON.stringify(x)).join('\n'));
});

test('concurrent auto-registration by different owners never mixes readings or replaces ownership',async()=>{
 const d=randomUUID(),p=sample(d,1);
 const result=await Promise.all([post(p,key),post(sample(d,2),otherKey)]);
 assert.deepEqual(result.map(r=>r.status).sort(),[200,404]);
 const winner=await devices.getDevice(d);
 const rows=await rawRows(d);assert.equal(rows.length,1);
 assert.equal(Number(rows[0].sample.N),winner.ownerId===owner?1:2);
});


test('Notehub air-reading response remains boolean and retries deduplicate',async()=>{
 process.env.NOTEHUB_ROUTE_SECRET=randomUUID();process.env.NOTEHUB_DEVICE_ID_SALT=randomUUID();
 const payload={device:randomUUID(),when:Math.floor(Date.now()/1000)-60,received:Math.floor(Date.now()/1000),file:'air.qo',body:{pm25:12,temperature:21}};
 const send=async()=>{const r=await fetch(origin+'/api/integrations/notehub',{method:'POST',headers:{Authorization:'Bearer '+process.env.NOTEHUB_ROUTE_SECRET,'Content-Type':'application/json'},body:JSON.stringify(payload)});assert.equal(r.status,200);return r.json();};
 const first=await send(),retry=await send();assert.equal(first.readingStored,true);assert.equal(retry.readingStored,false);assert.equal(retry.readingOutcome,'duplicate');assert.equal((await rawRows(first.deviceId)).length,1);
 delete process.env.NOTEHUB_ROUTE_SECRET;delete process.env.NOTEHUB_DEVICE_ID_SALT;
});


test('compatible pause rollback preserves history and receipts, then resumes duplicate-safe ingestion',async()=>{
 const d=randomUUID(),payload=sample(d,1);await post(payload);
 const legacyTime=new Date(Date.now()-3600000).toISOString();
 await client.send(new PutItemCommand({TableName:'bair1-readings',Item:{deviceId:{S:d},timestamp:{S:legacyTime},rawPayload:{S:'{"temperature":20}'}}}));
 process.env.BAIR1_INGESTION_MODE='paused';
 try {
  const reject=await post(sample(d,2));assert.equal(reject.status,503);assert.equal(reject.body.stored,false);
  const notehub=await fetch(origin+'/api/integrations/notehub',{method:'POST',body:'{}'});assert.equal(notehub.status,503);
  const history=await fetch(`${origin}/api/v1/devices/${d}/readings`,{headers:{Authorization:'Bearer '+key}});assert.equal(history.status,200);const data=(await history.json()).data;assert.equal(data.length,2);assert.ok(data.every(r=>!Number.isNaN(Date.parse(r.timestamp))));
  assert.equal((await rawRows(d)).length,2);
 }finally{delete process.env.BAIR1_INGESTION_MODE;}
 assert.equal((await post(payload)).body.outcome,'duplicate');assert.equal((await post(sample(d,2))).body.outcome,'stored');
});
