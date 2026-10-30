import {compute,object,type Context} from './engine.ts';
import {canonical,parsePythonJSON} from './python-json.ts';
import {validateNativeIdentity,withNativeAttestation} from './attestation.ts';
type Status={intent_id:string;created_at:string;sealed:boolean;started:boolean;missed_or_void:boolean};
type PrivateRPC='capture_native_rating_validation_snapshot'|'finalize_native_rating_validation_seal';
export interface Dependencies{
 context:Context;
 nativeArtifactHash:string;
 allowedOrigins:readonly string[];
 verifyUser:(token:string)=>Promise<{id:string}>;
 status:(token:string,intent:string)=>Promise<unknown>;
 privateRPC:(name:PrivateRPC,args:Record<string,unknown>)=>Promise<unknown>;
 now?:()=>number;
}
class Limited extends Error{
 readonly category:string;readonly retry:number;
 constructor(category:string,retry:number){super('RATE_LIMIT_'+category);this.category=category;this.retry=retry;}
}
class Limiter{
 private global:number[];private users=new Map<string,number[]>();
 private clock:()=>number;
 constructor(clock:()=>number){this.clock=clock;this.global=[8,clock()];}
 private take(bucket:number[],capacity:number,perMinute:number,now:number,category:string){
  bucket[0]=Math.min(capacity,bucket[0]+Math.max(0,now-bucket[1])*perMinute/60);bucket[1]=now;
  if(bucket[0]<1)throw new Limited(category,Math.max(1,Math.ceil((1-bucket[0])/(perMinute/60))));bucket[0]--;
 }
 globalAdmit(){this.take(this.global,8,60,this.clock(),'GLOBAL');}
 userAdmit(identity:string){
  if(!identity||identity.length>128)throw Error('AUTH_REQUIRED');const now=this.clock();
  for(const [id,bucket] of this.users)if(now-bucket[1]>=900)this.users.delete(id);
  if(!this.users.has(identity)){if(this.users.size>=1024)throw new Limited('USER',900);this.users.set(identity,[3,now]);}
  this.take(this.users.get(identity)!,3,12,now,'USER');
 }
}
function normalizedUUID(value:unknown):string{
 if(typeof value!=='string')throw Error('INTENT_ONLY_REQUIRED');
 let s=value.replace(/^urn:uuid:/,'');if(s.startsWith('{')&&s.endsWith('}'))s=s.slice(1,-1);s=s.replaceAll('-','');
 if(!/^[0-9a-fA-F]{32}$/.test(s))throw Error('INTENT_ONLY_REQUIRED');s=s.toLowerCase();
 return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}
