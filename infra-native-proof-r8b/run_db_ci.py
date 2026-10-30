from pathlib import Path
import json,os,subprocess,time
D=Path(__file__).resolve().parent;image='postgres@'+json.loads((D/'postgres-image.json').read_text())['digest'];name='r8b-rebind-'+os.environ['GITHUB_RUN_ID'];created=False
try:
 subprocess.run(['docker','pull',image],capture_output=True,check=True,timeout=180)
 subprocess.run(['docker','run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image],capture_output=True,check=True);created=True
 for _ in range(60):
  if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('DISPOSABLE_PG_NOT_READY')
 env=dict(os.environ,R8B_TEST_PSQL=json.dumps(['docker','exec','-i',name,'psql','-X','-w','-U','postgres']),R8B_R8_MANIFEST=str(Path(os.environ['GITHUB_WORKSPACE'])/'infra-native-proof-r8/candidate-lock.json'))
 subprocess.run(['python3',str(D/'test_rebind.py')],env=env,check=True,timeout=240)
finally:
 if created:subprocess.run(['docker','rm','-fv',name],capture_output=True,check=True)
