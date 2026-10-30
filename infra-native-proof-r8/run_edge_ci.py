"""Synthetic-only actual Supabase user-worker proof. No credentials or project API access."""
import json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request,urllib.error,re
SOURCE=pathlib.Path(__file__).resolve().parent
IMAGE='supabase/edge-runtime@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8'
root=pathlib.Path(tempfile.mkdtemp(prefix='native-edge-',dir=os.environ['RUNNER_TEMP']));root.chmod(0o755)
name='native-edge-'+os.environ['GITHUB_RUN_ID'];network=name+'-net';created=False;net=False
result={'synthetic_only':True,'secrets_used':False,'business_archive_uploaded':False,'production_or_gcp_requests':0,'deployed':False,'image':IMAGE,'memory_mb':256,'cpu_soft_ms':2000,'cpu_hard_ms':2000,'network':'internal Docker network, no Internet egress','checks':[]}
def cmd(args,check=True):
 p=subprocess.run(args,capture_output=True,text=True,timeout=180)
 if check and p.returncode:raise RuntimeError('COMMAND_FAILED_'+args[0]+':'+p.stderr[-1000:])
 return p
try:
 for part in ['main','control','probe','production-on','production-off']:(root/'functions'/part).mkdir(parents=True)
 probe=root/'functions/probe';shutil.copytree(SOURCE/'native',probe/'native')
 shutil.copyfile(SOURCE/'edge-probe.ts',probe/'index.ts');shutil.copyfile(SOURCE/'synthetic-goldens.json',probe/'synthetic-goldens.json')
 (root/'functions/main/index.ts').write_text('''Deno.serve(async(req)=>{
  const name=new URL(req.url).searchParams.get('ci_worker')??new URL(req.url).pathname.split('/')[1];
  if(name==='health')return Response.json({ready:true});
  if(!['probe','control','production-on','production-off'].includes(name))return new Response('NOT_FOUND',{status:404});
  try{const worker=await EdgeRuntime.userWorkers.create({servicePath:'/proof/functions/'+name,maybeEszip:name.startsWith('production-')?await Deno.readFile('/proof/bundles/'+name+'.eszip'):undefined,maybeEntrypoint:name.startsWith('production-')?'file:///proof/functions/'+name+'/index.ts':undefined,memoryLimitMb:256,workerTimeoutMs:150000,cpuTimeSoftLimitMs:2000,cpuTimeHardLimitMs:2000,noModuleCache:false,forceCreate:new URL(req.url).searchParams.get('cold')==='1',envVars:name.startsWith('production-')?[['SUPABASE_URL','https://bflwaqlvnesuqoyikxar.supabase.co'],['SUPABASE_ANON_KEY','SYNTHETIC_ONLY_NOT_SECRET'],['SUPABASE_SERVICE_ROLE_KEY','SYNTHETIC_ONLY_NOT_SECRET'],['B3D_PREPARE_ENABLED',name==='production-on'?'true':'false'],['B3D_NATIVE_ARTIFACT_SHA256','268af0f676deac886b45187c616232ff94b0dcb6200940e2c26431a959ebb4b0']]:[],staticPatterns:['/proof/functions/probe/synthetic-goldens.json'],context:{useReadSyncFileAPI:true}});return await worker.fetch(req);}
  catch(e){console.log('NATIVE_ROUTER_ERROR '+(e?.name||'Error')+' '+String(e?.message||'').slice(0,200));return Response.json({error:e?.name||'Error'},{status:String(e?.name).includes('Cancelled')?546:503});}
 });''')
 (root/'functions/control/index.ts').write_text('''Deno.serve(req=>{if(new URL(req.url).pathname.endsWith('/cpu')){const t=performance.now();while(performance.now()-t<2500){}}return Response.json({control:true});});''')
 for mode in ['production-on','production-off']:
  work=root/'functions'/mode;shutil.copytree(SOURCE/'candidate/supabase/functions/b3d-prepare',work/'candidate')
  (work/'index.ts').write_text("""// CI-only intercept; no pass-through network path. Production entry bytes unchanged.
   globalThis.fetch=async(input,init)=>{
    const url=String(input),auth=new Headers(init?.headers).get('Authorization');
    if(!url.startsWith('https://bflwaqlvnesuqoyikxar.supabase.co/'))throw Error('CI_NETWORK_FORBIDDEN');
    if(url.endsWith('/auth/v1/user'))return Response.json(auth==='Bearer invalid'?{message:'INVALID'}:{id:'abcdef01-0000-4000-8000-000000000001'},{status:auth==='Bearer invalid'?401:200});
    if(url.endsWith('/rest/v1/rpc/get_my_rating_validation_intent')){const args=JSON.parse(init.body);return Response.json(auth==='Bearer unrelated'?{message:'DENIED'}:{intent_id:args.p_intent_id,created_at:'2026-10-09T09:00:00Z',sealed:true,started:false,missed_or_void:false},{status:auth==='Bearer unrelated'?403:200});}
    throw Error('CI_PRIVATE_OR_UNKNOWN_RPC_FORBIDDEN');
   };
   await import('./candidate/index.ts');""")
 # Bundle the exact entry graph, then physically remove all production source.
 (root/'bundles').mkdir()
 cmd(['docker','pull',IMAGE])
 result['bundles']=[]
 for mode in ['production-on','production-off']:
  assert not list((root/'functions'/mode).rglob('context.json')),'EXTERNAL_CONTEXT_PRESENT'
  cmd(['docker','run','--rm','--network','none','--user',str(os.getuid())+':'+str(os.getgid()),'-v',str(root)+':/proof',IMAGE,'bundle','--entrypoint','/proof/functions/'+mode+'/index.ts','--output','/proof/bundles/'+mode+'.eszip'])
  bundle=root/'bundles'/(mode+'.eszip')
  result['bundles'].append({'mode':mode,'bytes':bundle.stat().st_size,'sha256':__import__('hashlib').sha256(bundle.read_bytes()).hexdigest()})
  shutil.rmtree(root/'functions'/mode)
 assert all(not (root/'functions'/m).exists() for m in ['production-on','production-off'])
 result['external_context_json_count']=len(list(root.rglob('context.json')))
 result['production_source_removed']=True
 for p in root.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
 cmd(['docker','pull',IMAGE]);cmd(['docker','network','create','--internal',network]);net=True
 cmd(['docker','run','-d','--name',name,'--network',network,'--cap-drop','ALL','--security-opt','no-new-privileges','-v',str(root)+':/proof:ro','-e','DENO_DIR=/tmp/deno',IMAGE,'start','--main-service','/proof/functions/main']);created=True
 ip=cmd(['docker','inspect',name,'--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}']).stdout.strip()
 def request(path):
  t=time.monotonic()
  try:
   with urllib.request.urlopen('http://'+ip+':9000/'+path,timeout=45) as r:return r.status,json.load(r),round((time.monotonic()-t)*1000,2)
  except urllib.error.HTTPError as e:
   try:body=json.loads(e.read())
   except Exception:body={'error':'NON_JSON'}
   return e.code,body,round((time.monotonic()-t)*1000,2)
 ready=False
 for _ in range(60):
  try:
   if request('health')[0]==200:ready=True;break
  except (OSError,ValueError):pass
  time.sleep(1)
 assert ready,'RUNTIME_NOT_READY'
 result['health']=request('control/health')[0]==200
 # Every case gets a forced fresh isolate, then an invocation on a reusable worker.
 cases=json.loads((SOURCE/'synthetic-goldens.json').read_text())['cases']
 for mode in ['cold','revisit']:
  for i,c in enumerate(cases):
   code,body,wall=request('probe?index='+str(i)+('&cold=1' if mode=='cold' else ''))
   result['checks'].append({'mode':mode,'name':c['name'],'status':code,'wall_ms':wall,**body})
   assert code==200 and body.get('ok'),mode+':'+c['name']+':'+str(code)
 code,body,wall=request('probe?action=contract');result['contract']={'status':code,'wall_ms':wall,**body}
 assert code==200 and body.get('ok') and body['passed']==37,'CONTRACT_FAILED'
 code,body,wall=request('probe?action=binding');result['context_binding']={'status':code,'wall_ms':wall,**body}
 assert code==200 and body.get('ok') and body['passed']==7,'CONTEXT_BINDING_FAILED'
 result['production_entry_checks']=[]
 def app_request(mode,token='owner',origin='https://hainhobkhn-droid.github.io',cold=False):
  path='functions/v1/b3d-prepare?ci_worker='+mode+('&cold=1' if cold else '');headers={'Origin':origin,'Content-Type':'application/json'}
  if token is not None:headers['Authorization']='Bearer '+token
  req=urllib.request.Request('http://'+ip+':9000/'+path,data=json.dumps({'intent_id':'abcdef04-0000-4000-8000-000000000001'}).encode(),headers=headers,method='POST');start=time.monotonic()
  try:
   with urllib.request.urlopen(req,timeout=45) as r:return r.status,json.load(r),round((time.monotonic()-start)*1000,2),r.headers.get('X-Native-Artifact-SHA256')
  except urllib.error.HTTPError as e:return e.code,json.loads(e.read()),round((time.monotonic()-start)*1000,2),e.headers.get('X-Native-Artifact-SHA256')
 for label,mode,token,origin,cold,expected in [
  ('disabled exact bootstrap','production-off','owner','https://hainhobkhn-droid.github.io',True,503),
  ('cold exact bootstrap owned sealed','production-on','owner','https://hainhobkhn-droid.github.io',True,200),
  ('revisit exact bootstrap owned sealed','production-on','owner','https://hainhobkhn-droid.github.io',False,200),
  ('missing auth','production-on',None,'https://hainhobkhn-droid.github.io',True,401),
  ('invalid auth','production-on','invalid','https://hainhobkhn-droid.github.io',True,409),
  ('unrelated owner','production-on','unrelated','https://hainhobkhn-droid.github.io',True,409),
  ('wrong origin','production-on','owner','https://wrong.invalid',True,403)]:
  code,body,wall,identity=app_request(mode,token,origin,cold);ok=code==expected and (code!=200 or set(body)=={'intent_id','created_at','sealed','started','missed_or_void'}) and (code!=503 or body.get('error')=='PREPARATION_UNAVAILABLE') and (code==503 or identity=='268af0f676deac886b45187c616232ff94b0dcb6200940e2c26431a959ebb4b0')
  result['production_entry_checks'].append({'name':label,'status':code,'expected':expected,'wall_ms':wall,'native_identity':identity,'pass':ok});assert ok,'PRODUCTION_ENTRY_FAILED:'+label+':'+str(code)
 result['production_health_checks']=[]
 for cold in [True,False]:
  code,body,wall=request('functions/v1/b3d-prepare/health?ci_worker=production-on'+('&cold=1' if cold else ''))
  ok=code==200 and body=={'status':'alive'}
  result['production_health_checks'].append({'cold':cold,'status':code,'wall_ms':wall,'pass':ok});assert ok,'EXACT_HEALTH_FAILED'
 result['exact_production_entry_pass']=True
 result['cpu_control_status']=request('control/cpu')[0]
 assert result['cpu_control_status']==546,'CPU_BUDGET_NOT_ENFORCED'
 result['no_unexpected_5xx']=all(c['status']==200 for c in result['checks'])
 result['pass']=result['health'] and result['no_unexpected_5xx']
except Exception as e:result['pass']=False;result['failure']=str(e)
finally:
 if created:
  log=cmd(['docker','logs',name],False);diagnostic=log.stdout+log.stderr
  result['runtime_diagnostics']=[re.sub(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}','[UUID]',line)[:500] for line in diagnostic.splitlines() if 'shutdown signal' not in line and any(word in line for word in ['Error','error','failed','boot','Uncaught','panicked','fatal'])][:25]
  cmd(['docker','rm','-f',name],False)
 if net:cmd(['docker','network','rm',network],False)
 shutil.rmtree(root)
 (SOURCE/'native-runtime-result.json').write_text(json.dumps(result,indent=2)+'\n')
 print('NATIVE_RESULT_JSON='+json.dumps(result,separators=(',',':')))
 if not result.get('pass'):raise SystemExit(1)
