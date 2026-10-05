const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const sourceRoot=process.argv[2] || require('path').resolve(__dirname,'../..');
const source=fs.readFileSync(sourceRoot+'/fund.js','utf8');
let checks=0;
function eq(a,b){assert.deepEqual(a,b);checks++;}
const contribution={id:'a',player_id:'p',amount_due:100000,match_id:'m',status:'DA_DONG',reason:'THUA',created_at:'2026-09-03'};
const payment={id:'pay',contribution_id:'a',player_id:'p',amount:100000,paid_at:'2026-09-03'};
const original={id:'original',payment_id:'pay',transaction_type:'THU_QUY_THUA_TRAN',amount:100000};
const refund={id:'refund',reversal_of_transaction_id:'original',payment_id:null,transaction_type:'HOAN_TIEN',amount:40000};
const num=x=>x==null?null:Number(x);
class Element{
 constructor(tag,text='',className=''){this.tag=tag;this.textContent=text??'';this.className=className||'';this.children=[];this.events={};this.attributes={};this.value='';this.dataset={};this.style={};this.classList={add(){}};}
 append(...nodes){for(const n of nodes){this.children.push(n);if(n&&typeof n==='object')n.parent=this;}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 set innerHTML(v){this.children=[];} get innerHTML(){return '';}
 get options(){return this.children;}
 addEventListener(name,fn){this.events[name]=fn;}
}

function actionAccordionFactory(make) {
  return ({
    root = null,
    title,
    semantic = 'neutral',
    group = null,
    onOpen = null,
    render = null,
    className = ''
  }) => {
    const wrapper = make('section', '', `action-accordion action-accordion-${semantic}${className ? ` ${className}` : ''}`);
    const toggle = make('button', title, 'action-accordion-toggle');
    const body = make('div', '', 'action-accordion-panel');
    const controller = {
      wrapper,
      toggle,
      body,
      title,
      setExpanded(open) {
        if (open && Array.isArray(group)) {
          group.forEach(item => item !== controller && item.setExpanded(false));
        }
        const wasOpen = !body.hidden;
        body.hidden = !open;
        toggle.attributes['aria-expanded'] = String(!!open);
        if (open && !wasOpen && onOpen) return onOpen(controller);
      }
    };
    body.hidden = true;
    toggle.type = 'button';
    toggle.addEventListener('click', () => controller.setExpanded(body.hidden));
    wrapper.append(toggle, body);
    if (Array.isArray(group)) group.push(controller);
    if (root) root.append(wrapper);
    if (render) render(body, controller);
    return controller;
  };
}

function all(n){return [n,...n.children.flatMap(c=>c instanceof Element?all(c):[])];}
function text(n){return [n.textContent,...n.children.map(c=>c instanceof Element?text(c):String(c))].join(' ');}
function mount(mode='admin',partial=false,missing=false){
 const root=new Element('main'),global=new Element('div'),grids=[],tables=[],calls=[];
 const data={fund_contributions:[{...contribution}],fund_payments:[{...payment}],fund_transactions:[{...original},{...refund}],fund_obligation_campaigns:[],players:[{id:'p',full_name:'Test Player',status:'ACTIVE'}],matches:[{id:'m',status:'APPROVED',played_at:'2026-09-03T10:00:00Z',team_a_score:11,team_b_score:9}]};
 if(mode==='collector')data.fund_transactions=[];
 const el=(tag,t,cls)=>new Element(tag,t,cls);
 const document={createElement:el,body:new Element('body')};
 const window={};vm.runInNewContext(source,{window,document,Option:function(t,v){const n=el('option',t);n.value=v;return n;},console});
 let api;
 const context={$:id=>id==='content'?root:global,state:{data,errors:{},partial:{},profile:{id:'actor',player_id:'p'},session:{user:{id:'actor'}},fundCollectionBalancesReady:!partial,fundCollectionBalances:missing?[]:[{contribution_id:'a',player_id:'p',amount_due:100000,gross_paid:100000,refunded:40000,net_paid:60000,amount_remaining:40000,computed_status:'DONG_MOT_PHAN'}],memberFundObligations:[],memberFundPaymentHistory:[],memberFundOverview:mode==='admin'?null:{total_due:100000,total_paid:60000,total_outstanding:40000,total_credit:0,total_in:100000,total_out:40000,balance:60000}},
 isAdmin:()=>mode==='admin',canManageFund:()=>['admin','manager'].includes(mode),canCollectFund:()=>['admin','collector'].includes(mode),
 el,rows:t=>data[t]||[],raw:x=>x==null?'':String(x),upper:x=>String(x||'').toUpperCase(),num,
 pick:(o,...keys)=>keys.map(k=>o[k]).find(v=>v!=null),grid:(n,items)=>grids.push(items),number:String,dateCol:()=>[],col:()=>[],money:String,moneyCol:()=>[],ready:()=>!partial,recent:x=>x,settings(){},sources(){},table:(n,title,rows)=>tables.push({title,rows}),panel(){},notice:(n,t)=>n.textContent=t,playerName:()=> 'Test Player',matchCode:()=> 'M1',
 button:(label,fn)=>{const n=el('button',label);n.events.click=fn;return n;},
 actionAccordion:actionAccordionFactory(el),
 load:async()=>{},render:()=>{root.replaceChildren();grids.length=0;tables.length=0;api.fund();},
 client:{rpc:async(name,args)=>{calls.push({name,args});
 if(name==='record_member_fund_payment'){
 context.state.fundCollectionBalances[0].net_paid+=args.p_amount;
 context.state.fundCollectionBalances[0].amount_remaining-=args.p_amount;
 return {data:{success:true,player_id:'p',requested_amount:args.p_amount,total_outstanding_after:40000-args.p_amount,allocation_count:1,allocations:[{contribution_id:'a',allocated_amount:args.p_amount,remaining:40000-args.p_amount,status:'DA_DONG'}]}};
 }
 data.fund_payments.push({...payment,id:'new',amount:args.p_amount});data.fund_transactions.push({...original,id:'newtx',payment_id:'new',amount:args.p_amount});data.fund_contributions[0].status='DA_DONG';return {data:{remaining:0,status:'DA_DONG'},error:null};}}};
 api=window.PickFund.create(context);api.fund();
 const collection=()=>all(root).find(n=>n.tag==='h3'&&n.textContent==='Thu công nợ VĐV').parent;
 const selectCollection=()=>{const wrap=collection();const selects=all(wrap).filter(n=>n.tag==='select');selects[0].value='p';selects[0].events.change();selects[1].value='a';selects[1].events.change();return wrap;};
 return {root,grids,tables,calls,collection,selectCollection,context,data};
}

// Run the actual preview comparator against timestamp/date edge cases.
const orderBlock = source.slice(source.indexOf('          // FUND04 ordering:'), source.indexOf('          // END FUND04 ordering'));
const orderScope = { rows: () => [
 {id:'m1',played_at:'2026-09-29T18:00:00Z'},
 {id:'m2',played_at:'2026-09-30T09:00:00+07:00'}
], fundCampaign: c => c.campaign_id ? {period_month:'2026-09-01'} : null };
vm.runInNewContext(orderBlock+';this.dateKey=batchDateKey;this.primary=batchPrimaryDate;this.compare=batchCompare;',orderScope);
eq(orderScope.dateKey('2026-09-29T18:00:00Z'),'2026-09-30');
eq(orderScope.dateKey('2026-09-30T01:00:00+07:00'),'2026-09-30');
eq(orderScope.primary({due_date:'2026-08-31',campaign_id:'camp',match_id:'m1'}),'2026-08-31');
eq(orderScope.primary({campaign_id:'camp',match_id:'m1'}),'2026-09-01');
eq(orderScope.primary({match_id:'m1'}),'2026-09-30');
eq(orderScope.primary({created_at:'2026-09-29T18:00:00Z'}),'2026-09-30');
// Same Bangkok source day: created_at decides, not match time within that day.
eq(orderScope.compare({id:'b',match_id:'m1',created_at:'2026-10-02T00:00:00Z'},
 {id:'a',match_id:'m2',created_at:'2026-10-01T00:00:00Z'}),1);
const dated={due_date:'2026-09-30'};
// Offset timestamps must compare by instant, not lexicographic representation.
eq(orderScope.compare({...dated,id:'a',created_at:'2026-10-01T01:00:00+07:00'},
 {...dated,id:'b',created_at:'2026-09-30T20:00:00Z'}),-1);
eq(orderScope.compare({...dated,id:'b',created_at:'2026-09-30T20:00:00.000001Z'},
 {...dated,id:'a',created_at:'2026-09-30T20:00:00.000002Z'}),-1);
eq(orderScope.compare({...dated,id:'a',created_at:'2026-10-01T03:00:00+07:00'},
 {...dated,id:'b',created_at:'2026-09-30T20:00:00Z'}),-1);
eq(orderScope.compare({...dated,id:'a',created_at:null},{...dated,id:'b',created_at:'2026-09-30T20:00:00Z'}),1);
eq(orderScope.compare({id:'a'}, {...dated,id:'b'}),1);
const batch=f=>all(f.root).find(n=>n.tag==='div'&&n.children[0]?.textContent==='Thu gộp theo VĐV');
(async()=>{
 for(const mode of ['admin','collector']){
  const f=mount(mode), b=batch(f);assert(b);checks++;
  const modeSwitch=all(f.root).find(n=>n.tag==='select'&&n.children.some(o=>o.value==='batch'));
  eq(modeSwitch.value,'batch');eq(b.hidden,false);eq(f.collection().hidden,true);
  eq(all(f.root).filter(n=>n.tag==='section'&&n.className.includes('action-accordion')&&n.children[0]?.textContent==='Thu quỹ').length,1);
  modeSwitch.value='single';modeSwitch.events.change();eq(b.hidden,true);eq(f.collection().hidden,false);
  modeSwitch.value='batch';modeSwitch.events.change();eq(b.hidden,false);eq(f.collection().hidden,true);
  const select=all(b).find(n=>n.tag==='select');select.value='p';select.events.change();
  const amount=all(b).find(n=>n.type==='number'),submit=all(b).find(n=>n.textContent==='Ghi nhận thu gộp');
  eq(amount.max,'40000');eq(amount.value,'40000');eq(submit.disabled,false);
  amount.value='40001';await submit.events.click();eq(f.calls.length,0);
  amount.value='40000';await submit.events.click();eq(f.calls.length,1);
  eq(f.calls[0].name,'record_member_fund_payment');eq(f.calls[0].args.p_amount,40000);
  eq(f.calls[0].args.p_player_id,'p');
  assert(text(f.root).includes('Đã thu 40000'));checks++;
  eq(all(batch(f)).find(n=>n.textContent==='Ghi nhận thu gộp').disabled,true);
  eq(f.tables.find(t=>t.title==='Phân bổ đã ghi nhận').rows[0].allocated_amount,40000);
 }
 for(const [partial,missing] of [[true,false],[false,true]]){
  const f=mount('collector',partial,missing),b=batch(f);
  const select=all(b).find(n=>n.tag==='select');select.value='p';select.events.change();
  eq(all(b).find(n=>n.textContent==='Ghi nhận thu gộp').disabled,true);
  assert(text(b).includes('Chưa đủ dữ liệu số dư'));checks++;
  // Single-item selector must not resurrect gross-paid collectibility.
  const single=all(f.collection()).filter(n=>n.tag==='select');
  single[0].value='p';single[0].events.change();eq(single[1].children.length,1);
 }
 for(const mode of ['manager','ordinary']){eq(batch(mount(mode)),undefined);}
 const f=mount('collector'),b=batch(f),select=all(b).find(n=>n.tag==='select');
 select.value='p';select.events.change();
 f.context.client.rpc=async()=>({error:{message:'RPC unavailable'}});
 const submit=all(b).find(n=>n.textContent==='Ghi nhận thu gộp');await submit.events.click();
 eq(submit.disabled,true);select.events.change();eq(submit.disabled,true);
 assert(text(b).includes('RPC unavailable'));checks++;
 // The actual query implementation must throw on RPC error and not publish ready=true.
 const app=fs.readFileSync(sourceRoot+'/app.js','utf8');
 const q=app.slice(app.indexOf('      async function query('),app.indexOf('\n      async function ',app.indexOf('      async function query(')+20));
 assert(q.includes('throw result.error'));checks++;
 const block=app.slice(app.indexOf('        // FUND04: collection preview'),app.indexOf('        // MP01 MEMBER FUND LOAD V1'));
 for(const mode of ['error','ok','bad']){
 const state={fundCollectionBalancesReady:false},scope={state,t:'fund_transactions',isAdmin:()=>false,canManageFund:()=>false,canCollectFund:()=>true,client:{rpc:()=>null},signal:{aborted:false},DOMException,query:async()=>{if(mode==='error')throw Error('rpc');return {data:mode==='ok'?[]:null};}};
 try{await vm.runInNewContext('(async()=>{'+block+'})()',scope);}catch{}
 eq(state.fundCollectionBalancesReady,mode==='ok');
 }
 console.log(`PASS ${checks} FUND04 UI/read-model integration assertions (DOM/RPC doubles).`);
})().catch(e=>{console.error(e);process.exitCode=1;});
