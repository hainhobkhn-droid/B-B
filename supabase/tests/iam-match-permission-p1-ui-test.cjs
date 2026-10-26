const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const W=path.resolve(__dirname,'../../_releases/iam-match-permission-p1-20261026-v1');const matches=fs.readFileSync(path.join(W,'matches.js'),'utf8'),app=fs.readFileSync(path.join(W,'app.js'),'utf8');let checks=0;
function check(x){assert(x);checks++}
function extract(name){const start=matches.indexOf('      function '+name+'(');assert(start>=0);const next=matches.indexOf('\n      function ',start+1);return matches.slice(start,next);}
for(const admin of [false,true])for(const approver of [false,true]){
 let touched=0;const s={isAdmin:()=>admin,canApproveMatches:()=>approver,memberMatchEntryOpen:()=>false,state:{profile:{role:admin?'ADMIN':'MEMBER'}},actionAccordion:()=>{touched++;throw Error('BOUNDARY_PASSED')},panel:()=>{touched++;throw Error('BOUNDARY_PASSED')},rows:()=>{touched++;throw Error('BOUNDARY_PASSED')}};
 vm.runInNewContext(extract('createMyPendingMatchForm'),s);s.createMyPendingMatchForm({});check(touched===0);
 vm.runInNewContext(extract('replacementMatchForm'),s);try{s.replacementMatchForm({});check(!admin)}catch(e){check(admin);check(e.message==='BOUNDARY_PASSED')};check(admin?touched===1:touched===0);
}
check(app.includes('const memberMatchEntryOpen = () => false;'));check(matches.includes('preplay?.mount(actionRoot, {allowCreate: memberMatchEntryOpen()})'));
check(/isAdmin\(\) &&\s*status ===\s*'VOIDED'/.test(matches));
const replacement=extract('replacementMatchForm');check(/if \(!isAdmin\(\)\) \{\s*return;/.test(replacement));check(!replacement.includes('if (!canApproveMatches()) return;'));
check(matches.includes('approvePendingMatchForm('));check(matches.includes('confirm_match_by_opponent'));check(matches.includes('reject_match_by_opponent'));
// Run the real pre-play module: CLOSED mount must not offer a form or trigger network.
const preplay=fs.readFileSync(path.join(W,'preplay.js'),'utf8');let network=0,rendered=0;const storage={getItem:()=>null,setItem(){},removeItem(){}};const ctx={window:{},localStorage:storage,crypto:{randomUUID:()=> 'fixture'},console};vm.runInNewContext(preplay,ctx);
const api=ctx.window.PickPreplay.create({state:{profile:{id:'u',role:'MEMBER',player_id:'p'}},el:()=>{rendered++;throw Error('unexpected creation UI')},client:{rpc:()=>{network++;throw Error('unexpected RPC')}},load:()=>{},render:()=>{},notice:()=>{},button:()=>{},actionAccordion:()=>{rendered++;throw Error('unexpected creation UI')}});
api.mount({append(){throw Error('unexpected form')}},{allowCreate:false});check(network===0);check(rendered===0);
console.log(JSON.stringify({suite:'IAM frontend permission',checks,pass:true,productionMutation:false}));
