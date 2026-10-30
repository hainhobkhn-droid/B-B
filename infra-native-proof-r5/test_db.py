"""Real PostgreSQL attestation integration with exact legacy verifier bodies; synthetic rows only."""
from pathlib import Path
import copy,hashlib,json,os,subprocess,sys,unittest,uuid
D=Path(__file__).resolve().parent;REPO=Path(os.environ.get('GITHUB_WORKSPACE',D.parents[3]));NATIVE=os.environ.get('B3D_TEST_NATIVE_HASH','e'*64)
PSQL=json.loads(os.environ['B3D_TEST_PSQL']);DB='p1r5_contract_'+uuid.uuid4().hex[:10]
def quote(x):return "'"+str(x).replace("'","''")+"'"
def call(sql,db=DB):return subprocess.run(PSQL+['-d',db,'-At','-v','ON_ERROR_STOP=1'],input=sql,capture_output=True,text=True,encoding='utf-8',timeout=45)
def run(sql,db=DB):
 p=call(sql,db)
 if p.returncode:raise AssertionError(p.stderr[-1200:])
 return p.stdout.strip()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
ROLE="SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);"
def rpc(name,args):return json.loads(run(ROLE+'SELECT public.'+name+'('+','.join(quote(x) for x in args)+');').splitlines()[-1])
def rejected(sql,needle=''):
 p=call(sql);assert p.returncode and (not needle or needle in p.stderr),(needle,p.stderr)
CTX=json.loads((D/'fixture-context.json').read_text());FROZEN=json.loads((REPO/'analysis/rating-calibration01-b/frozen_candidates.json').read_text())
WORKER='947a8cbaadd76618e933337613b37eb35c9bf77c24b1c319354e462e9165fb56';SOURCE='604737ed1a4d8cd64fe9e6ace278954c097c74e1dc9ddb2ccdd2c2b9f98935a0';MANIFEST='348d713d0e6d9a88bac960f009a683ae19aa1c7679f34a76fc28394ef8896ebf'
def create(native=False):
 roster={'A':['abcdef01-0000-4000-8000-000000000001','abcdef01-0000-4000-8000-000000000002'],'B':['abcdef01-0000-4000-8000-000000000003','abcdef01-0000-4000-8000-000000000004']}
 intent=run('INSERT INTO rating_validation_b3b.intents(roster) VALUES('+quote(json.dumps(roster))+') RETURNING id;').splitlines()[0]
 b=rpc('capture_native_rating_validation_snapshot' if native else 'capture_rating_validation_snapshot',[intent]);return intent,b
def payload(b,native=False):
 v={'boundary_id':b['boundary_id'],'intent_id':b['intent_id'],'source_hash':b['source_hash'],'roster':b['roster'],'manifest_sha256':MANIFEST,'worker_sha256':WORKER,'computed':{'source_code_sha256':SOURCE,'seal_version':'B3_LOCAL_1','frozen_parameters':FROZEN,'source_prefix':json.loads(b['source_text']),'forecast_created_at':b['captured_at'],'forecasts':{'A':'0.5','D':'0.5'},'baseline_context':CTX,'evidence_environment':'production'}}
 if native:v['attestation']={'version':2,'protocol_version':'B3_LOCAL_1','protocol_reference_sha256':WORKER,'reference_source_sha256':SOURCE,'native_artifact_sha256':NATIVE}
 return v
def finalize(b,v,native=False):return rpc('finalize_native_rating_validation_seal' if native else 'finalize_rating_validation_seal',[b['boundary_id'],canonical(v)])
def deny(b,v,native=False,error=''):
 name='finalize_native_rating_validation_seal' if native else 'finalize_rating_validation_seal';rejected(ROLE+'SELECT public.'+name+'('+quote(b['boundary_id'])+','+quote(canonical(v))+');',error)

