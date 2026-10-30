"""Synthetic-only actual Supabase user-worker proof. No credentials or project API access."""
import json,os,pathlib,shutil,subprocess,tempfile,time,urllib.request,urllib.error
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
 for part in ['main','control','probe']:(root/'functions'/part).mkdir(parents=True)
 probe=root/'functions/probe';shutil.copytree(SOURCE/'native',probe/'native')
 shutil.copyfile(SOURCE/'edge-probe.ts',probe/'index.ts');shutil.copyfile(SOURCE/'synthetic-goldens.json',probe/'synthetic-goldens.json')
 (root/'functions/main/index.ts').write_text('''Deno.serve(async(req)=>{
  const name=new URL(req.url).pathname.split('/')[1];
  if(name==='health')return Response.json({ready:true});
  if(!['probe','control'].includes(name))return new Response('NOT_FOUND',{status:404});
  try{const worker=await EdgeRuntime.userWorkers.create({servicePath:'/proof/functions/'+name,memoryLimitMb:256,workerTimeoutMs:150000,cpuTimeSoftLimitMs:2000,cpuTimeHardLimitMs:2000,noModuleCache:false,forceCreate:new URL(req.url).searchParams.get('cold')==='1',envVars:[],staticPatterns:['/proof/functions/probe/synthetic-goldens.json'],context:{useReadSyncFileAPI:true}});return await worker.fetch(req);}
  catch(e){console.log('NATIVE_ROUTER_ERROR '+(e?.name||'Error'));return Response.json({error:e?.name||'Error'},{status:String(e?.name).includes('Cancelled')?546:503});}
 });''')
 (root/'functions/control/index.ts').write_text('''Deno.serve(req=>{if(new URL(req.url).pathname.endsWith('/cpu')){const t=performance.now();while(performance.now()-t<2500){}}return Response.json({control:true});});''')
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
 assert code==200 and body.get('ok') and body['passed']==35,'CONTRACT_FAILED'
 result['cpu_control_status']=request('control/cpu')[0]
 assert result['cpu_control_status']==546,'CPU_BUDGET_NOT_ENFORCED'
 result['no_unexpected_5xx']=all(c['status']==200 for c in result['checks'])
 result['pass']=result['health'] and result['no_unexpected_5xx']
except Exception as e:result['pass']=False;result['failure']=str(e)
finally:
 if created:
  (SOURCE/'native-runtime-container.log').write_text(cmd(['docker','logs',name],False).stdout+cmd(['docker','logs',name],False).stderr)
  cmd(['docker','rm','-f',name],False)
 if net:cmd(['docker','network','rm',network],False)
 shutil.rmtree(root)
 (SOURCE/'native-runtime-result.json').write_text(json.dumps(result,indent=2)+'\n')
 print('NATIVE_RESULT_JSON='+json.dumps(result,separators=(',',':')))
 if not result.get('pass'):raise SystemExit(1)
