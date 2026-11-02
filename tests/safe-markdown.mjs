import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './helpers/load-ts.mjs';
const {simpleMarkdown}=createLoader()('src/lib/safe-markdown.ts');
test('Untrusted model HTML is inert while supported emphasis and code remain formatted',()=>{
 for(const text of ['<img src=x onerror=alert(1)>','<svg onload=alert(1)>','**<script>alert(1)</script>**','`</code><iframe src=x>`','&#x3c;img src=x onerror=alert(1)&#x3e;']){
  const html=simpleMarkdown(text);assert.ok(!/<(?:img|svg|script|iframe|a)[\s>]/i.test(html));assert.ok(!html.includes('&#x3c;'));
 }
 assert.equal(simpleMarkdown('**Readings** & *context*'),'<'+'strong>Readings</strong> &amp; <em>context</em>');
 assert.match(simpleMarkdown('`pm25`'),/^<code class="[^"]+">pm25<\/code>$/);
});
