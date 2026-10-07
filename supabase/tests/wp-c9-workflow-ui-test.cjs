'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const players = fs.readFileSync(path.join(repo, 'players.js'), 'utf8');
const account = fs.readFileSync(path.join(repo, 'account.js'), 'utf8');
class Node {
  constructor(tag, text = '', cls = '') { Object.assign(this, {tag, textContent: text || '', className: cls,
    children: [], events: {}, attributes: {}, value: '', disabled: false, hidden: false, isConnected: true}); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(k,v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(k,f) { this.events[k] = f; }
}
const walk = n => [n, ...n.children.flatMap(walk)];
const text = n => walk(n).map(item => item.textContent).join(' ');
const flush = () => new Promise(resolve => setImmediate(resolve));
const fire = async (n,event) => { await n.events[event]({preventDefault() {}}); await flush(); };
const el = (tag,text,cls) => new Node(tag,text,cls);
const player = '00000000-0000-0000-0000-000000000010';
function fixture(rating = true, audit = true) {
  const root = el('div'), calls = [], messages = [], global = el('div');
  const scope = {state: {generation: 1,session: {user: {id: 'actor'}}, page: 'players'},
    canAdjustRating: () => rating, canViewAudit: () => audit, el,
    crypto: require('node:crypto').webcrypto, Date, JSON,
    rows: () => [{id: player,full_name: 'Fixture',current_rating: 4}], raw: String, number: String,
    panel(title,parent) { const n=el('section',title);parent.append(n);return n; },
    notice(n,t,error) {n.textContent=t;messages.push({text:t,error});}, explain: e => e.message || e.code,
    $: () => global, date: String, load: async () => {}, render() {},
    client: {async rpc(name,payload) { calls.push({name,payload});return scope.reply(name,payload); }},
    reply: (name,p) => name==='get_audit_events'
      ? {data: {events: [],page_size: 30,offset: p.p_offset,has_more: false}}
      : {data: {success: true,player_id: p.p_player_id,adjustment_id: 'confirmed'}},
    button(label,fn) { const n=el('button',label); n.events.click=fn;return n; },
    actionAccordion(options) { const body=el('div');root.append(body);options.render(body);scope.open=options.onOpen; }
  };
  vm.createContext(scope);
  vm.runInContext(players.slice(players.indexOf('    function manualRatingAdjustmentForm('),players.indexOf('    function playersPage()')),scope);
  vm.runInContext(account.slice(account.indexOf('      function auditWorkspace('),account.indexOf('      function admin()')),scope);
  return {scope,root,calls,messages,global};
}
(async () => {
  const denied=fixture(false,false);denied.scope.manualRatingAdjustmentForm(denied.root);denied.scope.auditWorkspace(denied.root);
  assert.equal(denied.root.children.length,0);assert.equal(denied.calls.length,0);
  const f=fixture();f.scope.manualRatingAdjustmentForm(f.root);
  const find=id=>walk(f.root).find(n=>n.id===id);
  const form=walk(f.root).find(n=>n.tag==='form');
  await fire(form,'submit');assert.equal(f.calls.length,0);
  find('manual-rating-player').value=player;find('manual-rating-amount').value='.25';
  find('manual-rating-reason').value='fixture reason';find('manual-rating-effective').value='2026-10-07T12:00';
  let resolve;
  f.scope.reply=()=>new Promise(r=>resolve=r);
  const pending=fire(form,'submit');await flush();
  assert(find('manual-rating-player').disabled && f.scope.state.writeBusy);
  assert.equal(form.attributes['aria-busy'],'true');
  await fire(form,'submit');assert.equal(f.calls.length,1,'duplicate blocked');
  resolve({error:{code:'network',message:'retry'}});await pending;
  const requestId=f.calls[0].payload.p_request_id;
  f.scope.reply=()=>({data:{success:true,player_id:player,adjustment_id:'confirmed'}});
  await fire(form,'submit');assert.equal(f.calls[1].payload.p_request_id,requestId,'same payload retries same key');
  assert.equal(f.calls[1].name,'record_rating_adjustment_active');assert(!f.scope.state.writeBusy);
  assert(text(f.global).includes('Đã ghi điều chỉnh Rating'));
  const stale=fixture();stale.scope.manualRatingAdjustmentForm(stale.root);
  for (const [id,value] of [['manual-rating-player',player],['manual-rating-amount','.5'],['manual-rating-reason','reason'],['manual-rating-effective','2026-10-07T12:00']]) walk(stale.root).find(n=>n.id===id).value=value;
  stale.scope.reply=()=>new Promise(r=>resolve=r);
  const old=fire(walk(stale.root).find(n=>n.tag==='form'),'submit');await flush();
  stale.scope.state.session.user.id='another';resolve({data:{success:true,player_id:player,adjustment_id:'x'}});await old;
  assert.equal(stale.global.textContent,'','stale success ignored');
  const a=fixture();a.scope.auditWorkspace(a.root);assert.equal(a.calls.length,0,'lazy load');
  a.scope.open();await flush();assert.equal(a.calls[0].name,'get_audit_events');
  assert(text(a.root).includes('Không có thao tác'));
  a.scope.reply=(name,p)=>({data:{events:[{id:'x',created_at:'now',actor_id:null,action:'OTHER',entity_type:'OTHER',target_id:null,summary:'safe'}],page_size:30,offset:p.p_offset,has_more:true}});
  const retry=walk(a.root).find(n=>n.textContent==='Tải lại');await fire(retry,'click');
  const next=walk(a.root).find(n=>n.textContent==='Sau →');assert(!next.disabled);
  await fire(next,'click');assert.equal(a.calls.at(-1).payload.p_offset,30);
  a.scope.reply=()=>({data:{events:[{id:'x',summary:'safe',new_data:{password:'SECRET'}}],page_size:30,offset:30,has_more:false}});
  await fire(retry,'click');assert(a.messages.at(-1).error);assert(!text(a.root).includes('SECRET'),'unexpected payload rejected');
  a.scope.reply=()=>({error:{code:'PGRST202'}});await fire(retry,'click');assert(a.messages.at(-1).text.includes('chưa sẵn sàng'));
  assert(a.calls.every(call=>call.name==='get_audit_events'));
  console.log('PASS WP-C9A workflow UI: real form functions; exact-cap denial; canonical delta RPC/idempotent retry/busy/stale guards; lazy safe Audit pages/contract rejection/error; no table access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
