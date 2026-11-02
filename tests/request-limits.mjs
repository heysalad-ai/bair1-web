import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';
const {readJsonObject, validCoordinates} = createLoader()('src/lib/request-limits.ts');
test('JSON byte limits reject chunked oversized input, malformed JSON, arrays and null', async () => {
 const request = value => new Request('https://synthetic.invalid', {method:'POST',body:value});
 assert.deepEqual(await readJsonObject(request('{"ok":true}')), {ok:true});
 for(const value of ['null','[]','invalid','"text"']) await assert.rejects(readJsonObject(request(value)), RangeError);
 await assert.rejects(readJsonObject(request(JSON.stringify({text:'x'.repeat(200)})), 100), RangeError);
 assert.equal(validCoordinates(0,0), true); for(const pair of [[91,0],[0,181],[NaN,0],[Infinity,0]]) assert.equal(validCoordinates(...pair), false);
});
