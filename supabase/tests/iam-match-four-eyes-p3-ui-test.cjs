const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const D=__dirname,T=process.env.PICK_TEST_RELEASE||path.resolve(D,'../../_releases/iam-match-self-approval-p3-20261027-v1'),src=fs.readFileSync(path.join(T,'matches.js'),'utf8');
function extract(name){const a=src.indexOf('      function '+name+'(');assert(a>=0,name+' must exist');let b=src.indexOf('\n      function ',a+1);return src.slice(a,b<0?undefined:b)}
class El{constructor(tag,text='',className=''){Object.assign(this,{tag,textContent:text||'',className:className||'',children:[],events:{},attributes:{},dataset:{},value:'',isConnected:true});this.classList={add(){},toggle(){}}}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n}setAttribute(k,v){this.attributes[k]=v}addEventListener(k,f){this.events[k]=f}all(){return[this,...this.children.flatMap(n=>n.all())]}querySelector(s){return this.all().find(n=>n.id===s.slice(1))}focus(){}scrollIntoView(){}}
let checks=[];function check(n,v){assert(v,n);checks.push(n)}
function fixture({admin=false,approve=true,creator='other',slot=-1,linked=true,legacy=false}={}){
 const match={id:'match',created_by:legacy?null:creator,status:'PENDING',played_at:'2026-10-27',match_number:112,team_a_score:15,team_b_score:9,score_mode:'POINTS'};
 const assignments=Array.from({length:4},(_,i)=>({match_id:'match',player_id:'p'+i,team:i<2?'A':'B'}));
 let calls=[],records=[match];const el=(...a)=>new El(...a),root=el('main');const scope={el,document:{createElement:el},state:{profile:{id:'actor',role:admin?'ADMIN':'MEMBER',player_id:linked?(slot<0?'outside':'p'+slot):null}},isAdmin:()=>admin,canApproveMatches:()=>approve,raw:v=>v??'',rows:n=>n==='matches'?records:n==='match_players'?assignments:n==='players'?Array.from({length:4},(_,i)=>({id:'p'+i,full_name:'Player '+i,status:'ACTIVE'})):[],Date,Map,Set,Option:class extends El{constructor(t,v){super('option',t);this.value=v}},window:{confirm:()=>true},notice:(n,t)=>n.textContent=t,panel:(t,p)=>{let n=el('section',t);p.append(n);return n},button:(t,f,c)=>{let n=el('button',t,c);n.events.click=f;return n},prepareMatchFormLayout(){},matchCode:()=> '271026-0112',explain:e=>e.message||String(e),load:async()=>{},render(){},client:{rpc:(name,args)=>{calls.push({name,args});return{then:r=>Promise.resolve({data:{success:true}}).then(r)}}}};
 vm.createContext(scope);for(const n of ['canPrivilegedReviewMatch','rejectPendingMatchForm','approvePendingMatchForm'])vm.runInContext(extract(n),scope);
 return{scope,root,calls,match,assignments,replace:rows=>records=rows};
}
(async()=>{
 for(const action of ['approvePendingMatchForm','rejectPendingMatchForm']){
  for(const kind of ['creator','A1','A2','B1','B2']){const f=fixture({creator:kind==='creator'?'actor':'other',slot:['A1','A2','B1','B2'].indexOf(kind)});f.scope[action](f.root);check(action+' '+kind+' has no mutation form',!f.root.all().some(n=>n.tag==='form'));}
  for(const kind of ['unrelated','admin creator','admin participant','legacy unrelated','unlinked unrelated']){const f=fixture({admin:kind.startsWith('admin'),creator:kind==='admin creator'?'actor':'other',slot:kind==='admin participant'?2:-1,legacy:kind.startsWith('legacy'),linked:!kind.startsWith('unlinked')});f.scope[action](f.root);check(action+' '+kind+' retains form',f.root.all().some(n=>n.tag==='form'));}
  const f=fixture();f.scope[action](f.root);const nodes=f.root.all();nodes.find(n=>n.tag==='select').value='match';let reason=nodes.find(n=>n.tag==='textarea');if(reason)reason.value='independent review';await nodes.find(n=>n.tag==='form').events.submit({preventDefault(){}});check(action+' independent submit one RPC',f.calls.length===1);
  const stale=fixture();stale.scope[action](stale.root);let ns=stale.root.all();ns.find(n=>n.tag==='select').value='match';let r=ns.find(n=>n.tag==='textarea');if(r)r.value='stale';stale.match.created_by='actor';await ns.find(n=>n.tag==='form').events.submit({preventDefault(){}});check(action+' stale creator blocks RPC',stale.calls.length===0);
 }
 for(let i=0;i<4;i++)check('participant slot '+i+' policy denied',!fixture({slot:i}).scope.canPrivilegedReviewMatch({id:'match',created_by:'other'}));
 const f=fixture();check('unknown creator metadata fails closed',!f.scope.canPrivilegedReviewMatch({id:'match'}));check('null legacy creator unrelated allowed',f.scope.canPrivilegedReviewMatch({id:'match',created_by:null}));f.scope.state.profile.id=null;check('missing actor denied',!f.scope.canPrivilegedReviewMatch({id:'match',created_by:null}));
 check('create capability alone never approves',!fixture({approve:false}).scope.canPrivilegedReviewMatch({id:'match',created_by:'other'}));
 check('record action guard uses same policy',src.includes("if (canPrivilegedReviewMatch(match)) {\n                actions.append("));
 check('openAction cannot bypass policy',src.includes("(action === 'approve' || action === 'reject') && !canPrivilegedReviewMatch(match)"));
 console.log('PASS four-eyes UI '+checks.length);
})().catch(e=>{console.error(e);process.exitCode=1});
