import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DynamoDBClient,CreateTableCommand,DeleteTableCommand,ScanCommand,PutItemCommand} from '@aws-sdk/client-dynamodb';
import {createLoader} from './helpers/load-ts.mjs';
// Rehearses application compatibility after copying an isolated local snapshot.
// This is not an AWS PITR/recovery-time test. No cloud endpoint is configurable.
const client = new DynamoDBClient({endpoint:'http://127.0.0.1:18743',region:'local',credentials:{accessKeyId:'localtest',secretAccessKey:'localtest'}});
test('Restored local snapshot preserves ownership, namespaced history and duplicate receipts',async()=>{
 const suffix = randomUUID().replaceAll('-',''), source = `bair1-staging-source-${suffix}-`, restored = `bair1-staging-restored-${suffix}-`, tables=[];
 const definitions=[['devices','deviceId'],['readings','deviceId','timestamp'],['reading-events','deviceId','eventId']];
 try{
  for(const prefix of [source,restored]) for(const [family,pk,sk] of definitions){
   const TableName=prefix+family;
   await client.send(new CreateTableCommand({TableName,BillingMode:'PAY_PER_REQUEST',KeySchema:[{AttributeName:pk,KeyType:'HASH'},...(sk?[{AttributeName:sk,KeyType:'RANGE'}]:[])],AttributeDefinitions:[{AttributeName:pk,AttributeType:'S'},...(sk?[{AttributeName:sk,AttributeType:'S'}]:[])]}));tables.push(TableName);
  }
  const loadFor=prefix=>createLoader({'./aws-dynamo':{dynamoClient:client},'./storage-config':{storageTable:name=>prefix+name.slice(6)}});
  const initial=loadFor(source), db=initial('src/lib/dynamo.ts'), devices=initial('src/lib/devices.ts');
  const id=randomUUID(), owner=randomUUID(), version=randomUUID();
  await devices.createDevice({deviceId:id,name:'Synthetic restore',ownerId:owner,orgId:'default',ownershipVersion:version,status:'active',location:'',lat:null,lng:null,createdAt:new Date().toISOString()});
  const input={deviceId:id,ownershipVersion:version,authorizedOwnerId:owner,tenantId:'default',eventId:randomUUID(),capturedAt:new Date().toISOString(),aqi:null,rawPayload:{temperature:21,pm25:5}};
  assert.equal((await db.storeReading(input)).outcome,'stored');
  for(const [family] of definitions){
   const snapshot=await client.send(new ScanCommand({TableName:source+family}));assert.ok(!snapshot.LastEvaluatedKey);
   for(const Item of snapshot.Items)await client.send(new PutItemCommand({TableName:restored+family,Item}));
   const copy=await client.send(new ScanCommand({TableName:restored+family})); assert.equal(copy.Count,snapshot.Count);
  }
  const recovered=loadFor(restored), restoredDb=recovered('src/lib/dynamo.ts'), access=recovered('src/lib/device-access.ts');
  const record=await recovered('src/lib/devices.ts').getDevice(id);
  assert.equal(record.ownerId,owner);assert.equal(record.ownershipVersion,version);
  assert.equal((await restoredDb.getLatestReading(id)).temperature,21);
  assert.equal(await access.canAccessDevice({kind:'user',user:{userId:randomUUID(),role:'user',orgId:'default'}},record),false);
  assert.equal((await restoredDb.storeReading(input)).outcome,'duplicate');
 }finally{for(const TableName of tables.reverse())await client.send(new DeleteTableCommand({TableName}));client.destroy();}
});
