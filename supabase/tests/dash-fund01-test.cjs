// Execute the actual Dashboard Fund card block; legacy inputs deliberately disagree.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const fn=source.indexOf('function overviewManagementWorkspace');
const marker=source.indexOf('// DASH-FUND01',fn);
const start=source.lastIndexOf('        if (',marker);
const end=source.indexOf('\n        if (',marker);
const block=source.slice(start,end);
let checks=0;
function card(role,remaining,ready=true,balances){
 const cards=[];
 const context={cards,state:{fundCollectionBalancesReady:ready,fundCollectionBalances:balances===undefined?[{contribution_id:'a',amount_remaining:remaining}]:balances},
 canManageFund:()=>['ADMIN','manager'].includes(role),canCollectFund:()=>['ADMIN','collector'].includes(role),number:String,
 ready:()=>{throw Error('Legacy readiness accessed')},rows:()=>{throw Error('Legacy data accessed')}};
 vm.runInNewContext(block,context);return cards[0];
}
for(const role of ['ADMIN','manager','collector']){
 for(const [name,remaining,expected] of [['unpaid',100000,'1'],['partial',70000,'1'],['paid',0,'0'],['refunded',40000,'1'],['recollected',0,'0'],['overpayment',0,'0']]){
  assert.equal(card(role,remaining).value,expected,role+': '+name);checks++;
 }
 for(const data of [[],[{amount_remaining:40000}]]){const c=card(role,0,false,data);assert.equal(c.value,'—');assert.equal(c.variant,'info');assert.equal(c.hint,'Chưa tải được số liệu Quỹ');checks++}
 const c=card(role,0,true,[{amount_due:5800000,net_paid:5800000,amount_remaining:'0'}]);assert.equal(c.value,'0');assert.equal(c.hint,'Không có nghĩa vụ quỹ còn phải thu.');checks++;
 assert.equal(card(role,0,true,[]).value,'0');checks++;
 for(const bad of [null,{},[{amount_remaining:null}],[{amount_remaining:'bad'}]]){assert.equal(card(role,0,true,bad).value,'—');checks++}
 assert.equal(card(role,0,true,[{amount_remaining:1},{amount_remaining:0},{amount_remaining:40}]).value,'2');checks++;
}
assert.equal(card('MEMBER',1),undefined);checks++;
console.log(`PASS DASH-FUND01: ${checks} checks; authoritative-only count, roles, unavailable, refund/recollect.`);
