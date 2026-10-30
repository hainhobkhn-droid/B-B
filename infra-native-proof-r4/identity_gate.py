"""Fail closed: an independent receipt is not permission to relabel Python execution hashes."""
from pathlib import Path
import hashlib,json,subprocess
D=Path(__file__).resolve().parent;lock=json.loads((D/'candidate-lock.json').read_text());ctx=json.loads((D/'candidate/supabase/functions/b3d-prepare/context.json').read_text())
native=hashlib.sha256(json.dumps(lock['runtime_manifest'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
observation=json.loads(subprocess.run(['node',str(D/'identity-observe.mjs')],capture_output=True,text=True,check=True).stdout)
checks=[{'name':'native_artifact_hash equals canonical runtime manifest','pass':native==lock['native_artifact_hash']},
 {'name':'every runtime file matches exact candidate manifest','pass':all(hashlib.sha256((D/'candidate'/r['path']).read_bytes()).hexdigest()==r['sha256'] for r in lock['runtime_manifest'])},
 {'name':'all candidate files committed or deterministically reconstructed','pass':all((D/'candidate'/r['path']).is_file() for r in lock['all_files'])},
 {'name':'legacy and native identity distinguished in receipt','pass':native not in [ctx['reference_worker_sha256'],ctx['reference_source_sha256']]},
 {'name':'runtime legacy-worker field identifies actual native execution','pass':observation['worker_sha256']==native,'reason':'observed actual producer output is compared to independent native artifact identity; no value is relabeled'}]
out={'native_artifact_hash':native,'protocol_reference_hash':ctx['reference_worker_sha256'],'legacy_source_hash':ctx['reference_source_sha256'],'observed_producer_fields':observation,'protocol_version':'B3_LOCAL_1','tests':len(checks),'passed':sum(r['pass'] for r in checks),'checks':checks,'native_execution_claim_authorized':False,'deployment_allowed':False,'secret_logged':False}
(D/'identity-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));raise SystemExit(0 if all(c['pass'] for c in checks) else 1)
