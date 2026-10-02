const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(path.join(__dirname,'../../account.js'),'utf8');
const a=s.indexOf('      function accountMemberPageRows('),b=s.indexOf('      function adminMemberLifecycle',a),ctx={};vm.createContext(ctx);vm.runInContext(s.slice(a,b),ctx);
const data=[{full_name:'Nguyễn An',login_name:'an',membership_status:'PENDING',is_active:false},
{full_name:'Bình',login_name:'binh',membership_status:'APPROVED',is_active:true,email:'b@example.invalid'},
{full_name:'Cường',membership_status:'APPROVED',is_active:false},{full_name:'Dung',membership_status:'REJECTED',is_active:false},
{full_name:'Missing',is_active:false}];
const f=(term='',member='',active='')=>ctx.accountMemberPageRows(data,term,member,active);
assert.equal(f().length,5);assert.equal(f(' NGUYỄN ').length,1);assert.equal(f('BINH').length,1);assert.equal(f('@example').length,1);
assert.equal(f('','APPROVED','false')[0].full_name,'Cường');assert.equal(f('','PENDING').length,1);assert.equal(f('','REJECTED').length,1);
assert.equal(f('','APPROVED').length,2);assert.equal(f('','', 'false').length,4);assert.equal(f('unknown').length,0);
const workspace=s.slice(b,s.indexOf('      function adminCreateMember',b));assert(workspace.includes('const pageSize = 25;'));
assert(!workspace.includes("'member-lifecycle-target'"));assert(workspace.includes('get_admin_member_lifecycle'));
console.log('PASS ACC04 page-local search/filter, missing-membership semantics, 25-row primary directory/no selector');
