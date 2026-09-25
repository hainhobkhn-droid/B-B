"""PERM01C scoped integration tests on a disposable localhost PostgreSQL database.

Usage: python perm01c-local-test.py --schema-export DIR --migration FILE
Requires PostgreSQL on 127.0.0.1:55439. No remote-host/URL option is accepted.
Rebuilds profiles/players/audit_logs from the local schema export, then PERM01A.
Does not claim to reproduce all production grants, triggers, or Phase 3 workflows.
"""
import argparse
import csv
import json
import os
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--schema-export', type=Path, required=True)
parser.add_argument('--migration', type=Path, required=True)
parser.add_argument('--schema-migration', type=Path, required=True)
parser.add_argument('--psql', default=r'C:\Program Files\PostgreSQL\17\bin\psql.exe')
args = parser.parse_args()
db = 'perm01c_test_' + str(time.time_ns())
env = dict(os.environ, PGCLIENTENCODING='UTF8', PGCONNECT_TIMEOUT='5')
caps = ['can_collect_tournament_fee', 'can_approve_matches', 'can_manage_tournaments',
        'can_manage_fund', 'can_manage_members', 'can_adjust_rating',
        'can_collect_fund', 'can_view_audit']
checks = []


def command(database=db):
    return [args.psql, '-X', '-w', '-h', '127.0.0.1', '-p', '55439', '-U', 'postgres',
            '-d', database, '-At', '-v', 'ON_ERROR_STOP=1']


def run(sql, database=db):
    p = subprocess.run(command(database), input=sql, encoding='utf8',
                       capture_output=True, env=env, timeout=45)
    if p.returncode:
        raise RuntimeError(p.stderr)
    return p.stdout


