// Portable synthetic tests: runs in Node and the actual Supabase user worker.
import {createPrepareHandler,type Dependencies} from './handler.ts';
import type {Context} from './engine.ts';
type Golden={context:Context;boundary:Record<string,unknown>;expected_canonical:string};
function assert(ok:unknown,message='ASSERTION'):asserts ok{if(!ok)throw Error(message);}
export async function runContractTests(golden:Golden){
 const results:{name:string;pass:boolean;error?:string}[]=[];
 const intent=golden.boundary.intent_id as string,origin='https://synthetic.invalid';
 function fixture(options:{sealed?:boolean;started?:boolean;terminal?:boolean;deny?:boolean;stale?:number;unknownCommit?:boolean;mapping?:boolean;statusExtras?:boolean}={}){
  let sealed=options.sealed??false;const calls:string[]=[];let finalizes=0;
  const deps:Dependencies={context:golden.context,allowedOrigins:[origin],now:()=>0,
   async verifyUser(token){calls.push('verify');if(token==='invalid')throw Error('AUTHORIZATION_OR_BACKEND_UNAVAILABLE');return {id:token};},
   async status(_token,id){calls.push('status');if(options.deny||options.mapping)throw Error('INTENT_NOT_OWNED');return {intent_id:id,created_at:'2026-10-09T09:00:00Z',sealed,started:options.started??false,missed_or_void:options.terminal??false,...(options.statusExtras?{email:'MUST_NOT_LEAK',worker_payload:'PRIVATE'}:{})};},
   async privateRPC(name,args){
    calls.push(name);
    if(name==='capture_rating_validation_snapshot'){assert(args.p_intent_id===intent);return golden.boundary;}
    assert(args.p_boundary_id===golden.boundary.boundary_id);assert(args.p_canonical_payload===golden.expected_canonical,'CANONICAL_PAYLOAD_CHANGED');
    finalizes++;if(finalizes<=(options.stale??0))throw Error('STALE_BOUNDARY');sealed=true;
    if(options.unknownCommit&&finalizes===1)throw Error('NETWORK_UNKNOWN');
    return {sealed:true};
   }};
  return {deps,calls,handler:createPrepareHandler(deps)};
 }
 function request(body:unknown={intent_id:intent},token:string|null='owner',path='/prepare',requestOrigin:string|null=origin){
  const headers:Record<string,string>={'Content-Type':'application/json'};if(token!==null)headers.Authorization='Bearer '+token;if(requestOrigin!==null)headers.Origin=requestOrigin;
  return new Request('https://function.synthetic.invalid'+path,{method:'POST',headers,body:JSON.stringify(body)});
 }
 async function test(name:string,fn:()=>Promise<void>){try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e instanceof Error?e.message:'ERROR'});}}
 await test('MEMBER owned recovery canonical seal',async()=>{const f=fixture(),r=await f.handler(request());assert(r.status===200);const body=await r.json();assert(body.sealed===true);assert(f.calls.filter(x=>x.startsWith('finalize')).length===1);});
 await test('ADMIN authorized by owner RPC',async()=>{const f=fixture();assert((await f.handler(request(undefined,'fixture-admin'))).status===200);});
 await test('minimal response no private fields',async()=>{const f=fixture({sealed:true,statusExtras:true}),r=await f.handler(request()),b=await r.json();assert(Object.keys(b).sort().join(',')==='created_at,intent_id,missed_or_void,sealed,started');assert(!JSON.stringify(b).includes('MUST_NOT_LEAK'));});
 await test('missing bearer denied before private calls',async()=>{const f=fixture();assert((await f.handler(request(undefined,null))).status===401);assert(f.calls.length===0);});
 await test('invalid bearer denied',async()=>{const f=fixture();assert((await f.handler(request(undefined,'invalid'))).status===409);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('unrelated MEMBER denied',async()=>{const f=fixture({deny:true});assert((await f.handler(request())).status===409);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('missing MEMBER Player mapping denied',async()=>{const f=fixture({mapping:true});assert((await f.handler(request())).status===409);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('terminal intent denied',async()=>{const f=fixture({terminal:true});assert((await f.handler(request())).status===409);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('started without seal denied',async()=>{const f=fixture({started:true});assert((await f.handler(request())).status===409);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('already sealed skips worker',async()=>{const f=fixture({sealed:true});assert((await f.handler(request())).status===200);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('started and sealed idempotent',async()=>{const f=fixture({sealed:true,started:true});assert((await f.handler(request())).status===200);assert(!f.calls.some(x=>x.startsWith('capture')));});
 await test('explicit retry does not duplicate seal',async()=>{const f=fixture();assert((await f.handler(request())).status===200);assert((await f.handler(request())).status===200);assert(f.calls.filter(x=>x.startsWith('finalize')).length===1);});
 await test('stale boundary recaptured at most three',async()=>{const f=fixture({stale:2});assert((await f.handler(request())).status===200);assert(f.calls.filter(x=>x.startsWith('capture')).length===3);});
 await test('stale boundary exhausted fails safely',async()=>{const f=fixture({stale:9});assert((await f.handler(request())).status===409);assert(f.calls.filter(x=>x.startsWith('finalize')).length===3);});
 await test('ambiguous commit never blindly retried',async()=>{const f=fixture({unknownCommit:true});assert((await f.handler(request())).status===409);assert(f.calls.filter(x=>x.startsWith('finalize')).length===1);assert((await f.handler(request())).status===200);assert(f.calls.filter(x=>x.startsWith('finalize')).length===1);});
 for(const key of ['actor_id','member_id','project_ref','rating','source_text','worker_sha256','roster'])await test('reject browser '+key,async()=>{const f=fixture();assert((await f.handler(request({intent_id:intent,[key]:'untrusted'}))).status===409);assert(f.calls.length===0);});
 await test('malformed JSON',async()=>{const f=fixture(),r=new Request('https://function.synthetic.invalid/prepare',{method:'POST',headers:{Origin:origin,Authorization:'Bearer owner'},body:'{'});assert((await f.handler(r)).status===409);});
 await test('oversized body',async()=>{const f=fixture();assert((await f.handler(request({intent_id:'x'.repeat(300)}))).status===409);assert(f.calls.length===0);});
 await test('missing intent',async()=>{const f=fixture();assert((await f.handler(request({}))).status===409);});
 await test('invalid UUID',async()=>{const f=fixture();assert((await f.handler(request({intent_id:'not-uuid'}))).status===409);});
 await test('UUID normalization',async()=>{const f=fixture();assert((await f.handler(request({intent_id:'{'+intent.toUpperCase()+'}'}))).status===200);});
 await test('unapproved origin',async()=>{const f=fixture();assert((await f.handler(request(undefined,'owner','/prepare','https://wrong.invalid'))).status===403);assert(f.calls.length===0);});
 await test('origin required',async()=>{const f=fixture();assert((await f.handler(request(undefined,'owner','/prepare',null))).status===403);});
 await test('CORS preflight narrow',async()=>{const f=fixture(),r=await f.handler(new Request('https://function.synthetic.invalid/prepare',{method:'OPTIONS',headers:{Origin:origin}}));assert(r.status===204);assert(r.headers.get('Access-Control-Allow-Origin')===origin);});
 await test('no worker/score/export HTTP route',async()=>{const f=fixture();for(const path of ['/worker','/score','/export'])assert((await f.handler(request(undefined,'owner',path))).status===404);});
 await test('no-store server request ID',async()=>{const f=fixture({sealed:true}),r=await f.handler(request());assert(r.headers.get('Cache-Control')==='no-store');assert(r.headers.get('X-Request-ID')?.length===36);});
 await test('per-user rate limit',async()=>{const f=fixture({sealed:true});for(let i=0;i<3;i++)assert((await f.handler(request())).status===200);const r=await f.handler(request());assert(r.status===429);assert(r.headers.get('Retry-After')==='5');});
 await test('global admission limit',async()=>{const f=fixture({sealed:true});for(let i=0;i<8;i++)assert((await f.handler(request(undefined,'owner-'+i))).status===200);assert((await f.handler(request(undefined,'owner-last'))).status===429);});
 await test('inflight limit',async()=>{const f=fixture({sealed:true});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});f.deps.verifyUser=async()=>{await gate;return {id:'owner'};};const handler=createPrepareHandler(f.deps),pending=[0,1,2,3].map(i=>handler(request(undefined,'owner-'+i)));const busy=await handler(request(undefined,'fifth'));assert(busy.status===429);release();await Promise.all(pending);});
 return {passed:results.filter(r=>r.pass).length,total:results.length,cases:results};
}
