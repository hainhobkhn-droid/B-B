import {compute} from './native/engine.ts';
import type {Context} from './native/engine.ts';
import {canonical,parsePythonJSON,sha256} from './native/python-json.ts';
import {runContractTests} from './native/contract-tests.ts';
import {runContextTests} from './native/context-tests.ts';
type Golden={name:string;kind:string;boundary:Record<string,unknown>;context:Context;expected_canonical:string;error:string};
const data=parsePythonJSON(Deno.readTextFileSync(new URL('./synthetic-goldens.json',import.meta.url))) as {cases:Golden[]};
let visits=0;
Deno.serve(async(req)=>{
 const start=performance.now();const url=new URL(req.url);const action=url.searchParams.get('action');
 try{
  if(action==='binding'){const result=await runContextTests(data.cases[0].context);return Response.json({ok:result.passed===result.total,...result});}
  if(action==='contract'){
   const results=await runContractTests(data.cases.find(c=>c.name==='prefix-2')!);
   return Response.json({ok:results.passed===results.total,...results,wall_ms:performance.now()-start});
  }
  const index=Number(url.searchParams.get('index'));if(!Number.isInteger(index)||index<0||index>=data.cases.length)return new Response('BAD_INDEX',{status:400});
  const c=data.cases[index];let ok=false,hash:string|undefined,error:string|undefined;
  try{const actual=canonical(await compute(c.boundary,c.context));ok=c.kind==='valid'&&actual===c.expected_canonical;hash=await sha256(actual);}
  catch(e){error=e instanceof Error?e.message:'UNKNOWN';ok=c.kind==='denied'&&error===c.error;}
  return Response.json({ok,name:c.name,kind:c.kind,hash,error,visit:++visits,compute_wall_ms:performance.now()-start});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:'UNKNOWN'},{status:500});}
});