def csv_rows(name):
    with (args.schema_export / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def uid(n):
    return f'00000000-0000-0000-0000-{n:012d}'


def lit(value):
    return "'" + value.replace("'", "''") + "'"


def update(patch, target=2, reason='Test permission change'):
    return f"public.admin_update_member_permissions('{uid(target)}',{lit(json.dumps(patch))}::jsonb,{lit(reason)})"


def actor(n, role='authenticated'):
    return f"RESET ROLE; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid(n) if n else ''}',true);"


sql = []


def check(label, expression):
    checks.append(label)
    sql.append(f"SELECT pg_temp.check_test({lit(label)},({expression}));")


def deny(label, expression, code):
    checks.append(label)
    sql.append(f"""DO $$ BEGIN
      BEGIN PERFORM {expression};
      EXCEPTION WHEN SQLSTATE '{code}' THEN RETURN; END;
      RAISE EXCEPTION 'FAIL: %', {lit(label)};
    END $$;""")


created = False
try:
    run(f'CREATE DATABASE {db}', 'postgres')
    created = True
    columns = {}
    for name in ['01_tables_columns.csv', '01D_columns_group2.csv']:
        for c in csv_rows(name):
            if c['table_name'] in ['players', 'profiles', 'audit_logs']:
                columns[c['table_name'], int(c['ordinal_position'])] = c
    schema = ["CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);",
              "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;",
              "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
              'GRANT USAGE ON SCHEMA auth TO authenticated,anon;']
    for table in ['players', 'profiles', 'audit_logs']:
        defs = []
        for (t, _), c in sorted(columns.items()):
            if t != table:
                continue
            d = f'"{c["column_name"]}" {c["data_type"]}'
            if c['is_nullable'] == 'NO':
                d += ' NOT NULL'
            if c['column_default'] not in ['', 'null']:
                d += ' DEFAULT ' + c['column_default']
            defs.append(d)
        schema.append(f'CREATE TABLE public.{table}(' + ','.join(defs) + ');')
    constraints = {}
    for name in ['05_constraints.csv', '05B_constraints_core.csv']:
        for c in csv_rows(name):
            if c['table_name'] in ['players', 'profiles', 'audit_logs']:
                constraints[c['constraint_name']] = c
    for c in sorted(constraints.values(), key=lambda c: c['constraint_type'] == 'f'):
        schema.append(f'ALTER TABLE public.{c["table_name"]} ADD CONSTRAINT "{c["constraint_name"]}" {c["definition"]};')
    schema.append(args.schema_migration.read_text(encoding='utf-8-sig'))
    # Reproduce the inspected own-profile SELECT policy; no direct UPDATE grant.
    schema.append("ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; GRANT SELECT ON public.profiles TO authenticated; CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid()); ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;")
    run('\n'.join(schema))
    security = "SELECT md5(string_agg(c.relname||coalesce(c.relacl::text,'')||c.relrowsecurity::text||coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname)::text FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),''),',' ORDER BY c.relname)) FROM pg_class c WHERE c.oid IN ('public.profiles'::regclass,'public.audit_logs'::regclass)"
    before = run(security)
    migration = args.migration.read_text(encoding='utf-8-sig')
    run(migration)
    run(migration)  # Safe re-application, including explicit ACLs.
    assert before == run(security), 'RLS/table privileges changed'
    checks.append('migration applies/reapplies; table grants and RLS unchanged')
    for n in range(1, 15):
        role = 'ADMIN' if n in [1, 4] else 'MEMBER'
        active = 'false' if n in [3, 4] else 'true'
        run(f"INSERT INTO auth.users VALUES('{uid(n)}'); INSERT INTO public.profiles(id,full_name,login_name,role,is_active) VALUES('{uid(n)}','Test {n:02}','test{n}', '{role}',{active});")
    run("UPDATE public.profiles SET " + ','.join(c+'=true' for c in caps) + f" WHERE id IN ('{uid(3)}','{uid(4)}','{uid(5)}');")
    for n, cap in enumerate(caps, 6):
        run(f"UPDATE public.profiles SET {cap}=true WHERE id='{uid(n)}';")
    sql += ['BEGIN;', "CREATE FUNCTION pg_temp.check_test(label text, ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;"]
    for sig in ['get_admin_member_permissions(integer,integer)', 'admin_update_member_permissions(uuid,jsonb,text)']:
        check(sig+' ACL', f"has_function_privilege('authenticated','public.{sig}','EXECUTE') AND NOT has_function_privilege('anon','public.{sig}','EXECUTE') AND NOT EXISTS(SELECT FROM pg_proc p,LATERAL aclexplode(p.proacl) a WHERE p.oid='public.{sig}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')")
        check(sig+' definer/search_path', f"SELECT prosecdef AND proconfig=ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid='public.{sig}'::regprocedure")
    for n in [0, 2, 3, 4, 5, *range(6, 14), 99]:
        sql.append(actor(n))
        deny(f'actor {n} cannot list', 'public.get_admin_member_permissions()', '42501')
        deny(f'actor {n} cannot grant', update({caps[0]: True}, target=n or 2), '42501')
    sql.append(actor(1, 'anon'))
    deny('anon with spoofed subject cannot list', 'public.get_admin_member_permissions()', '42501')
    deny('anon with spoofed subject cannot update', update({caps[0]: True}), '42501')
    sql.append(actor(1))
    check('ADMIN with all capabilities false can list', 'SELECT count(*)=12 FROM public.get_admin_member_permissions()')
    check('list excludes ADMIN, includes inactive MEMBER', f"EXISTS(SELECT FROM public.get_admin_member_permissions() WHERE profile_id='{uid(3)}' AND NOT is_active) AND NOT EXISTS(SELECT FROM public.get_admin_member_permissions() WHERE profile_id='{uid(1)}')")
    check('explicit safe projection', "SELECT NOT (to_jsonb(x) ?| ARRAY['email','must_change_password','role','created_at']) FROM public.get_admin_member_permissions(1,0) x")
    check('pagination', 'SELECT count(*)=1 FROM public.get_admin_member_permissions(1,1)')
    check('empty page', 'SELECT count(*)=0 FROM public.get_admin_member_permissions(1,1000)')
    for arg in ['0,0', '201,0', 'NULL,0', '1,-1', '1,NULL']:
        deny('invalid page '+arg, f'public.get_admin_member_permissions({arg})', '22023')
    for val in [None, [], True, 'true', 1, {}, {'role': True}, {'is_active': True}, {'must_change_password': False}, {'player_id': True}, {'can_create_match': True}, {'can_confirm_match': True}, {caps[0]: None}, {caps[0]: 'true'}, {caps[0]: 1}, {caps[0]: []}, {caps[0]: True, 'unknown': False}]:
        deny('invalid patch '+json.dumps(val), update(val), '22023')
    deny('SQL NULL patch', f"public.admin_update_member_permissions('{uid(2)}',NULL,'Test')", '22023')
    deny('NULL target', "public.admin_update_member_permissions(NULL,'{\"can_view_audit\":true}','Test')", '22023')
    for target in [1, 4, 99]:
        deny('invalid target '+str(target), update({caps[0]: True}, target), '22023')
    for reason in ['', '   ', 'x'*1001]:
        deny('invalid reason length '+str(len(reason)), update({caps[0]: True}, reason=reason), '22023')
    deny('NULL reason', f"public.admin_update_member_permissions('{uid(2)}','{{\"can_view_audit\":true}}',NULL)", '22023')
    deny('inactive target cannot receive grant', update({caps[0]: True}, 3), '22023')
    sql.append('RESET ROLE; CREATE TEMP TABLE untouched AS SELECT id,to_jsonb(p)-ARRAY[' + ','.join(lit(c) for c in caps+['updated_at']) + "] AS data FROM public.profiles p;")
    sql.append(actor(1))
    for cap in caps:
        check('grant '+cap, f"({update({cap: True})}->>'changed')::boolean")
        check('read reflects '+cap, f"SELECT {cap} FROM public.get_admin_member_permissions() WHERE profile_id='{uid(2)}'")
    check('no-op explicit', f"({update({caps[0]: True})}->>'changed')::boolean=false")
    sql.append('RESET ROLE;')
    check('8 changes create 8 audit entries, no-op creates none', 'SELECT count(*)=8 FROM public.audit_logs')
    check('audit actor/target/reason + complete snapshots', f"SELECT bool_and(user_id='{uid(1)}' AND record_id='{uid(2)}' AND action='UPDATE_MEMBER_PERMISSIONS' AND table_name='profiles' AND reason='Test permission change' AND old_data->>'profile_id'='{uid(2)}' AND new_data->>'profile_id'='{uid(2)}' AND (SELECT count(*)=8 FROM jsonb_object_keys(old_data->'capabilities')) AND (SELECT count(*)=8 FROM jsonb_object_keys(new_data->'capabilities'))) FROM public.audit_logs")
    check('IAM and identity columns unchanged', 'SELECT bool_and(u.data=to_jsonb(p)-ARRAY[' + ','.join(lit(c) for c in caps+['updated_at']) + ']) FROM public.profiles p JOIN untouched u USING(id)')
    sql.append(actor(1))
    for cap in caps:
        check('revoke '+cap, f"({update({cap: False})}->>'changed')::boolean")
    sql.append('RESET ROLE;')
    sql.append(f"UPDATE public.profiles SET {caps[0]}=true WHERE id='{uid(3)}';")
    sql.append(actor(1))
    check('inactive target revoke allowed', f"({update({caps[0]: False}, 3)}->>'changed')::boolean")
    # Simulate audit storage failure and require the entire update to roll back.
    sql.append("RESET ROLE; CREATE FUNCTION public.test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_AUDIT_FAILURE' USING ERRCODE='23514'; END $$; CREATE TRIGGER test_reject_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.test_reject_audit();")
    sql.append(actor(1))
    deny('audit failure aborts write', update({caps[0]: True}), '23514')
    sql.append('RESET ROLE;')
    check('permission rolled back after audit failure', f"SELECT NOT {caps[0]} FROM public.profiles WHERE id='{uid(2)}'")
    sql.append('DROP TRIGGER test_reject_audit ON public.audit_logs;')
    sql.append(actor(2))
    check('existing own-profile read unchanged', 'SELECT count(*)=1 FROM public.profiles')
    sql.append(f"DO $$ BEGIN BEGIN UPDATE public.profiles SET can_manage_members=true WHERE id='{uid(2)}'; EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'FAIL direct table escalation'; END $$;")
    checks.append('direct table self escalation blocked')
    # Defensive NULL behavior, although production columns are NOT NULL.
    sql.append('RESET ROLE; ALTER TABLE public.profiles ALTER COLUMN can_view_audit DROP NOT NULL;')
    sql.append(f"UPDATE public.profiles SET can_view_audit=NULL WHERE id IN ('{uid(1)}','{uid(2)}');")
    sql.append(actor(1))
    check('NULL capability does not remove ADMIN fallback', f"SELECT NOT can_view_audit FROM public.get_admin_member_permissions() WHERE profile_id='{uid(2)}'")
    check('patch preserves omitted legacy NULL', f"({update({caps[0]: True})}->'capabilities'->'can_view_audit')='null'::jsonb")
    sql.append(actor(2))
    deny('NULL capability MEMBER cannot escalate', update({'can_view_audit': True}), '42501')
    sql.append('RESET ROLE; ALTER TABLE public.profiles ALTER COLUMN is_active DROP NOT NULL;')
    sql.append(f"UPDATE public.profiles SET is_active=NULL WHERE id='{uid(1)}';")
    sql.append(actor(1))
    deny('NULL active ADMIN cannot list', 'public.get_admin_member_permissions()', '42501')
    deny('NULL active ADMIN cannot update', update({caps[0]: True}), '42501')
    sql.append('ROLLBACK;')
    run('\n'.join(sql))
    # Separate committed sessions: disjoint concurrent patches must both survive.
    first = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, encoding='utf8', env=env)
    first.stdin.write('BEGIN;' + actor(1) + 'SELECT ' + update({caps[0]: True}) + '; SELECT pg_sleep(2); COMMIT;\n')
    first.stdin.close()
    deadline = time.monotonic()+5
    while time.monotonic() < deadline:
        if run("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event='PgSleep'").strip() != '0':
            break
        time.sleep(0.05)
    else:
        raise RuntimeError('First concurrent writer did not reach locked state')
    run('BEGIN;' + actor(1) + 'SELECT ' + update({caps[1]: True}) + '; COMMIT;')
    first.wait(timeout=10)
    if first.returncode:
        raise RuntimeError(first.stderr.read())
    assert run(f"SELECT {caps[0]} AND {caps[1]} FROM public.profiles WHERE id='{uid(2)}'").strip() == 't'
    assert run('SELECT count(*)=2 FROM public.audit_logs').strip() == 't'
    assert run(f"SELECT (old_data->'capabilities'->>'{caps[0]}')::boolean FROM public.audit_logs WHERE (new_data->'capabilities'->>'{caps[1]}')::boolean").strip() == 't'
    checks.append('concurrent disjoint patches preserve both changes and audit order')
    print(json.dumps({'result': 'PASS', 'checks': len(checks), 'scope': 'PERM01C only', 'tests': checks}, ensure_ascii=False, indent=2))
finally:
    if created:
        # Generated database name, dedicated localhost server, no production URL.
        run(f'DROP DATABASE {db} WITH (FORCE)', 'postgres')