class Contract(unittest.TestCase):
 def test_01_historical_bytes_unchanged(self):self.assertEqual(run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(HISTORICAL)),OLD_HASH)
 def test_02_legacy_valid(self):_,b=create();self.assertFalse(finalize(b,payload(b))['idempotent'])
 def test_03_legacy_idempotent(self):_,b=create();v=payload(b);finalize(b,v);self.assertTrue(finalize(b,v)['idempotent'])
 def test_04_legacy_wrong_worker(self):_,b=create();v=payload(b);v['worker_sha256']='0'*64;deny(b,v,error='LEGACY_REFERENCE')
 def test_05_legacy_wrong_source(self):_,b=create();v=payload(b);v['computed']['source_code_sha256']='0'*64;deny(b,v,error='LEGACY_REFERENCE')
 def test_06_legacy_protocol(self):_,b=create();v=payload(b);v['computed']['seal_version']='UNKNOWN';deny(b,v,error='LEGACY_REFERENCE')
 def test_07_native_valid(self):_,b=create(True);r=finalize(b,payload(b,True),True);self.assertFalse(r['idempotent'])
 def test_08_native_idempotent(self):_,b=create(True);v=payload(b,True);finalize(b,v,True);self.assertTrue(finalize(b,v,True)['idempotent'])
 def test_09_native_wrong_hash(self):_,b=create(True);v=payload(b,True);v['attestation']['native_artifact_sha256']='0'*64;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_10_native_missing_hash(self):_,b=create(True);v=payload(b,True);del v['attestation']['native_artifact_sha256'];deny(b,v,True,'NATIVE_ATTESTATION')
 def test_11_native_null_hash(self):_,b=create(True);v=payload(b,True);v['attestation']['native_artifact_sha256']=None;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_12_native_unknown_hash(self):_,b=create(True);v=payload(b,True);v['attestation']['native_artifact_sha256']='a'*64;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_13_native_python_hash(self):_,b=create(True);v=payload(b,True);v['attestation']['native_artifact_sha256']=WORKER;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_14_native_wrong_protocol(self):_,b=create(True);v=payload(b,True);v['attestation']['protocol_version']='UNKNOWN';deny(b,v,True,'NATIVE_ATTESTATION')
 def test_15_native_wrong_reference(self):_,b=create(True);v=payload(b,True);v['attestation']['protocol_reference_sha256']='0'*64;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_16_native_wrong_source(self):_,b=create(True);v=payload(b,True);v['computed']['source_code_sha256']='0'*64;deny(b,v,True,'LEGACY_REFERENCE')
 def test_17_legacy_cannot_masquerade_native(self):_,b=create();deny(b,payload(b,True),True,'NATIVE_CAPTURE_REQUIRED')
 def test_18_native_cannot_strip_metadata(self):_,b=create(True);deny(b,payload(b),True,'NATIVE_ATTESTATION')
 def test_19_native_cannot_downgrade_endpoint(self):_,b=create(True);deny(b,payload(b),False,'NATIVE_FINALIZER_REQUIRED')
 def test_20_native_metadata_legacy_endpoint(self):_,b=create();deny(b,payload(b,True),False,'NATIVE_FINALIZER_REQUIRED')
 def test_21_native_version_one(self):_,b=create(True);v=payload(b,True);v['attestation']['version']=1;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_22_old_boundary_cannot_downgrade(self):intent,old=create();rpc('capture_native_rating_validation_snapshot',[intent]);deny(old,payload(old),False,'NATIVE_FINALIZER_REQUIRED')
 def test_23_unknown_field(self):_,b=create(True);v=payload(b,True);v['attestation']['actor']='OVERRIDE';deny(b,v,True,'NATIVE_ATTESTATION')
 def test_24_native_marker_immutable(self):intent,_=create(True);rejected('UPDATE rating_validation_b3b.native_intents SET attestation_version=2 WHERE intent_id='+quote(intent),'IMMUTABLE')
 def test_25_native_marker_delete_denied(self):rejected('DELETE FROM rating_validation_b3b.native_intents','IMMUTABLE')
 def test_26_member_denied(self):_,b=create(True);rejected("SET ROLE authenticated;SELECT public.finalize_native_rating_validation_seal("+quote(b['boundary_id'])+','+quote(canonical(payload(b,True)))+');','permission denied')
 def test_27_anon_capture_denied(self):rejected("SET ROLE anon;SELECT public.capture_native_rating_validation_snapshot('abcdef04-0000-4000-8000-000000000001');",'permission denied')
 def test_28_service_no_table_grant(self):rejected('SET ROLE service_role;SELECT * FROM rating_validation_b3b.native_intents','permission denied')
 def test_29_service_no_private_core(self):_,b=create();rejected(ROLE+'SELECT rating_validation_b3b.finalize_legacy_v1('+quote(b['boundary_id'])+','+quote(canonical(payload(b)))+');','permission denied')
 def test_30_business_delta_zero(self):self.assertEqual(run('SELECT (SELECT count(*) FROM public.matches)||\'/\'||(SELECT count(*) FROM public.rating_events);'),'0/0')
 def test_31_migration_no_historical_rehash(self):self.assertEqual(run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(HISTORICAL)),OLD_HASH)
 def test_32_native_capture_existing_legacy_seal(self):r=rpc('capture_native_rating_validation_snapshot',[HISTORICAL]);self.assertTrue(r['already_sealed']);self.assertEqual(run('SELECT count(*) FROM rating_validation_b3b.native_intents WHERE intent_id='+quote(HISTORICAL)),'0')
 def test_33_wrong_reference_source(self):_,b=create(True);v=payload(b,True);v['attestation']['reference_source_sha256']='0'*64;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_34_null_attestation(self):_,b=create(True);v=payload(b,True);v['attestation']=None;deny(b,v,True,'NATIVE_ATTESTATION')
 def test_35_flat_override(self):_,b=create(True);v=payload(b,True);v['native_artifact_sha256']=NATIVE;deny(b,v,True,'ATTESTATION_SHAPE')
 def test_36_persisted_v2_identity(self):intent,b=create(True);v=payload(b,True);finalize(b,v,True);self.assertEqual(run("SELECT payload#>>'{attestation,native_artifact_sha256}' FROM rating_validation_b3b.seals WHERE intent_id="+quote(intent)),NATIVE)
 def test_37_new_seals_immutable(self):rejected('UPDATE rating_validation_b3b.seals SET sealed_at=sealed_at','IMMUTABLE')
 def test_38_stale_guard_preserved(self):
  _,b=create(True);v=payload(b,True);old=run('SELECT value FROM rating_validation_b3b.fixture_source;')
  try:run("UPDATE rating_validation_b3b.fixture_source SET value=value||'{\"drift\":true}'::jsonb;");deny(b,v,True,'STALE_BOUNDARY')
  finally:run('UPDATE rating_validation_b3b.fixture_source SET value='+quote(old)+'::jsonb;')
 def test_39_real_native_producer_to_exact_verifier(self):
  context=json.loads(Path(os.environ.get('B3D_TEST_CONTEXT',D/'candidate/supabase/functions/b3d-prepare/context.json')).read_text(encoding='utf-8'));source=copy.deepcopy(context['baseline']);source.update(adjustments=[],adjustment_events=[],captured_at='2026-10-30T00:00:00+00:00',timezone='UTC',function_hashes={'_rebuild_ratings_internal':context['frozen']['production_definition_md5']});original=run('SELECT value FROM rating_validation_b3b.fixture_source;')
  # The authoritative source() RPC projects weight and match_type, never description.
  source['weights']=[{k:w[k] for k in ['match_type','weight']} for w in source['weights']]
  try:
   run('UPDATE rating_validation_b3b.fixture_source SET value='+quote(json.dumps(source))+'::jsonb;')
   ids=sorted(p['id'] for p in source['players'])[:4];roster={'A':ids[:2],'B':ids[2:]};intent=run('INSERT INTO rating_validation_b3b.intents(roster) VALUES('+quote(json.dumps(roster))+') RETURNING id;').splitlines()[0];b=rpc('capture_native_rating_validation_snapshot',[intent])
   node=subprocess.run(['node',str(D/'create_native_payload.mjs')],input=json.dumps(b),capture_output=True,text=True,encoding='utf-8',timeout=30)
   self.assertEqual(node.returncode,0,node.stderr[-800:]);v=json.loads(node.stdout);self.assertEqual(v['attestation']['native_artifact_sha256'],NATIVE)
   result=rpc('finalize_native_rating_validation_seal',[b['boundary_id'],node.stdout]);self.assertFalse(result['idempotent'])
  finally:run('UPDATE rating_validation_b3b.fixture_source SET value='+quote(original)+'::jsonb;')
 def test_40_historical_old_metadata_retry_preserved(self):self.assertTrue(finalize(OLD_BOUNDARY,OLD_PAYLOAD)['idempotent']);self.assertEqual(run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(OLD_INTENT)),OLD_NONSTANDARD_HASH)
 def test_41_historical_modified_bytes_rejected(self):v=copy.deepcopy(OLD_PAYLOAD);v['computed']['source_code_sha256']='c'*64;deny(OLD_BOUNDARY,v,error='LEGACY_REFERENCE')
 def test_42_reapply_refused(self):rejected(Path(os.environ.get('B3D_TEST_MIGRATION',D/'migration-design.sql')).read_text(),'ATTESTATION_ALREADY_INSTALLED')
 def test_43_native_marker_truncate_denied(self):rejected('TRUNCATE rating_validation_b3b.native_intents','IMMUTABLE')

