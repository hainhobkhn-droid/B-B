import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {PyDecimal as D} from './native/decimal.ts';
import {canonical,parsePythonJSON} from './native/python-json.ts';
const file=n=>new URL(n,import.meta.url);
let passed=0;const failures=[];
for(const c of JSON.parse(readFileSync(file('./numeric-golden.json'),'utf8')).cases){
 try{
  let actual,error=false;
  try{
   const a=D.from(c.a),b=c.b===undefined?null:D.from(c.b);
   actual=String(c.op==='str'?a:c.op==='abs'?a.abs():c.op==='exp'?a.exp():c.op==='quant3'?a.quant(3):c.op==='quant5'?a.quant(5):a[c.op](b));
  }catch(e){error=true;if(!c.error)throw e;}
  assert.equal(error,!!c.error);if(!error)assert.equal(actual,c.expected);passed++;
 }catch(e){failures.push({case:c,error:String(e.message)});}
}
for(const c of JSON.parse(readFileSync(file('./json-golden.json'),'utf8'))){
 try{assert.equal(canonical(parsePythonJSON(c.input)),c.expected);passed++;}catch(e){failures.push({case:c,error:String(e.message)});}
}
for(const bad of ['NaN','Infinity','{"x":1e9999}','{"x":"\\ud800"}']){
 try{assert.throws(()=>canonical(parsePythonJSON(bad)));passed++;}catch(e){failures.push({bad,error:String(e.message)});}
}
writeFileSync(file('./numeric-results.json'),JSON.stringify({passed,failures},null,2)+'\n');
console.log(JSON.stringify({passed,failures:failures.length,first:failures.slice(0,8)},null,2));
if(failures.length)process.exitCode=1;
