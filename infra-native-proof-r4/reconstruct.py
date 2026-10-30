"""Reconstruct byte-exact private context using already-public pinned source data.
Never print context or upload it as an artifact. No secret/API/network dependency.
"""
from pathlib import Path
import hashlib,json,os
D=Path(__file__).resolve().parent;REPO=Path(os.environ.get('GITHUB_WORKSPACE',D.parents[3]));lock=json.loads((D/'candidate-lock.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in lock['public_inputs']:
 raw=(REPO/row['path']).read_bytes();assert sha(raw)==row['sha256'], 'PUBLIC_INPUT_HASH_DRIFT'
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==row['git_blob_sha1'],'PUBLIC_INPUT_BLOB_DRIFT'
descriptor=(D/'context-descriptor.json').read_bytes();assert sha(descriptor)==lock['context_descriptor_sha256'];c=json.loads(descriptor)
context={'identity':c['identity'],'frozen':json.loads((REPO/'analysis/rating-calibration01-b/frozen_candidates.json').read_bytes()),'baseline':json.loads((REPO/'analysis/rating-calibration01-a/dataset.json').read_bytes()),'config':c['config'],'reference_worker_sha256':c['reference_worker_sha256'],'reference_source_sha256':c['reference_source_sha256']}
raw=(json.dumps(context,ensure_ascii=False,indent=2)+'\n').encode();assert sha(raw)==lock['context_sha256'],'EXACT_CONTEXT_RECONSTRUCTION_FAILED'
target=D/'candidate/supabase/functions/b3d-prepare/context.json';target.write_bytes(raw)
for row in lock['all_files']:assert sha((D/'candidate'/row['path']).read_bytes())==row['sha256'],'CANDIDATE_FILE_DRIFT'
assert sha(''.join(r['sha256']+'  '+r['path']+'\n' for r in lock['all_files']).encode())==lock['candidate_sha256']
assert sha(json.dumps(lock['runtime_manifest'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==lock['native_artifact_hash']
print(json.dumps({'reconstruction_pass':True,'candidate_sha256':lock['candidate_sha256'],'native_artifact_hash':lock['native_artifact_hash'],'runtime_files_verified':len(lock['runtime_manifest']),'all_files_verified':len(lock['all_files']),'context_contents_logged':False}))
