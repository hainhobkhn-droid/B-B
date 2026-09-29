"""Local UI fixture using real app.js functions and app.css, with offline RPC doubles.
Run from anywhere: python iam05d-ui-fixture.py. Open http://127.0.0.1:8765.
No production config, credentials, Supabase SDK, or network requests are loaded.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
repo=Path(__file__).resolve().parents[2]

def extract(source,name):
    start=source.index('      function '+name+'(')
    end=source.index('\n      }',start)+8
    return source[start:end]

def fixture():
    source=(repo/'app.js').read_text(encoding='utf8')
    names=['el','button','notice','panel','badge','accountAction','membershipLabel',
           'memberApprovalStatus','adminMemberApproval','adminMemberLifecycle']
    functions='\n'.join(extract(source,n) for n in names)
    return '''<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IAM05D Local Verification</title><link rel="stylesheet" href="/app.css">
<body style="padding:16px;margin:0"><section class="panel"><h1>IAM05D — kiểm thử local</h1>
<label for="scenario">Kịch bản</label><select class="field" id="scenario"><option>ADMIN</option><option>PENDING</option><option>REJECTED</option><option>APPROVED</option></select>
<div class="form-actions"><button class="btn" id="hold">Giữ phản hồi kế tiếp</button><button class="btn" id="release">Trả phản hồi</button><button class="btn" id="stale">Đổi phiên</button></div>
<p id="counts" role="status"></p></section><main id="content"></main><div id="global-message"></div>
<script>
const $=id=>document.getElementById(id), upper=x=>String(x||'').toUpperCase(), raw=x=>x??'—';
const date=x=>x?new Date(x).toLocaleDateString('vi-VN'):'—';
const state={profile:{id:'admin',role:'ADMIN',is_active:true,membership_status:'APPROVED'},session:{user:{id:'admin'}},generation:1,writeBusy:false};
const isAdmin=()=>state.profile.role==='ADMIN'&&state.profile.is_active===true;
const explain=()=> 'Vui lòng thử lại.';
let reads=0,writes=0,hold=false,release=null;
let members=[];
function updateCounts(){ $('counts').textContent='RPC đọc: '+reads+' • RPC ghi: '+writes+' • Đang chờ: '+Boolean(release); }
function resetMembers(){ members=[1,2].map(n=>({profile_id:'member-'+n,full_name:'Nguyễn Hoàng Minh Anh tên rất dài kiểm tra giao diện thành viên '+n,login_name:'member_'+n,email:'verylongemailaddresswithoutspacesfortesting'+n+'@example.invalid',phone:'0900000000',date_of_birth:'1990-01-01',initial_rating:4.25,current_rating:4.25,created_at:'2026-09-28T10:00:00Z',player_id:'00000000-0000-0000-0000-00000000000'+n,membership_status:'PENDING',is_active:false,player_status:'ACTIVE',player_type:'CLUB',delegated_permissions_count:0})); }
const client={rpc:async(name,args)=>{
 let result;
 if(name.startsWith('get_')){reads++;result={data:name==='get_admin_pending_member_signups'?members.filter(m=>m.membership_status==='PENDING').map(m=>({...m})):members.map(m=>({...m})),error:null};}
 else {writes++;const m=members.find(m=>m.profile_id===args.p_profile_id);
 if(!m||m.membership_status!=='PENDING') result={data:null,error:{message:'SIGNUP_NOT_PENDING'}};
 else {m.membership_status=name==='admin_approve_member_signup'?'APPROVED':'REJECTED';m.is_active=m.membership_status==='APPROVED';result={data:{success:true},error:null};}}
 if(hold){hold=false;updateCounts();await new Promise(resolve=>{release=resolve;updateCounts()});release=null;}
 updateCounts();return result;
}};
const query=async q=>q;
function load(){ render();return Promise.resolve(); }
''' + functions + '''
function render(){
 $('content').replaceChildren();
 const root=el('div',null,'account-ui');$('content').append(root);
 if(state.profile.role==='ADMIN'){
 accountAction(root,'Duyệt thành viên mới',adminMemberApproval,'success');
 accountAction(root,'Vòng đời tài khoản thành viên',adminMemberLifecycle);
 }else if(['PENDING','REJECTED'].includes(state.profile.membership_status)) memberApprovalStatus(root);
 else root.append(el('p','Đã duyệt — tiếp tục luồng MEMBER bình thường.','notice success'));
 updateCounts();
}
$('scenario').addEventListener('change',()=>{state.generation++;const mode=$('scenario').value;state.profile={id:mode==='ADMIN'?'admin':'member',role:mode==='ADMIN'?'ADMIN':'MEMBER',is_active:['ADMIN','APPROVED'].includes(mode),membership_status:mode==='ADMIN'?'APPROVED':mode};state.session.user.id=state.profile.id;state.writeBusy=false;reads=0;writes=0;resetMembers();render();});
$('hold').onclick=()=>{hold=true;};$('release').onclick=()=>{release?.();};$('stale').onclick=()=>{state.generation++;render();};
resetMembers();render();
</script></body></html>'''

def sdk():
    return '''window.SUPABASE_URL='https://example.invalid';window.SUPABASE_ANON_KEY='public-test';
const mode=new URLSearchParams(location.search).get('mode')||'PENDING';
const profile={id:'test-user',full_name:'Thành viên kiểm thử local',role:mode==='ADMIN'?'ADMIN':'MEMBER',is_active:['APPROVED','ADMIN'].includes(mode),membership_status:mode==='ADMIN'?'APPROVED':mode,player_id:null,must_change_password:false};
const session={user:{id:'test-user',email:'test@example.invalid'}};
let businessReads=0;
function log(){let p=document.getElementById('mock-read-count');if(!p){p=document.createElement('p');p.id='mock-read-count';document.body.append(p);}p.textContent='LOCAL ONLY — business reads: '+businessReads;}
function query(table,rpc){
 if(table!=='profiles'&&rpc!=='get_signup_rating_config'){businessReads++;log();}
 const data=table==='profiles'?profile:rpc==='get_signup_rating_config'?{initial_rating:4,min_rating:2,max_rating:8}:[];
 const q=new Proxy({}, {get:(_,key)=>key==='then'?((resolve,reject)=>Promise.resolve({data,error:null}).then(resolve,reject)):(()=>q)});return q;
}
window.supabase={createClient:()=>({from:table=>query(table),rpc:name=>query(null,name),auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),signOut:async()=>({error:null})}})};
addEventListener('DOMContentLoaded',log);
'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0]=='/app.css':
            content=(repo/'app.css').read_bytes();typ='text/css'
        elif self.path.split('?')[0]=='/':
            content=fixture().encode('utf8');typ='text/html'
        elif self.path.split('?')[0]=='/full':
            html=(repo/'index.html').read_text(encoding='utf8')
            html=re.sub(r'<script src="https:[^"]+"></script>','',html)
            html=html.replace('<script src="./config.js"></script>','<script src="/mock-sdk.js"></script>')
            content=html.encode('utf8');typ='text/html'
        elif self.path.split('?')[0]=='/mock-sdk.js':
            content=sdk().encode('utf8');typ='text/javascript'
        elif self.path.split('?')[0] in ['/app.js','/matches.js','/players.js','/fund.js']:
            content=(repo/self.path.split('?')[0].lstrip('/')).read_bytes();typ='text/javascript'
        else:
            self.send_error(404);return
        self.send_response(200)
        self.send_header('Content-Type',typ+'; charset=utf-8')
        self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'")
        self.end_headers();self.wfile.write(content)
    def log_message(self,*args): pass

if __name__=='__main__':
    print('Offline IAM05D fixture: http://127.0.0.1:8765',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()
