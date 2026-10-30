import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DynamoDBClient,QueryCommand,PutItemCommand} from '@aws-sdk/client-dynamodb';
import {createLoader} from '../tests/helpers/load-ts.mjs';
const runtime=JSON.parse(readFileSync('/tmp/bair1-stage-runtime.json','utf8'));
assert.equal(runtime.prefix,'bair1-staging-20261030-');
process.env.BAIR1_TABLE_PREFIX=runtime.prefix;
const client=new DynamoDBClient({region:runtime.region,credentials:{accessKeyId:runtime.accessKeyId,secretAccessKey:runtime.secretAccessKey}});
const load=createLoader({'./aws-dynamo':{dynamoClient:client}}),keys=load('src/lib/api-keys.ts');
const base=readFileSync('/tmp/bair1-stage-candidate-url.txt','utf8').trim();
assert.match(base,/^https:\/\/bair1-ingestion-staging-[a-z0-9]+-hey-salad-inc\.vercel\.app$/);
const bypass=JSON.parse(readFileSync('/tmp/bair1-stage-bypass.json','utf8')).generate.secret;
const device=randomUUID(),owner=randomUUID(),template=JSON.parse(readFileSync('/tmp/bair1-firmware-payload.json','utf8'));
const key=(await keys.createApiKey({name:'Staging validation',userId:owner,orgId:'staging',scopes:['read:readings','write:readings']})).key;
const other=(await keys.createApiKey({name:'Staging other owner',userId:randomUUID(),orgId:'staging',scopes:['write:readings']})).key;
const headers={'Content-Type':'application/json','x-vercel-protection-bypass':bypass};
async function request(path,body,token=key,url=base){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{...headers,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
function sample(i,time){return {...template,deviceId:device,bootSession:'staging-'+owner,eventId:owner+':'+i,sequence:i,sample:i,capturedAt:new Date(time).toISOString(),padding:'x'.repeat(1800)};}
const start=Date.now()-2*86400000,samples=Array.from({length:600},(_,i)=>sample(i,start+i*2000));
// Establish registration first; GSI lookup must work against the actual hosted environment.
const first=await request('/api/readings',samples[599]);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.body.outcome,'stored');
for(let top=598;top>=0;top-=8){const batch=[];for(let i=top;i>=Math.max(0,top-7);i--)batch.push(request('/api/readings',samples[i]));const results=await Promise.all(batch);assert.ok(results.every(r=>r.status===200&&r.body.outcome==='stored'),JSON.stringify(results.filter(r=>r.status!==200)));}
console.log('Hosted backlog: 600/600 stored');
const concurrent=await Promise.all(Array.from({length:12},()=>request('/api/readings',samples[100])));assert.ok(concurrent.every(r=>r.status===200&&r.body.outcome==='duplicate'));
assert.equal((await request('/api/readings',{...samples[100],temperature:99})).status,409);
assert.equal((await request('/api/readings',sample(700,Date.now()),null)).status,401);
assert.equal((await request('/api/readings',sample(700,Date.now()),other)).status,404);
assert.equal((await request('/api/readings',{...samples[100],adcD3Raw:'Infinity'})).status,400);
const legacyTime=new Date(start-2000).toISOString();await client.send(new PutItemCommand({TableName:runtime.prefix+'readings',Item:{deviceId:{S:device},timestamp:{S:legacyTime},rawPayload:{S:'{"temperature":20}'}}}));
const history=await request(`/api/v1/devices/${device}/readings?from=${encodeURIComponent(legacyTime)}&to=${encodeURIComponent(samples[599].capturedAt)}&limit=1000`);assert.equal(history.status,200);assert.equal(history.body.data.length,601);assert.equal(history.body.data[0].timestamp,legacyTime);
for(let i=0;i<600;i++){const row=history.body.data[i+1];assert.equal(row.timestamp,samples[i].capturedAt);for(const f of ['temperature','humidity','pressure','altitudeMeters','adcD3Raw','adcD2Raw','adcD3PinVoltage','adcD2PinVoltage','adcD3InputVoltage','adcD2InputVoltage','aqi'])assert.equal(row[f],samples[i][f]);}
const items=[];let cursor;do{const r=await client.send(new QueryCommand({TableName:runtime.prefix+'readings',KeyConditionExpression:'deviceId = :d',ExpressionAttributeValues:{':d':{S:device}},ConsistentRead:true,ExclusiveStartKey:cursor}));items.push(...r.Items);cursor=r.LastEvaluatedKey;}while(cursor);
assert.equal(items.length,601);assert.deepEqual(JSON.parse(items[1].rawPayload.S),samples[0]);
console.log('Hosted retry/conflict/auth/ownership/field preservation and paginated legacy/new history passed');
// Exercise an actual paced producer in addition to the accelerated backlog.
const paced=[];for(let i=0;i<30;i++){const p=sample(800+i,Date.now());const t=Date.now();const r=await request('/api/readings',p);assert.equal(r.body.outcome,'stored');paced.push(p);if(i<29)await new Promise(resolve=>setTimeout(resolve,Math.max(0,2000-(Date.now()-t))));}
console.log('Hosted real-time cadence: 30/30 stored at approximately two-second intervals');
writeFileSync('/tmp/bair1-stage-test-state.json',JSON.stringify({base,bypass,key,device,sample:samples[100],next:sample(900,Date.now()),expectedRows:631}),{mode:0o600});
writeFileSync('docs/evidence/staging-http.json',JSON.stringify({base,backlogRetained:600,legacyRows:1,pacedRetained:30,concurrentDuplicates:12,checks:['capture timestamps','BME and dual ADC','raw payload','pagination','legacy row','conflict 409','missing auth 401','wrong owner 404','invalid number 400'],totalRowsBeforeRollback:631},null,2));
client.destroy();
