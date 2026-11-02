import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createLoader} from './helpers/load-ts.mjs';
import {QueryCommand,GetItemCommand,UpdateItemCommand} from '@aws-sdk/client-dynamodb';
test('A stale API-key GSI result cannot bypass consistent revocation or deletion',async()=>{
 const indexed={id:{S:randomUUID()},keyHash:{S:randomUUID()},userId:{S:randomUUID()},scopes:{S:'["read:readings"]'}};
 let current={...indexed,revokedAt:{S:new Date().toISOString()}}, updates=0, reads=0;
 const keys=createLoader({'./aws-dynamo':{dynamoClient:{send:async command=>{
  if(command instanceof QueryCommand)return {Items:[indexed]};
  if(command instanceof GetItemCommand){assert.equal(command.input.ConsistentRead,true);reads++;return {Item:current};}
  if(command instanceof UpdateItemCommand){updates++;return {};}
  throw new Error('Unexpected request');
 }}}})('src/lib/api-keys.ts');
 const key='bair1_'+randomUUID();
 assert.equal(await keys.validateApiKey(key,['read:readings']),null);
 current=undefined;assert.equal(await keys.validateApiKey(key,['read:readings']),null);
 assert.equal(reads,2);assert.equal(updates,0);
});
