import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url);
function figure(reduced=false){
 const loaded={exports:{}};
 const code=ts.transpileModule(readFileSync('src/components/bear/BearFigure.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name==='framer-motion'?{...require(name),useReducedMotion:()=>reduced}:require(name),loaded,loaded.exports);
 return loaded.exports.default;
}
test('rendered bear follows mouth and eyelid controls',()=>{
 const Bear=figure();
 const rest=renderToStaticMarkup(React.createElement(Bear,{mood:'speaking',face:{jaw:0,pucker:0,smile:0,blink:0}}));
 const talk=renderToStaticMarkup(React.createElement(Bear,{mood:'speaking',face:{jaw:1,pucker:1,smile:0,blink:1}}));
 const mouth=svg=>svg.match(/data-face-mouth="nvidia" d="([^"]+)"/)[1];
 assert.notEqual(mouth(rest),mouth(talk));
 assert.match(talk,/cx="505" cy="386" rx="23" ry="2"/);
});
test('reduced motion suppresses externally supplied facial movement',()=>{
 const Bear=figure(true);const svg=renderToStaticMarkup(React.createElement(Bear,{mood:'speaking',face:{jaw:1,pucker:1,smile:1,blink:1}}));
 assert.doesNotMatch(svg,/data-face-mouth="nvidia"/);assert.match(svg,/cx="505" cy="386" rx="23" ry="28"/);
});