run('CREATE DATABASE '+DB,'postgres')
try:
 run((D/'db-fixture-schema.sql').read_text());manifest=quote(json.dumps(FROZEN));ctx=quote(json.dumps(CTX));run('INSERT INTO rating_validation_b3b.environment_protocol VALUES(true,'+manifest+','+quote(MANIFEST)+','+quote(WORKER)+','+ctx+');')
 run((D/'legacy-verifier-functions.sql').read_text());run('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA rating_validation_b3b FROM PUBLIC,anon,authenticated,service_role;REVOKE ALL ON FUNCTION public.capture_rating_validation_snapshot(uuid),public.finalize_rating_validation_seal(uuid,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.capture_rating_validation_snapshot(uuid),public.finalize_rating_validation_seal(uuid,text) TO service_role;')
 HISTORICAL,b=create();finalize(b,payload(b));OLD_HASH=run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(HISTORICAL))
 OLD_INTENT,OLD_BOUNDARY=create();OLD_PAYLOAD=payload(OLD_BOUNDARY);OLD_PAYLOAD['computed']['source_code_sha256']='b'*64;OLD_PAYLOAD['computed']['seal_version']='OLDER_METADATA';finalize(OLD_BOUNDARY,OLD_PAYLOAD);OLD_NONSTANDARD_HASH=run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(OLD_INTENT))
 if '--red' not in sys.argv:run(Path(os.environ.get('B3D_TEST_MIGRATION',D/'migration-design.sql')).read_text())
 suite=unittest.TestSuite([Contract('test_05_legacy_wrong_source'),Contract('test_07_native_valid')]) if '--red' in sys.argv else unittest.defaultTestLoader.loadTestsFromTestCase(Contract)
 result=unittest.TextTestRunner(verbosity=2).run(suite);out={'tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'historical_bytes_preserved':run('SELECT payload_hash FROM rating_validation_b3b.seals WHERE intent_id='+quote(HISTORICAL))==OLD_HASH,'business_delta':'0/0','mode':'real PostgreSQL, synthetic state, exact old verifier bodies; no hosted calls'}
 (D/('db-red-result.json' if '--red' in sys.argv else 'db-result.json')).write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out));code=0 if result.wasSuccessful() else 1
finally:run('DROP DATABASE '+DB+' WITH(FORCE)','postgres')
raise SystemExit(code)
