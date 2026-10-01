// Execute the actual frontend delete callback with minimal DOM/SDK doubles.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const start=app.indexOf('              let recoveryReason = null;');
const end=app.indexOf('              actions.append(',start);
assert(start>0&&end>start);
const code=app.slice(start,end)+'\nglobalThis.deleteButton=hardDeleteButton;';
function fixture(responses){
 const calls=[],loads=[],messages=[];let prompts=0;
 const ctx={saving:false,deletionRecoveryPending:false,state:{writeBusy:false},current:()=>true,
  member:{profile_id:'target',full_name:'Fixture'},prompt:()=>{prompts++;return 'reason'},confirm:()=>true,
  notice:(_,text)=>messages.push(text),message:{},resultNotice:{},grid:{},blockerBox:{},
  actions:{replaceChildren(...nodes){this.nodes=nodes}},detail:{replaceChildren(){this.cleared=true}},
  button:(text,fn,cls)=>({textContent:text,fn,className:cls}),sync(){},explain:e=>e.message,
  loadPage:async(...args)=>loads.push(args),
  client:{functions:{invoke:async(name,payload)=>{calls.push({name,payload});const response=responses.shift();return typeof response==='function'?response():response}}}
 };
 vm.runInNewContext(code,ctx);return {ctx,calls,loads,messages,get prompts(){return prompts}};
}
(async()=>{
 const f=fixture([{error:{context:new Response(JSON.stringify({recovery_required:true,public_cleanup_completed:true,profile_id:'target'}))}},{data:{ok:true}}]);
 await f.ctx.deleteButton.fn();assert(f.ctx.deletionRecoveryPending);assert.equal(f.loads.length,0);assert.match(f.ctx.resultNotice.textContent,/Dữ liệu thành viên đã được xóa/);assert.equal(f.ctx.actions.nodes[0],f.ctx.deleteButton);
 await f.ctx.deleteButton.fn();assert.equal(f.prompts,1);assert.equal(f.calls[1].payload.body.profile_id,'target');assert.equal(f.calls[1].payload.body.reason,'reason');assert(!f.ctx.deletionRecoveryPending);assert(f.ctx.detail.cleared);assert.equal(f.loads.length,1);assert.equal(f.loads[0][1],null);
 let release;const pending=new Promise(resolve=>release=resolve);const g=fixture([()=>pending]);
 const first=g.ctx.deleteButton.fn();await g.ctx.deleteButton.fn();assert.equal(g.calls.length,1);release({data:{ok:true}});await first;assert(!g.ctx.state.writeBusy);
 const h=fixture([{error:{context:new Response(JSON.stringify({recovery_required:true,public_cleanup_completed:true,profile_id:'target',auth_cleanup_status:'UNCONFIRMED'}))}},{error:new Error('offline')}]);
 await h.ctx.deleteButton.fn();await h.ctx.deleteButton.fn();assert(h.ctx.deletionRecoveryPending);assert(!h.ctx.deleteButton.disabled);assert.equal(h.loads.length,0);
 console.log('PASS: ACC05 actual UI callback recovery identity, retry, completion clear/refresh, double-submit, retry failure. Not browser visual testing.');
})().catch(e=>{console.error(e);process.exitCode=1});
