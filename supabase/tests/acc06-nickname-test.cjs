const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(path.join(__dirname,'../../account.js'),'utf8');const a=s.indexOf('      function memberNickname('),b=s.indexOf('      function admin()',a);
class E{constructor(tag,text,cls){Object.assign(this,{tag,text,cls,children:[],events:{},isConnected:true,value:''})}append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}setAttribute(){}addEventListener(k,f){this.events[k]=f}}
const all=n=>[n,...n.children.flatMap(all)];
function mount(profile={},reply){const root=new E('div'),calls=[],notices=[];let loaded=0;const state={session:{user:{id:'u'}},generation:1,profile:{role:'MEMBER',is_active:true,membership_status:'APPROVED',login_name:null,...profile}};
if(profile.__missing) delete state.profile.login_name;
const ctx={state,el:(...x)=>new E(...x),notice:(_,t)=>notices.push(t),$:()=>root,load:async()=>{loaded++},client:{rpc:async(name,args)=>{calls.push({name,args});return reply?await reply():{data:{success:true,profile_id:'u',login_name:args.p_nickname}}}}};
vm.createContext(ctx);vm.runInContext(s.slice(a,b),ctx);ctx.memberNickname(root);
return {root,state,calls,notices,get loaded(){return loaded},async submit(value){all(root).find(x=>x.tag==='input').value=value;await all(root).find(x=>x.tag==='form').events.submit({preventDefault(){}})}};}
(async()=>{
let f=mount({login_name:'existing'});assert(!all(f.root).some(n=>n.tag==='form'));

f=mount({__missing:true});assert(!all(f.root).some(n=>n.tag==='form'));
f=mount({role:'ADMIN'});assert.equal(f.root.children.length,0);
f=mount({membership_status:'PENDING'});assert.equal(f.root.children.length,0);
f=mount();await f.submit('a!');assert.equal(f.calls.length,0);
await f.submit('  A_B.C-1 ');assert.equal(f.calls[0].args.p_nickname,'a_b.c-1');assert.equal(f.state.profile.login_name,'a_b.c-1');assert.equal(f.loaded,1);assert(!all(f.root).some(x=>x.tag==='form'));
f=mount({},async()=>({error:{message:'LOGIN_NAME_TAKEN'}}));await f.submit('taken');assert(f.notices.some(n=>n.includes('đã được sử dụng')));assert(!f.state.writeBusy);
f=mount({},async()=>({error:{message:'LOGIN_NAME_ALREADY_SET'}}));await f.submit('exists');assert(f.notices.some(n=>n.includes('đã có nickname')));
let release;const wait=new Promise(r=>release=r);f=mount({},()=>wait);const first=f.submit('hold');await f.submit('hold');assert.equal(f.calls.length,1);release({data:{success:true,profile_id:'u',login_name:'hold'}});await first;
let resolve;f=mount({},()=>new Promise(r=>resolve=r));const pending=f.submit('stale');f.state.generation++;resolve({data:{success:true,profile_id:'u',login_name:'stale'}});await pending;assert.equal(f.state.profile.login_name,null);assert.equal(f.loaded,0);
console.log('PASS ACC06 nickname read-only, roles, validation, normalization, conflicts, double-submit and stale response');
})().catch(e=>{console.error(e);process.exitCode=1});
