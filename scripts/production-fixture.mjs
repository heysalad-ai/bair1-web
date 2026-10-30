// Synthetic, temporary production verification fixture. Never log its identifiers or credentials.
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {DynamoDBClient,PutItemCommand} from '@aws-sdk/client-dynamodb';
import {createLoader} from '../tests/helpers/load-ts.mjs';
delete process.env.BAIR1_TABLE_PREFIX;
const a=JSON.parse(readFileSync('/tmp/bair1-prod-admin.json','utf8'));
const db=new DynamoDBClient({region:'eu-west-2',credentials:{accessKeyId:a.AccessKeyId,secretAccessKey:a.SecretAccessKey}});
const load=createLoader({'./aws-dynamo':{dynamoClient:db}}),keys=load('src/lib/api-keys.ts'),devices=load('src/lib/devices.ts');
const device=randomUUID(),owner=randomUUID(),legacyTime=new Date(Date.now()-3600000).toISOString();
const key=await keys.createApiKey({name:'Production rollout verification (temporary)',userId:owner,orgId:'verification',scopes:['read:readings','write:readings']});
const other=await keys.createApiKey({name:'Production rollout ownership check (temporary)',userId:randomUUID(),orgId:'verification',scopes:['write:readings']});
writeFileSync('/tmp/bair1-prod-fixture.json',JSON.stringify({device,owner,key:key.key,keyId:key.record.id,otherKey:other.key,otherKeyId:other.record.id,legacyTime}),{mode:0o600});
await devices.createDevice({deviceId:device,name:'Deployment verification (temporary)',location:'',lat:null,lng:null,ownerId:owner,orgId:'verification',status:'active',createdAt:new Date().toISOString()},true);
await db.send(new PutItemCommand({TableName:'bair1-readings',Item:{deviceId:{S:device},timestamp:{S:legacyTime},rawPayload:{S:'{"temperature":20,"verification":true}'},expiresAt:{N:String(Math.floor(Date.now()/1000)+86400)}}}));
const r=await fetch(`https://app.bair1.live/api/v1/devices/${device}/readings`,{headers:{Authorization:'Bearer '+key.key}});if(r.status!==200)throw Error('Existing production read failed: '+r.status);const body=await r.json();if(body.data?.length!==1||body.data[0].timestamp!==legacyTime)throw Error('Production storage mapping mismatch');
console.log('Existing production API reads the synthetic legacy fixture: storage/account mapping verified.');db.destroy();
