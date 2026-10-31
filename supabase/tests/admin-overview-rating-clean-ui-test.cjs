'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/hainh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const repo=path.resolve(process.env.PICK_ASSET_ROOT || path.join(__dirname,'../../_releases/admin-overview-rating-20261031-v1'));
const source=fs.readFileSync(path.join(repo,'account.js'),'utf8');
const start=source.indexOf('      function adminSystemConfig(');
const code=source.slice(start,source.indexOf('\n      }',start)+8);
const app=fs.readFileSync(path.join(repo,'app.js'),'utf8');
const dashboard=app.slice(app.indexOf('      function overviewManagementWorkspace('),app.indexOf('      function memberOverview('));
const out=path.resolve(__dirname,'../../analysis/admin-overview-rating-clean');fs.mkdirSync(out,{recursive:true});
async function mount(page,role='ADMIN') {
 await page.setContent('<html lang="vi"><body><main id="content"></main><div id="global-message"></div></body></html>');
 await page.addStyleTag({content:fs.readFileSync(path.join(repo,'app.css'),'utf8')});
 await page.evaluate(({code,role})=>{
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const state={profile:{role,is_active:true},session:{user:{id:'actor'}},errors:{},partial:{},writeBusy:false,busy:false};
  const ctx={state,el,isAdmin:()=>state.profile.role==='ADMIN',ready:()=>true,
   rows:t=>t==='players'?[{initial_rating:2},{initial_rating:8}]:t==='rating_match_weights'?[{match_type:'FRIENDLY',weight:1}]:t==='rating_settings'?[{algorithm_version:'V1.1'}]:[],
   panel(title,root){const n=el('section');n.append(el('h2',title));root.append(n);return n;},
   accountAction(root,title,render){const d=el('details'),body=el('div');d.append(el('summary',title),body);root.append(d);render(body);return d;},
   activeRatingSettings:()=>({algorithm_version:'V1.1',is_active:true}),number:String,raw:v=>v??'',badge:v=>el('span',v),
   notice(n,text,error){n.textContent=text;n.hidden=!text;n.className=error?'notice error':'notice';},
   explain:e=>'Không thực hiện được yêu cầu (mã '+e.code+').',load:async()=>{},render(){ctx.rendered=true;},$:id=>document.getElementById(id),
   calls:[],reply:{data:{success:true}},client:{async rpc(name,args){ctx.calls.push({name,args});return ctx.reply;}}};
  window.fixture=ctx;new Function('ctx','with(ctx){'+code+';adminSystemConfig(document.getElementById("content"));}')(ctx);
 },{code,role});
 if(role==='ADMIN')await page.locator('details').filter({has:page.locator('#admin-rating-version')}).locator('summary').click();
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mount(page);await page.locator('#admin-rating-version').fill('V-test');
 await page.locator('#admin-rating-min').fill('3');
 await page.locator('#admin-rating-max').fill('7');
 await page.locator('#admin-rating-version').locator('xpath=ancestor::form').locator('button[type=submit]').click();
 assert.equal(await page.evaluate(()=>fixture.calls.length),0,'out-of-range existing players must be explained before write');
 assert.match(await page.locator('.notice.error').innerText(),/điểm khởi tạo.*2.*8/iu);
 console.log('PASS existing-player range validation');
 const submit=()=>page.locator('#admin-rating-version').locator('xpath=ancestor::form').locator('button[type=submit]').click();
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900});await mount(page);
  await page.locator('#admin-rating-version').fill('V-test');
  await page.evaluate(()=>fixture.reply={error:{code:'P0001',message:'Có player.initial_rating nằm ngoài min/max mới'}});
  await submit();assert.match(await page.locator('.notice.error').innerText(),/giảm điểm tối thiểu.*tăng điểm tối đa/iu);
  assert.equal(await page.locator('#admin-rating-version').inputValue(),'V-test');
  assert.equal(await page.evaluate(()=>fixture.state.writeBusy),false);
  assert.equal(await page.locator('#admin-rating-version').isDisabled(),false);
  await page.evaluate(()=>fixture.reply={error:{code:'P0001',message:'algorithm_version V-test đã tồn tại'}});
  await submit();assert.match(await page.locator('.notice.error').innerText(),/Tên phiên bản đã tồn tại/u);
  await page.locator('#admin-rating-version').fill('V-retry');
  await page.evaluate(()=>fixture.reply={data:{success:true}});
  await submit();assert.match(await page.locator('#global-message').innerText(),/Đã tạo và kích hoạt/u);
  const calls=await page.evaluate(()=>fixture.calls);
  assert.equal(calls[2].name,'admin_create_rating_settings_version');
  assert.equal(calls[2].args.p_min_rating,2);assert.equal(calls[2].args.p_max_rating,8);
  assert.equal(calls[2].args.p_algorithm_version,'V-retry');
  assert.equal(Object.keys(calls[2].args).length,11,'RPC signature remains unchanged');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'rating form overflow '+width);
  await page.screenshot({path:path.join(out,'rating-'+width+'.png'),fullPage:true});
 }
 await mount(page);await page.locator('#admin-rating-version').fill('V-pending');
 await page.evaluate(()=>fixture.client.rpc=(name,args)=>{fixture.calls.push({name,args});return new Promise(resolve=>window.complete=resolve);});
 await submit();await page.evaluate(()=>document.querySelector('#admin-rating-version').closest('form').dispatchEvent(new Event('submit',{cancelable:true})));
 assert.equal(await page.evaluate(()=>fixture.calls.length),1,'busy duplicate submit blocked');
 await page.evaluate(()=>{fixture.state.session.user.id='another';window.complete({data:{success:true}});});
 await page.waitForFunction(()=>!fixture.state.writeBusy);
 assert.equal(await page.evaluate(()=>!!fixture.rendered),false,'stale session must not render success');
 for(const role of ['MEMBER','DELEGATED']){await mount(page,role);assert.equal(await page.locator('#admin-rating-version').count(),0);}
 console.log('PASS rating: defaults/signature, backend range/duplicate feedback, retry, busy/stale guards, non-ADMIN denial, desktop/mobile');
 for(const role of ['ADMIN','DELEGATED','MEMBER'])for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:900});
  await page.setContent('<html lang="vi"><body><main id="content"></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync(path.join(repo,'app.css'),'utf8')});
  await page.evaluate(({dashboard,role})=>{
   const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
   const state={session:{user:{id:'actor'}},generation:1,fundCollectionBalancesReady:true,fundCollectionBalances:[{amount_remaining:200},{amount_remaining:0}]};
   const allowed=()=>role!=='MEMBER';
   const ctx={state,el,isAdmin:()=>role==='ADMIN',number:String,upper:v=>String(v||'').toUpperCase(),ready:()=>true,rows:()=>[{status:'PENDING'},{status:'APPROVED'}],
    canApproveMatches:allowed,canManagePlayers:()=>false,canManagePlayerLifecycle:()=>false,canAdjustRating:()=>false,
    canManageFund:allowed,canCollectFund:allowed,canManageTournaments:()=>false,canCollectTournamentFee:()=>false,
    button(text,fn,cls){const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;},
    panel(title,root){const s=el('section',null,'panel');s.append(el('h2',title));root.append(s);return s;},navigate:(page,intent)=>{ctx.navigation={page,intent};},
    calls:0,reply:{data:Array.from({length:5},(_,i)=>({profile_id:'p'+i,membership_status:'PENDING'}))},client:{async rpc(name,args){ctx.calls++;if(name!=='get_admin_pending_member_signups'||args.p_limit!==5)throw Error('wrong pending RPC');return ctx.reply;}}};
   window.dashboardFixture=ctx;new Function('ctx','with(ctx){'+dashboard+';ctx.rerender=()=>{document.getElementById("content").replaceChildren();overviewManagementWorkspace(document.getElementById("content"));};ctx.rerender();}')(ctx);
  },{dashboard,role});
  const cards=page.locator('.overview-management-card');assert.equal(await cards.count(),role==='ADMIN'?3:role==='DELEGATED'?2:0);
  assert.equal(await page.getByText('Xem nhanh hồ sơ',{exact:true}).count(),0);
  assert.equal(await page.locator('details').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'dashboard overflow '+role+width);
  if(role==='ADMIN'){
   const member=cards.filter({hasText:'Thành viên chờ duyệt'});await page.waitForFunction(()=>document.querySelector('.overview-management-value').textContent==='5+');
   assert.equal(await member.locator('button:visible').count(),1);
   await member.getByRole('button',{name:'Mở hồ sơ chờ duyệt →',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>dashboardFixture.navigation),{page:'admin',intent:{kind:'ops-member-pending'}});
   assert.equal(await page.evaluate(()=>dashboardFixture.calls),1);
   for(const card of await cards.all()){
    const metrics=await card.evaluate(n=>({height:n.getBoundingClientRect().height,button:n.querySelector('button').getBoundingClientRect().height}));
    assert(metrics.height<180,'compact card height '+JSON.stringify(metrics));assert(metrics.button>=44,'touch target');
   }
   await page.screenshot({path:path.join(out,'dashboard-'+width+'.png'),fullPage:true});
   await page.evaluate(()=>{dashboardFixture.state.opsPendingSignups=null;dashboardFixture.reply={error:{code:'network'}};dashboardFixture.rerender();});
   await page.getByRole('button',{name:'Thử lại',exact:true}).waitFor({state:'visible'});
   assert.match(await member.innerText(),/Chưa tải được/u);
   await page.evaluate(()=>dashboardFixture.reply={data:[]});await page.getByRole('button',{name:'Thử lại',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.overview-management-value').textContent==='0');
   assert.equal(await member.locator('button:visible').count(),1);
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS dashboard: roles, bounded 5+ summary, no preview, navigation, unavailable/retry, compact/touch targets, 1280/390/320; no browser exceptions');

}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
