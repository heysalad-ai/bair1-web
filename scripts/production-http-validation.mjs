import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {DynamoDBClient,QueryCommand} from '@aws-sdk/client-dynamodb';
const mode=process.argv[2];assert.ok(['preflight','live'].includes(mode));
const state=JSON.parse(readFileSync('/tmp/bair1-prod-fixture.json','utf8')),runtime=JSON.parse(readFileSync('/tmp/bair1-prod-runtime.json','utf8'));
const candidate=JSON.parse(readFileSync('/tmp/bair1-prod-candidate-deploy.json','utf8')).deployment;
const fallback=JSON.parse(readFileSync('/tmp/bair1-prod-fallback-deploy.json','utf8')).deployment;
const base=mode==='live'?'https://app.bair1.live':candidate.url;
const bypass=JSON.parse(readFileSync('/tmp/bair1-prod-bypass.json','utf8')).generate.secret;
const template=JSON.parse(readFileSync('/tmp/bair1-firmware-payload.json','utf8'));
const db=new DynamoDBClient({region:runtime.region,credentials:{accessKeyId:runtime.accessKeyId,secretAccessKey:runtime.secretAccessKey}});
async function request(path,body,key=state.key,url=base){const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{}),...(url==='https://app.bair1.live'?{}:{'x-vercel-protection-bypass':bypass})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
function sample(i,t){return {...template,deviceId:state.device,bootSession:'verify-'+state.owner,eventId:state.owner+':'+i,sequence:i,sample:i,capturedAt:new Date(t).toISOString()};}
const count=mode==='live'?30:12,start=Date.now()-60000,samples=[],times=[];let stored;
for(let i=0;i<count;i++){const s=sample((mode==='live'?100:0)+i,mode==='live'?Date.now():start+i*2000);samples.push(s);times.push(Date.now());const r=await request('/api/readings',s);assert.equal(r.status,200);assert.equal(r.body.outcome,'stored');assert.equal(r.body.capturedAt,s.capturedAt);stored??=r;if(mode==='live'&&i<count-1)await new Promise(resolve=>setTimeout(resolve,Math.max(0,2000-(Date.now()-times.at(-1)))));}
const retries=await Promise.all(Array.from({length:8},()=>request('/api/readings',samples[0])));assert.ok(retries.every(r=>r.status===200&&r.body.outcome==='duplicate'));
const conflict=await request('/api/readings',{...samples[0],temperature:99});assert.equal(conflict.status,409);
assert.equal((await request('/api/readings',sample(999,Date.now()),null)).status,401);
assert.equal((await request('/api/readings',sample(999,Date.now()),state.otherKey)).status,404);
assert.equal((await request('/api/readings',{...samples[0],adcD3Raw:'Infinity'})).status,400);
const expected=mode==='live'?43:13;
const history=await request(`/api/v1/devices/${state.device}/readings?limit=1000`);assert.equal(history.status,200);assert.equal(history.body.data.length,expected);assert.ok(history.body.data.some(r=>r.timestamp===state.legacyTime));
for(const s of samples){const r=history.body.data.find(r=>r.sample===s.sample);assert.ok(r);assert.equal(r.timestamp,s.capturedAt);for(const field of ['temperature','humidity','pressure','altitudeMeters','adcD3Raw','adcD2Raw','adcD3PinVoltage','adcD2PinVoltage','adcD3InputVoltage','adcD2InputVoltage','aqi'])assert.equal(r[field],s[field]);}
for(const path of ['/api/readings','/api/integrations/notehub']){const r=await request(path,sample(999,Date.now()),state.key,fallback.url);assert.equal(r.status,503);assert.equal(r.body.stored,false);}
const rollbackRead=await request(`/api/v1/devices/${state.device}/readings?limit=1000`,undefined,state.key,fallback.url);assert.equal(rollbackRead.status,200);assert.equal(rollbackRead.body.data.length,expected);
assert.equal((await request('/api/readings',samples[0])).body.outcome,'duplicate');
const rows=(await db.send(new QueryCommand({TableName:'bair1-readings',KeyConditionExpression:'deviceId = :d',ExpressionAttributeValues:{':d':{S:state.device}},ConsistentRead:true}))).Items;assert.equal(rows.length,expected);
for(const s of samples){const row=rows.find(r=>r.sample?.N===String(s.sample));assert.deepEqual(JSON.parse(row.rawPayload.S),s);assert.ok(Number(row.expiresAt.N)>Math.floor(Date.now()/1000)+13*86400);}
const receipts=(await db.send(new QueryCommand({TableName:'bair1-reading-events',KeyConditionExpression:'deviceId = :d',ExpressionAttributeValues:{':d':{S:state.device}},ConsistentRead:true}))).Items;assert.equal(receipts.length,expected-1);
writeFileSync('/tmp/bair1-firmware-replies.jsonl',[stored,retries[0],conflict].map(r=>JSON.stringify(r)).join('\n'));
const intervals=times.slice(1).map((t,i)=>t-times[i]);
writeFileSync(`docs/evidence/production-${mode}.json`,JSON.stringify({base,mode,readingsStored:count,totalSyntheticRows:expected,receiptCount:receipts.length,concurrentRetries:8,minIntervalMs:Math.min(...intervals),maxIntervalMs:Math.max(...intervals),fallback:fallback.url,checks:['stored','duplicate','conflict 409','missing auth 401','wrong owner 404','invalid field 400','capture times','raw and typed BME/ADC','legacy history','fallback reads','fallback pauses both ingest routes','14-day expiry values']},null,2));
console.log(`${mode}: ${count}/${count} readings, retry/conflict/auth/field checks and production-configured fallback passed; ${expected} synthetic rows verified.`);db.destroy();
