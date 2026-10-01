const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const start=source.indexOf('      function membershipLabel(member)');
const end=source.indexOf('      function memberApprovalStatus',start);
const el=(tag,text,cls)=>({tag,text,cls,children:[],append(...items){this.children.push(...items)}});
const ctx={el};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const flatten=x=>[x.text||'',...x.children.map(flatten)].join(' ');
for(const [status,label] of [['PENDING','Chờ duyệt'],['APPROVED','Đã duyệt'],['REJECTED','Đã từ chối']]){
 const m={profile_id:'private-profile-id',player_id:'private-player-id',membership_status:status,is_active:false,player_status:'ACTIVE'};
 const box=ctx.accountMemberSummary(m,0),text=flatten(box);
 assert(text.includes(label)&&text.includes('Ngừng hoạt động')&&text.includes('Đang tham gia'));
 assert(!flatten(box.children[2]).includes('private-')); // UUIDs only in details.
 assert.equal(box.children[3].tag,'details');
}
const missing=ctx.accountMemberSummary({is_active:false,player_id:'player'},0);
assert(flatten(missing).includes('Không xác định trạng thái duyệt'));
assert(!flatten(missing).includes('Đã duyệt'));
assert(flatten(missing).includes('Chưa được cung cấp trong danh sách'));
console.log('PASS ACC03 membership/account/Player independence, missing fields and UUID disclosure');
