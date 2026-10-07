"""WP-C9A canonical production Rating pathway in isolated PostgreSQL."""
import importlib.util
from pathlib import Path
import json
spec=importlib.util.spec_from_file_location('common',Path(__file__).with_name('wp-c9-local-common.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
migration=(c.repo/'supabase/migrations/202610070001_wp_c9_rating_capability.sql').read_text(encoding='utf8')
with c.Fixture() as db:
    # Exact source drift and ACL drift must abort before first function changes.
    db.fail("BEGIN; ALTER FUNCTION public.correct_rating_adjustment(uuid,text,text) SET search_path=public;"+migration,'WP_C9_RATING_BASELINE_DRIFT')
    db.fail("BEGIN; GRANT EXECUTE ON FUNCTION public.record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text) TO authenticated;"+migration,'WP_C9_RATING_BASELINE_DRIFT')
    # Prove the pre-existing invalid-input bug in rollback-only fixture first.
    legacy=db.run(db.as_user(1,"BEGIN; SELECT record_rating_adjustment_active('"+c.uid(999)+"','"+c.uid(10)+"','NaN','legacy validation proof','2026-02-01'); ROLLBACK;"))
    assert '"success": true' in legacy and 'NaN' in legacy
    db.run(migration)
    for name in ['record_rating_adjustment','correct_rating_adjustment']:
        actual=db.run("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='"+name+"'")
        baseline=db.baseline[name]['definition'].replace('\r\n','\n').strip()
        expected=baseline.replace("and pr.role = 'ADMIN'\n          and pr.is_active = true", "and (pr.role = 'ADMIN' OR (pr.role = 'MEMBER' AND pr.can_adjust_rating IS TRUE))\n          and pr.is_active = true\n          and public.current_user_business_access_active()")
        if name=='record_rating_adjustment': expected=expected.replace('or p_amount = 0 then', "or p_amount = 0\n       or p_amount::text IN ('NaN','Infinity','-Infinity') then")
        assert actual.replace('\r','')==expected,(name,'unexpected body change')
    db.fail(migration,'WP_C9_RATING_BASELINE_DRIFT')
    # Unrelated approved match timeline before adjustments: derived numerical rows
    # remain identical after rebuild (derived UUID/timestamps intentionally differ).
    db.run(f"INSERT INTO matches VALUES('{c.uid(80)}','2026-01-01',1,'FRIENDLY','POINTS',11,7,'APPROVED');")
    for n in range(11,15): db.run(f"INSERT INTO match_players(match_id,player_id,team) VALUES('{c.uid(80)}','{c.uid(n)}','{'A' if n<13 else 'B'}');")
    db.run("SELECT _rebuild_ratings_internal('V1.1',NULL)")
    numerical="SELECT jsonb_agg(to_jsonb(e)-'id'-'created_at' ORDER BY player_id) FROM rating_events e"
    before=db.run(numerical)
    def call(request,player=10,amount='.25',reason='fixture reason',effective='2026-02-01'):
        return f"SELECT record_rating_adjustment_active('{c.uid(request)}','{c.uid(player)}',{amount},'{reason}','{effective}');"
    a=db.json(1,call(101));b=db.json(2,call(102))
    assert a['success'] and b['success'] and b['rating_after']==4.5
    assert db.run(numerical)==before,'unrelated match-derived values changed'
    replay=db.json(2,call(102));assert replay['idempotent_replay']
    db.fail(db.as_user(2,call(102,amount='.5')),'IDP_KEY_REUSE')
    db.fail(db.as_user(1,call(102)),'IDP_KEY_REUSE')
    db.fail(db.as_user(2,f"SELECT set_player_initial_rating_before_history('{c.uid(10)}',5,'denied');"),'ADMIN_REQUIRED')
    db.fail(db.as_user(2,f"SELECT update_player('{c.uid(10)}','changed','CLUB',NULL,NULL,'ACTIVE',NULL,NULL,NULL);"),'PLAYER_MANAGEMENT_PERMISSION_REQUIRED')
    db.fail(db.as_user(2,f"SELECT set_player_lifecycle_status('{c.uid(10)}','INACTIVE','denied');"),'PLAYER_LIFECYCLE_PERMISSION_REQUIRED')
    for n in [3,4]:db.fail(db.as_user(n,call(103)),'Bạn không có quyền')
    for n in [5,6,7,8]:db.fail(db.as_user(n,call(103)),'BUSINESS_ACCESS_REQUIRED')
    db.fail(db.as_user(2,call(103,player=999)),'Không tìm thấy VĐV')
    for invalid in ['0',"'NaN'","'Infinity'","'-Infinity'"]:
        db.fail(db.as_user(2,call(103,amount=invalid)),'Adjustment amount')
    db.fail(db.as_user(2,call(103,reason='  ')),'Lý do Adjustment')
    db.fail(db.as_user(2,"SELECT record_rating_adjustment_active(NULL,NULL,1,'x',now())"),'request_id')
    correction=db.json(2,f"SELECT correct_rating_adjustment_active('{b['adjustment_id']}','correct fixture');")
    assert correction['success'] and correction['correction_amount']==-.25
    db.fail(db.as_user(2,f"SELECT correct_rating_adjustment_active('{b['adjustment_id']}','again')"),'đã có correction')
    assert db.run(numerical)==before
    assert db.run("SELECT count(*) FROM rating_adjustments")== '3'
    assert db.run("SELECT count(*) FROM audit_logs WHERE action IN ('RECORD_RATING_ADJUSTMENT','CORRECT_RATING_ADJUSTMENT')")== '3'
    assert db.run(f"SELECT count(*) FROM audit_logs WHERE user_id='{c.uid(2)}' AND action IN ('RECORD_RATING_ADJUSTMENT','CORRECT_RATING_ADJUSTMENT')")== '2'
    assert db.run("SELECT count(*) FROM rating_adjustments a LEFT JOIN rating_adjustment_events e ON e.adjustment_id=a.id AND e.algorithm_version='V1.1' WHERE e.id IS NULL OR e.requested_amount<>a.amount OR e.applied_delta<>e.rating_after-e.rating_before")== '0'
    assert db.run("SELECT count(*) FROM players p WHERE abs(p.current_rating-coalesce((SELECT e.rating_after FROM rating_adjustment_events e JOIN rating_adjustments a ON a.id=e.adjustment_id WHERE e.player_id=p.id ORDER BY a.effective_at DESC,a.replay_order DESC LIMIT 1),(SELECT e.rating_after FROM rating_events e WHERE e.player_id=p.id LIMIT 1),p.initial_rating))>.0005")== '0'
    assert db.run("SELECT has_function_privilege('authenticated','record_rating_adjustment(uuid,uuid,numeric,text,timestamptz,text)','EXECUTE')")== 'f'
    assert db.run("SELECT has_table_privilege('authenticated','players','UPDATE') OR has_table_privilege('authenticated','rating_adjustments','INSERT')")== 'f'
print('PASS WP-C9 Rating: exact bodies/hash/ACL guard; ADMIN/delegated/normal/business gate; idempotency; correction; canonical ledger/events/audit; zero projection mismatch; unrelated match numerical events unchanged. Initial/Player/lifecycle boundary covered by separate production migrations/regressions.')
