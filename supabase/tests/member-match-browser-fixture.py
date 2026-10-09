"""Build a synthetic, disconnected browser fixture from current application source.
Usage: python supabase/tests/member-match-browser-fixture.py --out <temporary-dir>
All RPCs below are in-memory stubs. This is presentation evidence, not live auth.
"""
import argparse
from pathlib import Path
P=argparse.ArgumentParser();P.add_argument('--out',required=True);args=P.parse_args()
repo=Path(__file__).resolve().parents[2]
out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
app=(repo/'app.js').read_text(encoding='utf8')
shared=app[app.index('      function el('):app.index('      // WP-C7 CONTENT FOCUS START')]
shared+=app[app.index('      // WP-C8 SHARED LIST START'):app.index('      // WP-C8 SHARED LIST END')]
shared+=app[app.index('      // MATCH LOOKUP SHARED RECORDS START'):app.index('      const col =')]
bootstrap=r'''
const $=id=>document.getElementById(id),raw=x=>x==null?'':String(x);
const fold=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
const state={generation:1,data:{leagues:[],tournaments:[]},errors:{},profile:{id:'B1',role:'MEMBER',player_id:'B1'},session:{user:{id:'B1'}}};
const players=['A1','A2','B1','B2','C1'].map(id=>({id,full_name:id+' Nguyễn Tên dài để kiểm tra hiển thị trên màn hình điện thoại',status:'ACTIVE',player_type:'CLUB',current_rating:4}));
const matches=Array.from({length:28},(_,i)=>({id:'m'+i,match_number:i+1,created_by:i%2?'B1':'A1',created_at:'2026-10-09T03:00:00Z',played_at:'2026-10-09T04:00:00Z',match_type:i%2?'CLUB_RATED':'TRAINING',score_mode:'POINTS',team_a_score:11,team_b_score:7,status:i<2?'PENDING':i===2?'PENDING':'APPROVED',opponent_rejected_by:i===2?'B1':null,opponent_rejection_reason:i===2?'Tỷ số chưa đúng':null}));
matches[0].match_type='CLUB_RATED'; matches[1].match_type='CLUB_RATED'; matches[2].created_by='A1';
const lineups=matches.flatMap(m=>players.slice(0,4).map((p,i)=>({id:m.id+p.id,match_id:m.id,player_id:p.id,partner_player_id:players[i^1].id,team:i<2?'A':'B'})));
const rows=t=>t==='players'?players:t==='matches'?matches:t==='match_players'?lineups:[];
const isAdmin=()=>state.profile.role==='ADMIN',canApproveMatches=()=>isAdmin()||state.profile.id==='DELEGATE';
const pick=(o,...keys)=>keys.map(k=>o[k]).find(x=>x!=null),matchCode=m=>'Trận #'+m.match_number;
const actorTeam=id=>id[0]==='A'?'A':id[0]==='B'?'B':null;
const calls=[];
const client={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='get_my_matches')return {data:{player_id:state.profile.player_id,matches:state.profile.player_id==='C1'?[]:matches.map(m=>({...m,my_team:actorTeam(state.profile.id),opponent_rejected:!!m.opponent_rejected_by,rejection_reason:m.opponent_rejection_reason,players:players.slice(0,4).map(p=>({...p,team:actorTeam(p.id)}))}))}};
  if(name==='get_my_pending_match_confirmations')return {data:matches.filter(m=>m.status==='PENDING'&&actorTeam(state.profile.id)).map(m=>({match_id:m.id,created_by:m.created_by,can_confirm:actorTeam(m.created_by)!==actorTeam(state.profile.id)&&!m.opponent_rejected_by,opponent_rejected_by:m.opponent_rejected_by,opponent_rejection_reason:m.opponent_rejection_reason}))};
  if(name==='get_match_creator_context')return {data:matches.map(m=>({match_id:m.id,creator_name:m.created_by+' Original Member',match_created_at:m.created_at}))};
  if(['confirm_match_by_opponent','approve_match_active'].includes(name)){
    await new Promise(resolve=>setTimeout(resolve,700));const m=matches.find(m=>m.id===args.p_match_id);m.status='APPROVED';return {data:{success:true}};
  }
  if(name==='reject_match_by_opponent'){const m=matches.find(m=>m.id===args.p_match_id);m.opponent_rejected_by=state.profile.id;m.opponent_rejection_reason=args.p_reason;return {data:{success:true}};}
  if(name==='update_my_rejected_pending_match')return {data:{success:true}};
  if(name==='resubmit_my_rejected_match'){const m=matches.find(m=>m.id===args.p_match_id);m.opponent_rejected_by=null;return {data:{success:true}};}
  return {data:[],error:null};
}};
'''
finish=r'''
const panel=(title,parent=$('content'))=>{const s=el('section',null,'panel');s.append(el('h2',title));parent.append(s);return s;};
const number=x=>String(x??'—'),badge=value=>el('span',value,'status '+String(value).toLowerCase());
const matchCols=[['Mã trận',matchCode],['Thời gian',m=>new Date(m.played_at).toLocaleString('vi-VN')],['Đội A',()=>players.slice(0,2).map(p=>p.full_name).join(' + ')],['Tỷ số',m=>`${m.team_a_score} – ${m.team_b_score}`],['Đội B',()=>players.slice(2,4).map(p=>p.full_name).join(' + ')],['Thể thức',m=>m.match_type],['Trạng thái',m=>badge(m.status)]];
const api=window.PickMatches.create({$,state,client,isAdmin,canApproveMatches,button,actionAccordion,paginatedList,matchLookupList,matchLookupDate,panel,el,rows,raw,pick,notice,
  load:async()=>{},render:()=>draw(),explain:e=>e.message||String(e),sources:()=>{},recent:data=>data,table,tableRecords,matchCols,matchCode});
function draw(){ $('content').replaceChildren();api.matchesPage(); }
$('identity').addEventListener('change',event=>{const id=event.target.value;state.profile={id,role:id==='ADMIN'?'ADMIN':'MEMBER',player_id:['ADMIN','DELEGATE'].includes(id)?null:id};state.session.user.id=id;draw();});
window.addEventListener('error',event=>{$('fixture-error').textContent=event.message;});
draw();
'''
html='''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Match presentation fixture — no production</title><link rel="stylesheet" href="app.css"><body><main style="max-width:1100px;margin:auto;padding:16px"><h1 id="page-title" tabindex="-1">Match fixture · Không kết nối production</h1><label>Fixture identity <select id="identity">'''
html+=''.join(f'<option {"selected" if i=="B1" else ""}>{i}</option>' for i in ['A1','A2','B1','B2','C1','DELEGATE','ADMIN'])
html+='''</select></label><p id="fixture-error"></p><div id="global-message"></div><div id="notice-status" role="status" aria-live="polite" class="sr-only"></div><div id="notice-alert" role="alert" class="sr-only"></div><div id="content"></div></main><script>'''+bootstrap+shared+'</script><script src="matches.js"></script><script>'+finish+'</script></body></html>'
(out/'index.html').write_text(html,encoding='utf8')
for name in ['app.css','matches.js']:(out/name).write_bytes((repo/name).read_bytes())
print(out/'index.html')
