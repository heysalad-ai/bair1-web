import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './helpers/load-ts.mjs';

test('preview cannot silently use production table names',()=>{
 const old={prefix:process.env.BAIR1_TABLE_PREFIX,vercel:process.env.VERCEL_ENV};
 try {
  process.env.VERCEL_ENV='preview';delete process.env.BAIR1_TABLE_PREFIX;
  assert.throws(()=>createLoader()('src/lib/storage-config.ts'),/isolated/);
  process.env.BAIR1_TABLE_PREFIX='bair1-';
  assert.throws(()=>createLoader()('src/lib/storage-config.ts'),/Invalid/);
  process.env.BAIR1_TABLE_PREFIX='bair1-staging-test-';
  assert.equal(createLoader()('src/lib/storage-config.ts').storageTable('bair1-readings'),'bair1-staging-test-readings');
  delete process.env.VERCEL_ENV;delete process.env.BAIR1_TABLE_PREFIX;
  assert.equal(createLoader()('src/lib/storage-config.ts').storageTable('bair1-readings'),'bair1-readings');
 }finally{
  for(const [key,value] of [['BAIR1_TABLE_PREFIX',old.prefix],['VERCEL_ENV',old.vercel]])if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