function status(value:unknown):Status{
 const r=object(value);
 if(typeof r.intent_id!=='string'||typeof r.created_at!=='string'||['sealed','started','missed_or_void'].some(k=>typeof r[k]!=='boolean'))throw Error('STATUS_CONTRACT_INVALID');
 return {intent_id:r.intent_id,created_at:r.created_at,sealed:r.sealed as boolean,started:r.started as boolean,missed_or_void:r.missed_or_void as boolean};
}
async function intentFromBody(req:Request):Promise<string>{
 if(req.headers.has('transfer-encoding'))throw Error('INTENT_ONLY_REQUIRED');
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)<1||Number(declared)>256))throw Error('INTENT_ONLY_REQUIRED');
 const reader=req.body?.getReader();if(!reader)throw Error('INTENT_ONLY_REQUIRED');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256){await reader.cancel();throw Error('INTENT_ONLY_REQUIRED');}chunks.push(value);}}
 finally{reader.releaseLock();}
 if(size===0||(declared!==null&&Number(declared)!==size))throw Error('INTENT_ONLY_REQUIRED');
 const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
 const body=object(parsePythonJSON(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 if(Object.keys(body).length!==1||!Object.hasOwn(body,'intent_id'))throw Error('INTENT_ONLY_REQUIRED');
 return normalizedUUID(body.intent_id);
}
export function createPrepareHandler(deps:Dependencies):(req:Request)=>Promise<Response>{
 validateNativeIdentity(deps.nativeArtifactHash,deps.context);
 if(!deps.allowedOrigins.length||deps.allowedOrigins.some(s=>{try{return new URL(s).origin!==s||!s.startsWith('https://');}catch{return true;}}))throw Error('EXPLICIT_HTTPS_ORIGINS_REQUIRED');
 const limiter=new Limiter(deps.now??(()=>performance.now()/1000));let inflight=0;
 return async function(req:Request):Promise<Response>{
  const id=crypto.randomUUID(),origin=req.headers.get('origin'),headers=new Headers({'X-Native-Artifact-SHA256':deps.nativeArtifactHash,'X-Attestation-Version':'2','Content-Type':'application/json','Cache-Control':'no-store','X-Request-ID':id,'Vary':'Origin'});
  if(origin&&deps.allowedOrigins.includes(origin))headers.set('Access-Control-Allow-Origin',origin);
  const respond=(code:number,value:unknown)=>new Response(JSON.stringify(value),{status:code,headers});
  const path=new URL(req.url).pathname;
  if(req.method==='GET'&&['/health','/b3d-prepare/health','/functions/v1/b3d-prepare/health'].includes(path))return respond(200,{status:'alive'});
  const preparePath=['/prepare','/b3d-prepare','/functions/v1/b3d-prepare'].includes(path);
  if(!preparePath)return respond(404,{error:'NOT_FOUND'});
  if(req.method==='OPTIONS'){
   if(!origin||!deps.allowedOrigins.includes(origin))return respond(403,{error:'DENIED'});
   headers.set('Access-Control-Allow-Methods','POST');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type, apikey, x-client-info');
   return new Response(null,{status:204,headers});
  }
  if(req.method!=='POST')return respond(404,{error:'NOT_FOUND'});
  if(!origin||!deps.allowedOrigins.includes(origin))return respond(403,{error:'DENIED'});
  try{
   limiter.globalAdmit();const auth=req.headers.get('authorization');
   if(!auth?.startsWith('Bearer ')||auth.length===7)return respond(401,{error:'AUTH_REQUIRED'});
   if(inflight>=4)throw new Limited('INFLIGHT',1);inflight++;
   try{
    const intent=await intentFromBody(req),token=auth.slice(7),user=await deps.verifyUser(token);limiter.userAdmit(user.id);
    const before=status(await deps.status(token,intent));
    if(before.intent_id!==intent||before.missed_or_void)throw Error('INTENT_NOT_PREPARABLE');
    if(before.started&&!before.sealed)throw Error('INTENT_ALREADY_STARTED');
    if(!before.sealed){
     for(let attempt=0;attempt<3;attempt++){
      const boundary=object(await deps.privateRPC('capture_native_rating_validation_snapshot',{p_intent_id:intent}));
      if(boundary.already_sealed===true)break;
      const output=await compute(boundary,deps.context);
      try{await deps.privateRPC('finalize_native_rating_validation_seal',{p_boundary_id:boundary.boundary_id,p_canonical_payload:canonical(withNativeAttestation(output,deps.nativeArtifactHash,deps.context))});break;}
      catch(e){if(!(e instanceof Error)||!e.message.includes('STALE_BOUNDARY')||attempt===2)throw e;}
     }
    }
    const after=status(await deps.status(token,intent));
    if(after.intent_id!==intent||!after.sealed)throw Error('SEAL_NOT_READY');
    return respond(200,after);
   }finally{inflight--;}
  }catch(e){
   if(e instanceof Limited){headers.set('Retry-After',String(e.retry));return respond(429,{error:'RATE_LIMIT_'+e.category,request_id:id});}
   return respond(409,{error:'PREPARATION_UNAVAILABLE'});
  }
 };
}
