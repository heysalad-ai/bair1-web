import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand } from '@aws-sdk/client-dynamodb';
import { createLoader } from './helpers/load-ts.mjs';
const db = new DynamoDBClient({ endpoint:'http://127.0.0.1:18743', region:'local', credentials:{accessKeyId:'localtest',secretAccessKey:'localtest'} });
await db.send(new CreateTableCommand({TableName:'bair1-readings',KeySchema:[{AttributeName:'deviceId',KeyType:'HASH'},{AttributeName:'timestamp',KeyType:'RANGE'}],AttributeDefinitions:[{AttributeName:'deviceId',AttributeType:'S'},{AttributeName:'timestamp',AttributeType:'S'}],BillingMode:'PAY_PER_REQUEST'}));
try {
 const api=createLoader({'./aws-dynamo':{dynamoClient:db}})(process.env.BAIR1_BASELINE_FILE || 'src/lib/dynamo.ts');
 const deviceId=randomUUID(); const start=Date.now()-120000;
 for(let i=0;i<30;i++) await api.storeReading({deviceId, timestamp:new Date(start+i*2000).toISOString(),aqi:null,rawPayload:{sample:i,temperature:20,adcD3Raw:i}});
 const rows=await api.getReadings(deviceId,100);
 console.log(`Baseline retained ${rows.length}/30 distinct two-second readings`);
 assert.equal(rows.length,30,'Every distinct two-second reading must survive');
} finally {await db.send(new DeleteTableCommand({TableName:'bair1-readings'}));db.destroy();}
