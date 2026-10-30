from pathlib import Path
import json,os,subprocess,time,hashlib
D=Path(__file__).resolve().parent;image='postgres@'+json.loads((D/'postgres-image.json').read_text())['digest'];name='p1r5-verifier-'+os.environ['GITHUB_RUN_ID'];created=False
def cmd(args):return subprocess.run(args,capture_output=True,text=True,check=True,timeout=180)
try:
 cmd(['docker','pull',image]);cmd(['docker','run','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=True
 ready=False
 for _ in range(60):
  if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode==0:ready=True;break
  time.sleep(1)
 assert ready,'LOCAL_TEST_PG_NOT_READY'
 psql=['docker','exec','-i',name,'psql','-X','-w','-U','postgres'];subprocess.run(psql+['-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;'],capture_output=True,check=True)
 lock=json.loads((D/'candidate-lock.json').read_text());migration=json.loads((D/'migration-lock.json').read_text());assert hashlib.sha256((D/Path(migration['file']).name).read_bytes()).hexdigest()==migration['sha256'];assert migration['approved_native_artifact_sha256']==lock['native_artifact_hash'];env=dict(os.environ,B3D_TEST_PSQL=json.dumps(psql),B3D_TEST_NATIVE_HASH=lock['native_artifact_hash'],B3D_TEST_MIGRATION=str(D/'202610300002_b3d_native_attestation_v2.sql'))
 subprocess.run(['python3',str(D/'test_db.py')],env=env,check=True,timeout=180)
finally:
 if created:subprocess.run(['docker','rm','-fv',name],capture_output=True,check=True)
