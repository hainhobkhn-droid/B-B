// Server-only transport. Caller auth is always remote-verified; private RPCs are a fixed allowlist.
import {object} from './engine.ts';
export function supabaseTransport(config:{url:string;expectedProjectRef:string;publishableKey:string;serviceKey:string}){
 const url=new URL(config.url);
 if(url.href!==`https://${config.expectedProjectRef}.supabase.co/`||!config.publishableKey||!config.serviceKey)throw Error('SERVER_PROJECT_BINDING_INVALID');
 const base=url.origin;
 async function request(path:string,key:string,token:string,args?:Record<string,unknown>,timeout=15000):Promise<unknown>{
  const response=await fetch(base+path,{method:args===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(args===undefined?{}:{body:JSON.stringify(args)}),signal:AbortSignal.timeout(timeout)});
  const value=await response.json();
  if(!response.ok){const error=object(value);throw Error(typeof error.message==='string'?error.message:'AUTHORIZATION_OR_BACKEND_UNAVAILABLE');}
  return value;
 }
 return {
  async verifyUser(token:string){const user=object(await request('/auth/v1/user',config.publishableKey,token));if(typeof user.id!=='string'||!user.id)throw Error('AUTH_REQUIRED');return {id:user.id};},
  status:(token:string,intent:string)=>request('/rest/v1/rpc/get_my_rating_validation_intent',config.publishableKey,token,{p_intent_id:intent}),
  privateRPC(name:'capture_rating_validation_snapshot'|'finalize_rating_validation_seal',args:Record<string,unknown>){
   if(!['capture_rating_validation_snapshot','finalize_rating_validation_seal'].includes(name))throw Error('WORKER_RPC_NOT_ALLOWED');
   return request('/rest/v1/rpc/'+name,config.serviceKey,config.serviceKey,args,60000);
  }
 };
}
