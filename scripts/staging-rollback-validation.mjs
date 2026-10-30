import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {DynamoDBClient,QueryCommand} from '@aws-sdk/client-dynamodb';
const state=JSON.parse(readFileSync('/tmp/bair1-stage-test-state.json','utf8')),runtime=JSON.parse(readFileSync('/tmp/bair1-stage-runtime.json','utf8'));
assert.equal(state.base,readFileSync('/tmp/bair1-stage-candidate-url.txt','utf8').trim(),'Run the candidate validation for this deployment first');
const rollback=readFileSync('/tmp/bair1-stage-rollback-url.txt','utf8').trim();
assert.match(rollback,/^https:\/\/bair1-ingestion-staging-[a-z0-9]+-hey-salad-inc\.vercel\.app$/);
async function request(base,path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.key,'x-vercel-protection-bypass':state.bypass},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});return {status:r.status,body:await r.json()};}
const before=await request(rollback,`/api/v1/devices/${state.device}/readings?limit=1000`);assert.equal(before.status,200);assert.equal(before.body.data.length,state.expectedRows);assert.ok(before.body.data.every(r=>!Number.isNaN(Date.parse(r.timestamp))));
for(const path of ['/api/readings','/api/integrations/notehub']){const r=await request(rollback,path,state.next);assert.equal(r.status,503);assert.equal(r.body.stored,false);assert.equal(r.body.ok,false);}
const duplicate=await request(state.base,'/api/readings',state.sample);assert.equal(duplicate.body.outcome,'duplicate');
const stored=await request(state.base,'/api/readings',state.next);assert.equal(stored.body.outcome,'stored');
const retry=await request(state.base,'/api/readings',state.next);assert.equal(retry.body.outcome,'duplicate');
const conflict=await request(state.base,'/api/readings',{...state.next,temperature:99});assert.equal(conflict.status,409);
const after=await request(rollback,`/api/v1/devices/${state.device}/readings?limit=1000`);assert.equal(after.body.data.length,state.expectedRows+1);
const db=new DynamoDBClient({region:runtime.region,credentials:{accessKeyId:runtime.accessKeyId,secretAccessKey:runtime.secretAccessKey}});
let count=0,cursor;do{const r=await db.send(new QueryCommand({TableName:runtime.prefix+'readings',KeyConditionExpression:'deviceId = :d',ExpressionAttributeValues:{':d':{S:state.device}},Select:'COUNT',ConsistentRead:true,ExclusiveStartKey:cursor}));count+=r.Count;cursor=r.LastEvaluatedKey;}while(cursor);assert.equal(count,state.expectedRows+1);
writeFileSync('/tmp/bair1-firmware-replies.jsonl',[stored,retry,conflict].map(x=>JSON.stringify(x)).join('\n'));
writeFileSync('docs/evidence/staging-rollback.json',JSON.stringify({rollback,readsOldAndNew:true,rejectsIngestionWith503:true,receiptsSurvive:true,candidateResumeDeduplicates:true,rowsBefore:state.expectedRows,rowsAfter:count},null,2));
console.log('Hosted rollback passed: readable history, both upload routes paused, receipts preserved, safe resume; rows:',count);db.destroy();
