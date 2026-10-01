// Offline execution of the actual Edge handler. No network or real accounts.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
const path = require('node:path');
const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../functions/admin-hard-delete-member/index.ts'),'utf8').replace(/^import .*\r?\n/,''));
let passed = 0;
function fixture(opts={}) {
  const state={profile:true,auth:true,tombstone:false,completed:false,deletes:0,completions:0,...opts};
  let handler;
  const client={
    from(table){ const q={}; return {select(){return this},eq(k,v){q[k]=v;return this},order(){return this},limit(){return this},
      async maybeSingle(){return {data:table==='audit_logs'?(state.tombstone?{id:'t',old_data:{player_id:'player'}}:null):q.id==='actor'?{role:state.nonAdmin?'MEMBER':'ADMIN',is_active:true}:state.profile?{id:'target',role:'MEMBER',player_id:'player'}:null}}}},
    async rpc(name){
      if(name==='get_member_hard_delete_snapshot') return {data:{hard_delete_allowed:!state.blocker,reference_total:state.blocker?1:0}};
      if(name==='admin_hard_delete_member_public') {
        if(state.lateBlocker) return {error:{message:'MEMBER_HAS_REFERENCES'}};
        if(!state.profile) return {error:{message:'TARGET_MEMBER_REQUIRED'}};
        state.profile=false;state.tombstone=true;state.deletes++;return {data:{success:!state.unconfirmed,player_id:'player'}};
      }
      assert.equal(name,'complete_member_hard_delete_auth');
      if(state.completionFail) return {error:{message:'fixture failure'}};
      assert(!state.profile&&!state.auth&&state.tombstone);
      if(!state.completed){state.completed=true;state.completions++}
      return {data:{success:true}};
    },
    auth:{async getUser(){return {data:{user:{id:'actor'}}}},admin:{
      async getUserById(){if(state.lookupFail)return {error:{status:503}};return state.auth?{data:{user:{id:'target'}}}:{error:{status:404}}},
      async deleteUser(){if(state.deleteFail)return {error:{status:503}};state.auth=false;return {error:state.delete404?{status:404}:null}}
    }}
  };
  vm.runInNewContext(source,{createClient:()=>client,Request,Response,console:{log(){},error(){}},Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://fixture.invalid':'fixture-key'},serve:fn=>handler=fn}});
  return {state,async call(id='target'){const r=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({profile_id:id,reason:'fixture'})}));return {status:r.status,body:await r.json()}}};
}
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
(async()=>{
 await test('full cleanup and append-only completion',async()=>{const f=fixture();assert.equal((await f.call()).body.auth_cleanup_status,'COMPLETED');assert.equal(f.state.deletes,1);assert.equal(f.state.completions,1)});
 await test('Auth failure retains recovery identity; retry completes once',async()=>{const f=fixture({deleteFail:true});let r=await f.call();assert(r.body.recovery_required&&r.body.public_cleanup_completed);assert.equal(r.body.profile_id,'target');f.state.deleteFail=false;r=await f.call();assert(r.body.ok&&r.body.recovery_mode);assert.equal(r.body.player_id,'player');assert.equal(f.state.deletes,1)});
 await test('Auth lookup failure recovery',async()=>{const f=fixture({lookupFail:true});assert((await f.call()).body.recovery_required);f.state.lookupFail=false;assert((await f.call()).body.ok)});
 await test('already deleted Auth and repeated retry',async()=>{const f=fixture({profile:false,auth:false,tombstone:true});assert((await f.call()).body.ok);assert((await f.call()).body.ok);assert.equal(f.state.completions,1);assert.equal(f.state.deletes,0)});
 await test('completion failure is retriable after Auth deletion',async()=>{const f=fixture({completionFail:true});assert.equal((await f.call()).body.auth_cleanup_status,'UNCONFIRMED');assert(!f.state.auth);f.state.completionFail=false;assert((await f.call()).body.ok)});
 await test('concurrent Auth deletion returning 404 is completion',async()=>{const f=fixture({delete404:true});assert((await f.call()).body.ok)});
 await test('two attempts; losing attempt can retry safely',async()=>{const f=fixture();const rs=await Promise.all([f.call(),f.call()]);assert(rs.some(x=>x.body.ok));assert.equal(f.state.deletes,1);assert((await f.call()).body.ok);assert.equal(f.state.completions,1)});
 await test('preview blocker prevents cleanup',async()=>{const f=fixture({blocker:true});assert.equal((await f.call()).status,409);assert(f.state.profile&&f.state.auth)});
 await test('blocker after preview prevents Auth deletion',async()=>{const f=fixture({lateBlocker:true});assert.equal((await f.call()).status,409);assert(f.state.profile&&f.state.auth)});
 await test('no tombstone cannot recover',async()=>{const f=fixture({profile:false});assert.equal((await f.call()).status,404);assert(f.state.auth)});
 await test('unconfirmed public cleanup never deletes Auth',async()=>{const f=fixture({unconfirmed:true});assert.equal((await f.call()).body.error,'PUBLIC_CLEANUP_UNCONFIRMED');assert(f.state.auth)});
 await test('self delete blocked',async()=>{const f=fixture();assert.equal((await f.call('actor')).body.error,'SELF_HARD_DELETE_FORBIDDEN')});
 await test('non-admin blocked',async()=>{const f=fixture({nonAdmin:true});assert.equal((await f.call()).status,403)});
 console.log(`PASS: ${passed} ACC05 offline Edge scenarios (not PostgreSQL concurrency tests).`);
})().catch(e=>{console.error(e);process.exitCode=1});
