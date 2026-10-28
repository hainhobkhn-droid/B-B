'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const D=__dirname,ROOT=path.resolve(D,'../..'),release=process.env.PICK_TEST_RELEASE||'system-review-r1-20261028-v1',runtime=path.join(ROOT,'_releases',release),checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};
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
 check('module exists',!!api);
 const p=payload();check('public DTO accepted',api.validate(p,'rating',20)===p);
 for(const key of ['email','phone','date_of_birth','audit_actor','player_id','notes']){const bad=clone(p);bad.rows[0][key]='private';assert.throws(()=>api.validate(bad,'rating',20));checks.push('reject private field '+key);}
 for(const bad of [{...p,total_ranked:0},{...p,rows:[{...p.rows[0],rank:0}]},{...p,total_pages:10},{...p,current_member:{eligible:false,rank:0}},{...p,rows:[{...p.rows[0],metric:NaN}]}]){assert.throws(()=>api.validate(bad,'rating',20));checks.push('reject malformed DTO '+checks.length);}
 const a=mount();check('loading displayed',a.text().includes('Đang tải'));check('controls locked while pending',a.nodes().filter(n=>n.tag==='input'||n.tag==='select').every(n=>n.disabled));await flush();
 check('thenable SDK no catch works',a.calls.length===1&&a.calls[0].name==='get_member_club_leaderboard');
 check('own rank summary N/X',a.text().includes('Bạn đang xếp hạng #13 / 25 trong CLB'));
 check('current row highlighted',a.nodes().some(n=>n.attributes['aria-current']==='true'&&n.className.includes('is-current')));
 check('multiple eligible rows',a.nodes().filter(n=>n.className.includes('club-leaderboard-row')).length===20);
 check('no identifiers rendered',!a.text().includes('player_id')&&!a.text().includes('UUID'));
 check('bounded page request',a.calls[0].args.p_page_size===20);
 a.btn('Trang sau').events.click();await flush();check('server page requested',a.calls[1].args.p_page===2);
 check('rank global not renumbered',a.text().includes('#21')&&!a.text().includes(' #1 '));
 check('own summary preserved off page',a.text().includes('#13 / 25')&&!a.nodes().some(n=>n.attributes['aria-current']==='true'));
 const sizes=a.nodes().find(n=>n.tag==='select');sizes.value='10';sizes.events.change();await flush();check('size resets to first page',a.calls.at(-1).args.p_page===1&&a.calls.at(-1).args.p_page_size===10);
 const input=a.nodes().find(n=>n.tag==='input');input.value='Không có';a.btn('Tìm').events.click();await flush();check('search sent to server',a.calls.at(-1).args.p_search==='Không có');check('filtered empty distinct',a.text().includes('Không tìm thấy VĐV phù hợp'));
 a.btn('Xóa bộ lọc').events.click();await flush();check('clear filters resets server query',a.calls.at(-1).args.p_page===1&&a.calls.at(-1).args.p_search===null);
 const zero=mount({empty:true});await flush();check('unranked no fake rank',zero.text().includes('Bạn chưa đủ điều kiện xếp hạng')&&!zero.text().includes('Bạn đang xếp hạng #'));check('real empty state',zero.text().includes('Chưa có VĐV đủ điều kiện'));
 const error=mount({error:true});await flush();check('generic error no private values',error.text().includes('Không tải được')&&!error.text().includes('private@example'));error.recover();error.btn('Thử lại').events.click();error.btn('Thử lại')?.events.click();await flush();check('retry one request and recovers',error.calls.length===2&&error.text().includes('#13 / 25'));
 const contrib=mount({board:'contribution'});await flush();check('contribution metric is currency',contrib.text().includes('₫'));check('not cash semantics',contrib.text().includes('không phải tiền đã thu'));
 const kind=contrib.nodes().find(n=>n.tag==='select');kind.value='energetic';kind.events.change();await flush();check('existing participation board retained',contrib.calls.at(-1).args.p_board==='energetic'&&contrib.text().includes('trận'));
 let active=true;const stale=mount({hold:true,current:()=>active});await flush();active=false;stale.resolve();await flush();check('stale session response discarded',!stale.text().includes('#13 / 25'));
 const disposed=mount({hold:true});await flush();disposed.stop();disposed.resolve();await flush();check('disposed response discarded',!disposed.text().includes('#13 / 25'));
 const app=fs.readFileSync(path.join(runtime,'app.js'),'utf8');check('ADMIN legacy rendering preserved',app.includes("if (!isAdmin()) { memberClubLeaderboard('rating'); break; }")&&app.includes("if (!isAdmin()) { memberClubLeaderboard('contribution'); return; }"));
 const css=fs.readFileSync(path.join(runtime,'app.css'),'utf8');check('shared root fits actual narrow client',!css.includes('min-width:320px;'));
 console.log('PASS',checks.length,'club leaderboard UI checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
