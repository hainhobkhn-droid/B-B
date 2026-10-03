"""PLAYER-PERMISSION01 browser fixture.
Local-only full app using real index.html/app.js/players.js/app.css.
No production credentials or network requests.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import re

repo = Path(__file__).resolve().parents[2]

MODES = {
    "A": dict(role="MEMBER", members=True,  players=False, lifecycle=False),
    "B": dict(role="MEMBER", members=False, players=True,  lifecycle=False),
    "C": dict(role="MEMBER", members=False, players=False, lifecycle=True),
    "D": dict(role="MEMBER", members=True,  players=True,  lifecycle=False),
    "E": dict(role="MEMBER", members=False, players=True,  lifecycle=True),
    "F": dict(role="ADMIN",  members=False, players=False, lifecycle=False),
}

def sdk(mode):
    cfg = MODES.get(mode, MODES["A"])
    role = cfg["role"]
    members = str(cfg["members"]).lower()
    players = str(cfg["players"]).lower()
    lifecycle = str(cfg["lifecycle"]).lower()

    return f"""
window.SUPABASE_URL='https://example.invalid';
window.SUPABASE_ANON_KEY='public-test';

const profile={{
  id:'actor-{mode}',
  full_name:'Tài khoản PLAYER-PERMISSION01 {mode}',
  login_name:'fixture_{mode.lower()}',
  role:'{role}',
  is_active:true,
  membership_status:'APPROVED',
  player_id:'fixture-player',
  must_change_password:false,
  can_manage_members:{members},
  can_manage_players:{players},
  can_manage_player_lifecycle:{lifecycle},
  can_adjust_rating:false,
  can_collect_fund:false,
  can_collect_tournament_fee:false,
  can_approve_matches:false,
  can_manage_tournaments:false,
  can_manage_fund:false,
  can_view_audit:false
}};

const player={{
  id:'fixture-player',
  full_name:'VĐV Fixture PLAYER-PERMISSION01',
  phone:'0900000000',
  date_of_birth:'1990-01-01',
  joined_at:'2026-01-01',
  status:'ACTIVE',
  player_type:'CLUB',
  initial_rating:4,
  current_rating:4,
  notes:''
}};

const guest={{
  id:'fixture-guest',
  full_name:'Guest Fixture',
  phone:'0900000001',
  date_of_birth:'1991-01-01',
  joined_at:'2026-01-02',
  status:'ACTIVE',
  player_type:'GUEST',
  initial_rating:4,
  current_rating:4,
  notes:''
}};

const session={{user:{{id:profile.id,email:'fixture@example.invalid'}}}};

function resultForRpc(name) {{
  if(name==='get_player_directory') return [player,guest];
  if(name==='get_member_management_players') return [player,guest];
  if(name==='get_signup_rating_config')
    return {{initial_rating:4,min_rating:2,max_rating:8}};
  if(name==='get_admin_member_promotion_candidates')
    return [{{profile_id:'member-target',full_name:'Member Target',player_id:null}}];
  if(name==='get_admin_member_promotion_preview')
    return {{
      profile_id:'member-target',
      guest_player_id:'fixture-guest',
      allowed:true
    }};
  if(name==='get_player_lifecycle_preview')
    return {{
      player_id:'fixture-player',
      current_status:'ACTIVE',
      reference_total:0,
      hard_delete_allowed:true
    }};
  return [];
}}

function query(table, rpc) {{
  let data =
    table==='profiles' ? profile :
    table==='players' ? [player,guest] :
    rpc ? resultForRpc(rpc) :
    [];

  let single=false;

  const q=new Proxy({{}},{{
    get:(_,key)=>{{
      if(key==='single'||key==='maybeSingle')
        return ()=>{{single=true;return q;}};

      if(key==='then')
        return (resolve,reject)=>Promise.resolve({{
          data: single && table==='profiles'
            ? profile
            : single && table==='players'
              ? player
              : data,
          error:null
        }}).then(resolve,reject);

      return ()=>q;
    }}
  }});

  return q;
}}

window.supabase={{
  createClient:()=>({{
    from:table=>query(table,null),
    rpc:(name,args)=>Promise.resolve({{
      data:resultForRpc(name),
      error:null
    }}),
    auth:{{
      onAuthStateChange:()=>({{
        data:{{subscription:{{unsubscribe(){{}}}}}}
      }}),
      getSession:async()=>({{data:{{session}},error:null}}),
      getUser:async()=>({{data:{{user:session.user}},error:null}}),
      signOut:async()=>({{error:null}})
    }}
  }})
}};
"""

def full_html(mode):
    html=(repo/"index.html").read_text(encoding="utf8")
    html=re.sub(r'<script src="https:[^"]+"></script>','',html)
    html=html.replace(
        '<script src="./config.js"></script>',
        f'<script src="/mock-sdk.js?mode={mode}"></script>'
    )

    auto = """
<script>
window.addEventListener('load',()=>{
  const tryOpen=()=>{
    const button=document.querySelector('[data-page="players"]');
    if(button){
      button.click();
      document.documentElement.dataset.permissionFixtureReady='1';
    }else{
      setTimeout(tryOpen,25);
    }
  };
  setTimeout(tryOpen,25);
});
</script>
"""
    html=html.replace("</body>",auto+"</body>")
    return html

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed=urlparse(self.path)
        path=parsed.path
        qs=parse_qs(parsed.query)
        mode=qs.get("mode",["A"])[0].upper()

        if mode not in MODES:
            mode="A"

        if path=="/full":
            content=full_html(mode).encode("utf8")
            typ="text/html"
        elif path=="/mock-sdk.js":
            content=sdk(mode).encode("utf8")
            typ="text/javascript"
        elif path in ["/app.js","/matches.js","/players.js","/fund.js","/account.js"]:
            content=(repo/path.lstrip("/")).read_bytes()
            typ="text/javascript"
        elif path=="/app.css":
            content=(repo/"app.css").read_bytes()
            typ="text/css"
        elif path=="/logo.jpg":
            content=(repo/"logo.jpg").read_bytes()
            typ="image/jpeg"
        else:
            self.send_error(404)
            return

        self.send_response(200)
        self.send_header("Content-Type",typ+"; charset=utf-8")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "connect-src 'none'; "
            "img-src 'self' data:; "
            "font-src 'self'"
        )
        self.end_headers()
        self.wfile.write(content)

    def log_message(self,*args):
        pass

if __name__=="__main__":
    print(
        "PLAYER-PERMISSION01 fixture: "
        "http://127.0.0.1:8766/full?mode=A",
        flush=True
    )
    ThreadingHTTPServer(("127.0.0.1",8766),Handler).serve_forever()