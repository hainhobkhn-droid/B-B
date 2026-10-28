'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const D=__dirname,ROOT=path.resolve(D,'../..'),runtime=path.join(ROOT,'_releases',process.env.PICK_TEST_RELEASE||'ui-refinement-r2-20261028-v1'),checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};
class El {
 constructor(tag,text='',className=''){Object.assign(this,{tag,textContent:text||'',className,children:[],events:{},attributes:{},dataset:{},value:'',isConnected:true});this.classList={add:(...n)=>this.className+=' '+n.join(' ')};}
 append(...n){this.children.push(...n);}replaceChildren(...n){this.children=[...n];}
 setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,v){this.events[k]=v;}focus(){this.focused=true;}
 all(){return [this,...this.children.flatMap(n=>n.all())];}
}
const el=(...a)=>new El(...a),button=(t,f,c)=>{const e=el('button',t,c);e.events.click=f;return e;};
const window={};vm.runInNewContext(fs.readFileSync(path.join(runtime,'member-leaderboards.js'),'utf8'),{window,Intl,console});const api=window.PickClubLeaderboards;
const flush=()=>new Promise(r=>setImmediate(r));const clone=x=>JSON.parse(JSON.stringify(x));
function payload(board='rating',page=1,size=20,search=''){
 let rows=Array.from({length:25},(_,i)=>({rank:i+1,display_name:`Nguyễn Đặng Thành Viên Có Tên Dài ${i+1}`,metric:board==='rating'?5-i/100:1500000000000-i*1000,rating:5-i/100,match_count:25-i,is_current:i===12}));
 const own=rows[12];if(search)rows=rows.filter(x=>x.display_name.includes(search));const total=rows.length,pages=Math.max(1,Math.ceil(total/size));page=Math.min(page,pages);
 return {board,page,page_size:size,total,total_ranked:25,total_pages:pages,algorithm_version:'V1.1',minimum_matches:5,current_member:{eligible:true,...own},rows:rows.slice((page-1)*size,page*size)};
}
function mount({board='rating',error=false,hold=false,current=()=>true,empty=false}={}){
 const root=el('main'),calls=[];let resolve,failed=error;
 const client={rpc(name,args){calls.push({name,args});return {then(ok,bad){if(hold){resolve=()=>{hold=false;ok({data:payload(args.p_board,args.p_page,args.p_page_size,args.p_search||''),error:null});};return;}const data=payload(args.p_board,args.p_page,args.p_page_size,args.p_search||'');if(empty){data.rows=[];data.total=data.total_ranked=0;data.total_pages=1;data.current_member={eligible:false};}ok(failed?{data:null,error:{message:'private@example.invalid'}}:{data,error:null});}};}};
 const stop=api.mount({root,client,board,el,button,panel:(title,parent)=>{const s=el('section');s.append(el('h2',title));parent.append(s);return s;},isCurrent:current});
 return {root,calls,stop,resolve:()=>resolve(),recover:()=>failed=false,nodes:()=>root.all(),text:()=>root.all().map(n=>n.textContent).join(' '),btn:t=>root.all().find(n=>n.tag==='button'&&n.textContent===t)};
}
(async()=>{
 const a=mount({board:'contribution'});await flush();
 check('recognition spotlight renders top three',a.nodes().filter(n=>n.className.includes('contribution-spotlight-card')).length===3);
 check('own contribution hero',a.nodes().some(n=>n.className.includes('contribution-own-hero'))&&a.text().includes('Bạn đang xếp hạng #13 / 25'));
 check('one bounded request without spotlight query',a.calls.length===1&&a.calls[0].args.p_page_size===20);
 check('full paged list preserved',a.nodes().filter(n=>n.className.includes('club-leaderboard-row')).length===20);
 check('current highlight retained',a.nodes().some(n=>n.attributes['aria-current']==='true'));
 check('initial avatar uses existing identity primitive',a.nodes().some(n=>n.className.includes('topbar-avatar')&&n.attributes['aria-hidden']==='true'));
 check('no pressure microcopy',!a.text().includes('đóng thêm')&&!a.text().includes('kém'));
 a.btn('Trang sau').events.click();await flush();
 check('page2 global own rank unchanged',a.text().includes('#13 / 25')&&a.text().includes('#21'));
 check('no page-relative spotlight',!a.nodes().some(n=>n.className.includes('contribution-spotlight-card')));
 check('pagination not extra calls',a.calls.length===2&&a.calls[1].args.p_page===2);
 const r=mount();await flush();check('rating remains plain',!r.nodes().some(n=>n.className.includes('contribution-spotlight-card')||n.className.includes('contribution-own-hero')));
 const empty=mount({board:'contribution',empty:true});await flush();
 check('zero unranked no fake recognition',empty.text().includes('Bạn chưa đủ điều kiện')&&!empty.nodes().some(n=>n.className.includes('contribution-spotlight-card')));
 check('positive empty copy',empty.text().includes('Cùng ra sân'));
 const root=el('main');const two=payload('contribution');two.total=two.total_ranked=2;two.total_pages=1;two.rows=two.rows.slice(0,2);two.current_member={eligible:false};
 api.mount({root,client:{rpc(){return {then(ok){ok({data:two,error:null});}}}},board:'contribution',el,button,panel:(t,p)=>{const s=el('section');p.append(s);return s;},isCurrent:()=>true});await flush();
 check('less than3 no incomplete podium',!root.all().some(n=>n.className.includes('contribution-spotlight-card')));
 check('less than3 actual rows retained',root.all().filter(n=>n.className.includes('club-leaderboard-row')).length===2);
 const tied=payload('contribution');tied.rows[0].rank=1;tied.rows[1].rank=1;tied.rows[2].rank=3;tied.rows[0].display_name='<img src=x onerror=alert(1)> Nguyễn rất dài';
 const tieRoot=el('main');api.mount({root:tieRoot,client:{rpc(){return {then(ok){ok({data:tied,error:null});}}}},board:'contribution',el,button,panel:(t,p)=>{const s=el('section');p.append(s);return s;},isCurrent:()=>true});await flush();
 const spotlight=tieRoot.all().filter(n=>n.className.includes('contribution-spotlight-card'));
 check('ties use actual server rank',spotlight.map(n=>n.all().map(x=>x.textContent).join(' ')).join('|').includes('#1')&&spotlight[1].all().some(n=>n.textContent==='#1'));
 check('long malicious name is text only',spotlight[0].all().some(n=>n.textContent===tied.rows[0].display_name));
 check('no invented rank gap metric',!a.text().includes('cách hạng')&&!a.text().includes('cần thêm'));
 console.log('PASS',checks.length,'contribution refinement checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
