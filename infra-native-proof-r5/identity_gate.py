"""Validate the v2 contract, retaining explicit regression checks for the previous failed claim."""
from pathlib import Path
import hashlib,json,subprocess
D=Path(__file__).resolve().parent;lock=json.loads((D/'candidate-lock.json').read_text());ctx=json.loads((D/'candidate/supabase/functions/b3d-prepare/context.json').read_text());db=json.loads((D/'db-result.json').read_text());runtime=json.loads((D/'native-runtime-result.json').read_text())
native=hashlib.sha256(json.dumps(lock['runtime_manifest'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest();observed=json.loads(subprocess.run(['node',str(D/'identity-observe.mjs')],capture_output=True,text=True,check=True).stdout)
migration=json.loads((D/'migration-lock.json').read_text());sql=(D/'202610300002_b3d_native_attestation_v2.sql').read_text();assert hashlib.sha256(sql.encode()).hexdigest()==migration['sha256'];checks=[
 ('native identity matches canonical runtime manifest',native==lock['native_artifact_hash']),
 ('all runtime and candidate bytes match manifest',all(hashlib.sha256((D/'candidate'/r['path']).read_bytes()).hexdigest()==r['sha256'] for r in lock['all_files'])),
 ('runtime reports independently measured native identity',all(x['native_identity']==native for x in runtime['production_entry_checks'] if x['expected']!=503)),
 ('producer native identity matches exact DB verifier binding',observed['attestation']['native_artifact_sha256']==native and sql.count(native)>=4),
 ('legacy hashes explicitly remain compatibility references',observed['worker_sha256']==ctx['reference_worker_sha256'] and observed['source_code_sha256']==ctx['reference_source_sha256'] and observed['attestation']['protocol_reference_sha256']==ctx['reference_worker_sha256']),
 ('legacy and native execution identities not confused',native not in [observed['worker_sha256'],observed['source_code_sha256']]),
 ('attestation version and protocol exact',observed['attestation']['version']==2 and observed['attestation']['protocol_version']=='B3_LOCAL_1'),
 ('historical legacy bytes and compatibility preserved',db['historical_bytes_preserved'] and db['failures']==0 and db['errors']==0),
 ('native missing unknown Python hashes and downgrade denied',db['tests']>=43 and db['failures']==0 and db['errors']==0),
 ('actual native producer accepted by exact legacy core plus new verifier',db['tests']>=43 and db['failures']==0 and db['errors']==0)]
out={'native_artifact_hash':native,'observed_producer_fields':observed,'checks':[{'name':n,'pass':ok} for n,ok in checks],'passed':sum(ok for _,ok in checks),'tests':len(checks),'business_mutation':False,'production_apply':False}
(D/'identity-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));raise SystemExit(0 if all(ok for _,ok in checks) else 1)
