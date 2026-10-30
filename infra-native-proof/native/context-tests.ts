import {lockedContext} from './context.ts';
import {canonical,parsePythonJSON,sha256} from './python-json.ts';
import {object,type Context} from './engine.ts';
export async function runContextTests(input:Context){
 const c=object(parsePythonJSON(canonical(input)));c.identity={...object(c.identity),environment:'production',project_ref:'synthetic-only'};
 const encode=(v:unknown)=>new TextEncoder().encode(canonical(v)),raw=encode(c),hash=await sha256(raw);
 let passed=0;
 await lockedContext(raw,hash,'synthetic-only');passed++;
 const denied=async(fn:()=>Promise<unknown>)=>{let caught=false;try{await fn();}catch{caught=true;}if(!caught)throw Error('BINDING_NOT_REJECTED');passed++;};
 await denied(()=>lockedContext(raw,'0'.repeat(64),'synthetic-only'));
 await denied(()=>lockedContext(raw,hash,'wrong-project'));
 await denied(()=>lockedContext(raw,'not-a-hash','synthetic-only'));
 const original=c.identity;c.identity={...object(original),environment:'staging'};let modified=encode(c);await denied(async()=>lockedContext(modified,await sha256(modified),'synthetic-only'));c.identity=original;
 const reference=c.reference_worker_sha256;c.reference_worker_sha256='INVALID';modified=encode(c);await denied(async()=>lockedContext(modified,await sha256(modified),'synthetic-only'));c.reference_worker_sha256=reference;
 c.config=null;modified=encode(c);await denied(async()=>lockedContext(modified,await sha256(modified),'synthetic-only'));
 return {passed,total:7};
}
