"""Exact immutable004 on a disposable post003 production-shaped catalog; no hosted calls."""
from pathlib import Path
import json,os,subprocess,hashlib
D=Path(__file__).resolve().parent;PSQL=json.loads(os.environ['R8B_TEST_PSQL']);checks=[]
lock=json.loads((D/'migration-freeze.json').read_text());migration=(D/lock['filename']).read_text();assert hashlib.sha256(migration.encode()).hexdigest()==lock['sha256']
body=migration[migration.index('BEGIN;')+6:migration.rindex('COMMIT;')]
catalog=(D/'catalog.sql').read_text();quote=lambda s:"'"+s.replace("'","''")+"'"
def call(sql):return subprocess.run(PSQL+['-d','postgres','-At','-v','ON_ERROR_STOP=1'],input="SET timezone='UTC';"+sql,capture_output=True,text=True,encoding='utf-8',timeout=180)
def run(sql):
 p=call(sql);assert p.returncode==0,p.stderr[-2500:];return p.stdout.strip().removeprefix('SET\n')
def mark(name,ok=True):assert ok,name;checks.append({'name':name,'pass':True})
def getcat():return json.loads(run(catalog))
def deny_setup(name,setup,needle):
 before=getcat();p=call('BEGIN;'+setup+body+'COMMIT;');assert p.returncode and needle in p.stderr,(name,p.stderr[-1200:]);mark(name,getcat()==before)
r8=Path(os.environ.get('R8B_R8_MANIFEST',D.parents[1]/'infra-gcp-exit-p1r8/candidate-freeze.json'));manifest=json.loads(r8.read_text());native=hashlib.sha256(json.dumps(manifest['runtime_manifest'],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest();mark('candidate manifest to verifier identity exact',native==manifest['native_artifact_hash']==lock['new_native_identity'] and manifest['candidate_sha256']==lock['candidate_sha256'])
run('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;')
run((D/'post003-fixture.sql').read_text());run((D/'seed-historical.sql').read_text())
pre=json.loads((D/'expected-pre-catalog.json').read_text());actual=getcat()
if actual!=pre:
 (D/'unexpected-fixture-catalog.json').write_text(json.dumps(actual,indent=2));raise AssertionError('POST003_FIXTURE_CATALOG_NOT_EXACT')
mark('exact production post003 catalog recognized')
before_seals=run("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM rating_validation_b3b.seals t;")
before_business=run("SELECT jsonb_build_object('matches',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.matches t),'ratings',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.rating_events t),'players',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.players t),'profiles',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.profiles t));")
old_proof=json.loads(run('BEGIN;'+(D/'old-contract-probe.sql').read_text()+'ROLLBACK;').splitlines()[-2]);mark('old native identity accepted under exact post003 state',len(old_proof)==12 and all(old_proof.values()))
deny_setup('receipt004 already present rejected',"INSERT INTO pick_deployment.migration_receipts SELECT '202610300004',migration_filename,sha256,project_ref,environment,operator_role,tool,applied_at,before_state,after_state FROM pick_deployment.migration_receipts LIMIT 1;",'REBIND_RECEIPT004_ALREADY_PRESENT')
deny_setup('receipt003 hash drift rejected',"UPDATE pick_deployment.migration_receipts SET sha256=repeat('a',64) WHERE migration_version='202610300003';",'REBIND_RECEIPT003_MISMATCH')
deny_setup('wrong project ref rejected',"ALTER TABLE rating_validation_b3b.environment_protocol DISABLE TRIGGER USER;UPDATE rating_validation_b3b.environment_protocol SET baseline_context=jsonb_set(baseline_context,'{project_ref}',to_jsonb('wrong'::text));",'REBIND_TARGET_OR_ROLE_MISMATCH')
deny_setup('existing native history blocks retirement',"DO $$DECLARE a uuid; ids uuid[]; i uuid;BEGIN PERFORM set_config('request.jwt.claim.role','service_role',true);SELECT id INTO a FROM public.profiles WHERE role='ADMIN' AND is_active AND membership_status='APPROVED' AND NOT must_change_password ORDER BY id LIMIT 1;SELECT array_agg(id ORDER BY id) INTO ids FROM (SELECT id FROM public.players WHERE status='ACTIVE' AND player_type='CLUB' ORDER BY id LIMIT 4)x;INSERT INTO rating_validation_b3b.intents(request_id,created_by,roster,match_type,score_mode)VALUES(gen_random_uuid(),a,jsonb_build_object('A',to_jsonb(ids[1:2]),'B',to_jsonb(ids[3:4])),'CLUB_RATED','POINTS')RETURNING id INTO i;PERFORM public.capture_native_rating_validation_snapshot(i);END$$;",'REBIND_NATIVE_HISTORY_PRESENT_STOP')
deny_setup('grants drift rejected',"GRANT EXECUTE ON FUNCTION public.capture_native_rating_validation_snapshot(uuid) TO authenticated;",'REBIND_POST003_CATALOG_DRIFT')
deny_setup('core source drift rejected',"DO $$BEGIN EXECUTE replace(pg_get_functiondef('rating_validation_b3b.finalize_seal_core(uuid,text)'::regprocedure),'BEGIN','BEGIN /* drift */');END$$;",'REBIND_POST003_CATALOG_DRIFT')
deny_setup('old identity CHECK drift rejected',"ALTER TABLE rating_validation_b3b.native_intents DROP CONSTRAINT native_intents_native_artifact_sha256_check;",'REBIND_POST003_CATALOG_DRIFT')
# An error after successful DDL must roll back both changed functions and CHECK.
failed=call('BEGIN;'+body+'SELECT 1/0;COMMIT;');mark('late failure rolls back all DDL',failed.returncode!=0 and 'division by zero' in failed.stderr and getcat()==pre)
run(migration);post=json.loads((D/'expected-post-catalog.json').read_text());mark('exact successor postcatalog',getcat()==post)
new_proof=json.loads(run('BEGIN;'+(D/'new-contract-probe.sql').read_text()+'ROLLBACK;').splitlines()[-2]);mark('new native proof all17 checks',len(new_proof)==17 and all(new_proof.values()))
for name,value in new_proof.items():mark(name,value)
mark('native proof residual zero',run('SELECT count(*) FROM rating_validation_b3b.native_intents;')=='0')
mark('historical seal bytes unchanged',run("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM rating_validation_b3b.seals t;")==before_seals)
mark('business state unchanged',run("SELECT jsonb_build_object('matches',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.matches t),'ratings',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.rating_events t),'players',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.players t),'profiles',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.profiles t));")==before_business)
mark('receipt003 unchanged / raw migration no receipt write',run("SELECT string_agg(migration_version||':'||sha256,',' ORDER BY migration_version) FROM pick_deployment.migration_receipts;")=='202610300003:04661eefef340d58b09c2450f1205d4f7d273e9e33da7177c7ea636fa5928b8a')
p=call(migration);mark('reapply rejected',p.returncode!=0 and 'REBIND_POST003_CATALOG_DRIFT' in p.stderr)
# Catalog comparison proves no grants/RLS/search_path/owner/other-function drift.
mark('grants RLS owners and search_path unchanged',all(pre[k]==post[k] for k in ['tables','policies','schema_acl','columns','indexes','triggers']))
out={'passed':len(checks),'tests':len(checks),'checks':checks,'old_contract':old_proof,'new_contract':new_proof,'production_mutation':False,'migration_sha256':lock['sha256'],'business_state_unchanged':True,'historical_bytes_preserved':True,'residual':0}
(D/'rebind-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
