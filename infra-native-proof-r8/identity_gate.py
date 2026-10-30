from pathlib import Path
import hashlib,json,subprocess
D=Path(__file__).resolve().parent;lock=json.loads((D/'candidate-lock.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
observed=json.loads(subprocess.check_output(['node',str(D/'identity-observe.mjs')],text=True))
raw=(D/'candidate/supabase/functions/b3d-prepare/context-embedded.ts').read_text().split('export const contextText = ',1)[1].removesuffix(';\n')
decoded=json.loads(raw).encode();context=json.loads(decoded);native=lock['native_artifact_hash'];a=observed['attestation']
checks={
 'runtime_identity':sha(json.dumps(lock['runtime_manifest'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==native,
 'all_candidate_bytes':all(sha((D/'candidate'/x['path']).read_bytes())==x['sha256'] for x in lock['all_files']),
 'aggregate':sha(''.join(x['sha256']+'  '+x['path']+'\n' for x in lock['all_files']).encode())==lock['candidate_sha256'],
 'context_source_exact':sha(decoded)==lock['context_sha256'],
 'no_external_context':not list((D/'candidate').rglob('context.json')),
 'producer_identity':a['native_artifact_sha256']==native,
 'protocol_exact':a['protocol_version']=='B3_LOCAL_1' and a['version']==2,
 'legacy_worker_preserved':observed['worker_sha256']==context['reference_worker_sha256']==a['protocol_reference_sha256'],
 'legacy_source_preserved':observed['source_code_sha256']==context['reference_source_sha256']==a['reference_source_sha256'],
 'identity_not_relabelled':native not in [context['reference_worker_sha256'],context['reference_source_sha256']],
}
out={'checks':checks,'passed':sum(checks.values()),'tests':len(checks),'native_artifact_hash':native,'db_verifier_changed':False,'production_verifier_authorizes_new_identity':False}
(D/'identity-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));assert all(checks.values())
