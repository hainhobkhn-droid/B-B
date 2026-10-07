"""WP-C9A read-only sanitized Audit RPC PostgreSQL security matrix."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('common',Path(__file__).with_name('wp-c9-local-common.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
migration=(c.repo/'supabase/migrations/202610070002_wp_c9_audit_read_model.sql').read_text(encoding='utf8')
with c.Fixture() as db:
    db.fail("BEGIN; ALTER TABLE audit_logs ADD COLUMN drift text;"+migration,'WP_C9_AUDIT_BASELINE_DRIFT')
    db.fail("BEGIN; GRANT SELECT ON audit_logs TO authenticated;"+migration,'WP_C9_AUDIT_BASELINE_DRIFT')
    db.run(migration)
    db.fail(migration,'WP_C9_AUDIT_BASELINE_DRIFT')
    for n in range(65):db.run(f"INSERT INTO audit_logs(id,user_id,action,table_name,record_id,old_data,new_data,reason,created_at) VALUES('{c.uid(200+n)}','{c.uid(1)}','RECORD_RATING_ADJUSTMENT','rating_adjustments','{c.uid(100)}','{{\"access_token\":\"SECRET\"}}','{{\"password\":\"SECRET\",\"refresh_token\":\"SECRET\"}}','SECRET','2026-01-01');")
    db.run(f"INSERT INTO audit_logs(id,action,table_name,reason,created_at) VALUES('{c.uid(999)}','SECRET_ACTION','SECRET_TABLE','SECRET','2026-02-01');")
    original=db.run('SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM audit_logs a')
    for actor in [1,3]:
        page=db.json(actor,'SELECT get_audit_events(999);')
        assert page['page_size']==50 and len(page['events'])==50 and page['has_more']
        assert page['events'][0]['action']=='OTHER' and page['events'][0]['entity_type']=='OTHER'
        for row in page['events']:assert set(row)=={'id','created_at','actor_id','action','entity_type','target_id','summary'}
        assert 'SECRET' not in str(page) and 'password' not in str(page) and 'old_data' not in str(page)
        second=db.json(actor,'SELECT get_audit_events(50,50);')
        assert len(second['events'])==16 and not second['has_more']
        assert not {r['id'] for r in page['events']} & {r['id'] for r in second['events']}
        filtered=db.json(actor,"SELECT get_audit_events(30,0,'2026-02-01','2026-03-01',NULL,'OTHER','OTHER');")
        assert len(filtered['events'])==1
        assert len(db.json(actor,f"SELECT get_audit_events(30,0,NULL,NULL,'{c.uid(4)}');")['events'])==0
    for n in [2,4]:db.fail(db.as_user(n,'SELECT get_audit_events();'),'AUDIT_PERMISSION_REQUIRED')
    for n in [5,6,7,8]:db.fail(db.as_user(n,'SELECT get_audit_events();'),'BUSINESS_ACCESS_REQUIRED')
    db.fail('SET ROLE authenticated; SELECT get_audit_events();','AUTH_REQUIRED')
    db.fail('SET ROLE anon; SELECT get_audit_events();','permission denied')
    for args in ['0','30,-1','30,10001',"30,0,NULL,NULL,NULL,'SECRET_ACTION'", "30,0,'2026-03-01','2026-02-01'"]:
        db.fail(db.as_user(3,'SELECT get_audit_events('+args+');'),'AUDIT_FILTER_INVALID')
    db.fail(db.as_user(3,'SELECT * FROM audit_logs;'),'permission denied')
    db.fail(db.as_user(3,"UPDATE audit_logs SET reason='changed';"),'permission denied')
    assert db.run('SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM audit_logs a')==original
    assert db.run("SELECT prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, pg_temp']::text[] FROM pg_proc WHERE proname='get_audit_events'")=='t'
    assert db.run("SELECT has_table_privilege('authenticated','audit_logs','SELECT') OR has_table_privilege('authenticated','audit_logs','UPDATE')")=='f'
print('PASS WP-C9 Audit: ADMIN/exact capability/normal/forced/inactive/pending/rejected; stable read-only; bounded ordered pages/filters; payload/reason/secret exclusion; unknown codes sanitized; no direct privileges; baseline drift abort.')
