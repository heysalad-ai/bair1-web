import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ConditionalCheckFailedException} from '@aws-sdk/client-dynamodb';
import {createLoader} from './helpers/load-ts.mjs';
test('Concurrent first-login creation cannot overwrite an existing role record',async(t)=>{
 const oldFetch=global.fetch;t.after(()=>{global.fetch=oldFetch;});
 const sub=randomUUID(),existing={userId:sub,role:'admin',orgId:'personal:'+randomUUID()};let reads=0;
 global.fetch=async()=>Response.json({sub,email_verified:true});
 const auth=createLoader({'./users':{getUser:async()=>++reads===1?null:existing,upsertUser:async(_user,onlyIfAbsent)=>{assert.equal(onlyIfAbsent,true);throw new ConditionalCheckFailedException({$metadata:{},message:'Synthetic race'});}}})('src/lib/auth.ts');
 assert.equal(await auth.getOrCreateUser(randomUUID()),existing);assert.equal(reads,2);
});
test('Bootstrap fails closed unless both a secret and an approved subject are configured',async()=>{
 const previous={secret:process.env.ADMIN_BOOTSTRAP_SECRET,sub:process.env.ADMIN_BOOTSTRAP_SUB};
 try{
  delete process.env.ADMIN_BOOTSTRAP_SECRET;delete process.env.ADMIN_BOOTSTRAP_SUB;
  const route=createLoader({'@/lib/auth':{verifyAuth0Token:async()=>{throw new Error('Unexpected token verification');}},'@/lib/users':{}})('src/app/api/admin/bootstrap/route.ts');
  assert.equal((await route.POST(new Request('https://synthetic.invalid',{method:'POST'}))).status,503);
  process.env.ADMIN_BOOTSTRAP_SECRET=randomUUID();
  assert.equal((await route.POST(new Request('https://synthetic.invalid',{method:'POST'}))).status,503);
 }finally{
  for(const [key,value] of [['ADMIN_BOOTSTRAP_SECRET',previous.secret],['ADMIN_BOOTSTRAP_SUB',previous.sub]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
