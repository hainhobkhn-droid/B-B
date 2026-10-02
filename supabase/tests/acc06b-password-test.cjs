// Actual Edge and frontend helper, offline Auth transport; no real credentials.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const root=path.join(__dirname,'../..');
const edge=stripTypeScriptTypes(fs.readFileSync(path.join(root,'supabase/functions/change-my-password/index.ts'),'utf8').replace(/^import .*\r?\n/,''));
let count=0;
function fixture(options={}){
 const s={flag:true,active:true,updates:0,authCalls:0,preflights:0,events:[],completions:0,audits:0,...options};let handler;
 const admin={auth:{async getUser(){return s.unauthorized?{error:{}}:{data:{user:{id:'self'}}}}},
 from(){return {select(){return this},eq(k,v){assert.equal(v,'self');return this},async maybeSingle(){return {data:s.missing?null:{id:'self',is_active:s.active},error:s.lookupError?{}:null}}}},
 async rpc(name,args){
  assert.equal(args.p_profile_id,'self');
  if(name==='get_forced_password_change_readiness_internal'){
   s.preflights++;s.events.push('preflight');
   if(s.readinessThrow)throw new Error('fixture transport');
   if(s.readinessError||s.lookupError)return {error:{}};
   return {data:{ready:!(s.notReady||s.missing||!s.active||s.flag===null),contract:s.badContract?'bad':'ACC06D_V1',profile_id:s.wrongReadyUser?'other':'self',must_change_password:s.flag}};
  }
  s.events.push('completion');assert.equal(name,'complete_forced_password_change_internal');assert.equal(args.p_profile_id,'self');assert(s.updates>0);s.completions++;if(s.completionFail)return {error:{}};if(s.flag){s.flag=false;s.audits++}return {data:{success:true,profile_id:'self',must_change_password:false}}}};
 vm.runInNewContext(edge,{createClient:()=>admin,Request,Response,JSON,fetch:async(url,opt)=>{
  s.authCalls++;s.events.push('auth');assert.equal(url,'https://fixture.invalid/auth/v1/user');assert.equal(opt.method,'PUT');assert.equal(opt.headers.Authorization,'Bearer user-token');
  const b=JSON.parse(opt.body);assert(!b.profile_id);if(s.authFail)return Response.json({error_code:s.authFail},{status:400});
  if(s.lastPassword===b.password)return Response.json({error_code:'same_password'},{status:422});
  s.lastPassword=b.password;s.updates++;if(s.lostResponse)throw new Error('lost response');return Response.json({id:s.wrongUser?'other':'self'});
 },Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://fixture.invalid':k.includes('KEYS')?'{}':'fixture-key'},serve:fn=>handler=fn}});
 return {s,async call(body={password:'new-fixture-password'}){const x=await handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify(body)}));return {status:x.status,body:await x.json()}}};
}
async function test(name,fn){await fn();count++;console.log('PASS',name)}
(async()=>{
 await test('Auth failure never invokes completion',async()=>{const f=fixture({authFail:'weak_password'});assert.equal((await f.call()).body.error,'weak_password');assert(f.s.flag);assert.equal(f.s.completions,0)});
 await test('success clears self and audits once',async()=>{const f=fixture();assert((await f.call()).body.success);assert(!f.s.flag);assert.equal(f.s.audits,1)});
 await test('duplicate same password fails closed; fresh password is safe',async()=>{const f=fixture();await f.call();assert.equal((await f.call()).body.error,'same_password');assert((await f.call({password:'another-fixture-password'})).body.success);assert.equal(f.s.audits,1)});
 await test('partial failure survives reload; new password retry completes',async()=>{const f=fixture({completionFail:true});assert.equal((await f.call()).body.error,'PASSWORD_COMPLETION_PENDING');assert(f.s.flag);f.s.completionFail=false;assert.equal((await f.call()).body.error,'same_password');assert(f.s.flag);assert((await f.call({password:'another-fixture-password'})).body.success);assert(!f.s.flag)});
 await test('lost Auth response never counts as proof',async()=>{const f=fixture({lostResponse:true});assert.equal((await f.call()).body.error,'PASSWORD_UPDATE_UNCONFIRMED');assert(f.s.flag);assert.equal(f.s.completions,0);f.s.lostResponse=false;assert((await f.call({password:'another-fixture-password'})).body.success)});
 for(const option of [{active:false},{missing:true},{unauthorized:true},{lookupError:true}])await test('reject account '+JSON.stringify(option),async()=>{const f=fixture(option);assert((await f.call()).status>=400);assert.equal(f.s.updates,0)});
 for(const body of [{password:'new-fixture-password',profile_id:'other'},{password:'new-fixture-password',password_changed:true}])await test('reject target/proof injection',async()=>{const f=fixture();assert.equal((await f.call(body)).status,400);assert.equal(f.s.updates,0)});
 await test('mismatching Auth identity cannot complete',async()=>{const f=fixture({wrongUser:true});assert.equal((await f.call()).body.error,'PASSWORD_UPDATE_UNCONFIRMED');assert(f.s.flag);assert.equal(f.s.completions,0)});
 for(const option of [{readinessError:true},{readinessThrow:true},{notReady:true},{badContract:true},{wrongReadyUser:true},{flag:null}])await test('ACC06D missing/invalid readiness stops before Auth '+JSON.stringify(option),async()=>{const f=fixture(option);assert.equal((await f.call()).body.error,'PASSWORD_BACKEND_NOT_READY');assert.equal(f.s.authCalls,0);assert.equal(f.s.completions,0)});
 await test('ACC06D authenticated preflight is read-only',async()=>{const f=fixture();assert.deepEqual((await f.call({mode:'preflight'})).body,{ready:true});assert.equal(f.s.authCalls,0);assert.equal(f.s.audits,0);assert(f.s.flag)});
 await test('ACC06D preflight cannot carry a password',async()=>{const f=fixture();assert.equal((await f.call({mode:'preflight',password:'fixture-pass'})).status,400);assert.equal(f.s.authCalls,0)});
 await test('ACC06D readiness -> Auth -> completion exact order',async()=>{const f=fixture();await f.call();assert.deepEqual(f.s.events,['preflight','auth','completion'])});
 await test('ACC06D recovery false flag remains supported',async()=>{const f=fixture({flag:false});assert((await f.call()).body.success);assert.equal(f.s.audits,0)});
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const helper=app.slice(app.indexOf('      async function changeMyPassword('),app.indexOf('      function forcedPasswordChange('));
 await test('frontend verifies response identity and flag',async()=>{
  for(const response of [{success:true,profile_id:'self',must_change_password:false},{success:true,profile_id:'other',must_change_password:false},{success:true,profile_id:'self'},{}]){
   const ctx={client:{functions:{invoke:async()=>({data:response})}}};vm.createContext(ctx);vm.runInContext(helper+';this.change=changeMyPassword;',ctx);
   if(response.profile_id==='self'&&response.must_change_password===false)await ctx.change('fixture-password','self');else await assert.rejects(ctx.change('fixture-password','self'));
  }
 });
 await test('ACC06D new FE with missing Edge fails closed',async()=>{const ctx={client:{functions:{invoke:async()=>({error:{context:Response.json({error:'NOT_FOUND'},{status:404})}})}}};vm.createContext(ctx);vm.runInContext(helper+';this.change=changeMyPassword;',ctx);await assert.rejects(ctx.change('fixture-password','self'))});
 await test('frontend error retains safe retry code',async()=>{const ctx={client:{functions:{invoke:async()=>({error:{context:Response.json({error:'PASSWORD_COMPLETION_PENDING'},{status:503})}})}}};vm.createContext(ctx);vm.runInContext(helper+';this.change=changeMyPassword;',ctx);await assert.rejects(ctx.change('fixture-password','self'),e=>e.code==='PASSWORD_COMPLETION_PENDING')});
 await test('both callers migrated; reload guard retained',async()=>{
  assert(!app.includes("'complete_my_password_change'"));assert(app.includes('await changeMyPassword(password.value, state.session.user.id)'));assert(app.includes('await changeMyPassword(password, sessionData.session.user.id)'));
  const forced=app.slice(app.indexOf('function forcedPasswordChange('),app.indexOf('function forcedPasswordChange(')+10000);assert(forced.includes('await load()'));assert(forced.includes('render()'));
  assert(/must_change_password\s*===\s*true/.test(app));
 });

 class E { constructor(tag,text){Object.assign(this,{tag,text,children:[],events:{},value:''})} append(...x){this.children.push(...x)} setAttribute(){} addEventListener(k,f){this.events[k]=f} reportValidity(){return true} }
 const nodes=n=>[n,...n.children.flatMap(nodes)];
 function mount(f){
  const root=new E('div'),state={session:{user:{id:'self'}},profile:{must_change_password:f.s.flag}},notices=[];let reloads=0;
  const ctx={state,el:(...a)=>new E(...a),panel:(t,r)=>{const e=new E('section',t);r.append(e);return e},notice:(_,t)=>notices.push(t),$:()=>root,console:{error(){}},
   load:async()=>{reloads++;state.profile.must_change_password=f.s.flag},render:()=>{},
   client:{functions:{invoke:async(name,args)=>{assert.equal(name,'change-my-password');const r=await f.call(args.body);return r.status===200?{data:r.body}:{error:{context:Response.json(r.body,{status:r.status})}}}}}};
  vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf('      async function changeMyPassword('),app.indexOf('      function navigate(',app.indexOf('      function forcedPasswordChange('))),ctx);ctx.forcedPasswordChange(root);
  return {root,state,notices,get reloads(){return reloads},async submit(value){const inputs=nodes(root).filter(n=>n.tag==='input');inputs.forEach(n=>n.value=value);await nodes(root).find(n=>n.tag==='form').events.submit({preventDefault(){}})}};
 }
 await test('actual forced form success reload reads false and does not remount',async()=>{const f=fixture(),ui=mount(f);await ui.submit('fixture-password-1');assert.equal(ui.reloads,1);assert.equal(ui.state.profile.must_change_password,false);assert.equal(mount(f).root.children.length,0);assert(!ui.state.writeBusy)});
 await test('actual forced form partial failure reload stays locked; fresh password recovers',async()=>{const f=fixture({completionFail:true}),ui=mount(f);await ui.submit('fixture-password-1');assert.equal(ui.reloads,0);assert(ui.state.profile.must_change_password);assert(ui.notices.some(t=>t.includes('mật khẩu mới khác')));const reloaded=mount(f);assert(reloaded.root.children.length);f.s.completionFail=false;await reloaded.submit('fixture-password-1');assert.equal(reloaded.reloads,0);await reloaded.submit('fixture-password-2');assert.equal(reloaded.reloads,1)});
 await test('forced form busy and length guards',async()=>{const f=fixture(),ui=mount(f);await ui.submit('short');assert.equal(f.s.updates,0);ui.state.writeBusy=true;await ui.submit('fixture-password-1');assert.equal(f.s.updates,0)});
 console.log(`PASS ${count} ACC06B offline cases; real Auth/browser reload NOT TESTED.`);
})().catch(e=>{console.error(e);process.exitCode=1});
