// Offline contract tests of the actual Edge sources; no Auth/network requests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../functions');
let checks = 0;
function make(name, scenario = {}) {
  const calls = [];
  let handler;
  const profile = scenario.profile ?? { id: 'member-id' };
  const current = scenario.current ?? { role: 'MEMBER', membership_status: 'APPROVED', is_active: true };
  const createClient = (_url, key) => {
    const admin = key === 'server-secret';
    return {
      from(table) {
        const query = { table };
        return {
          select(columns) { query.columns = columns; return this; },
          eq(column, value) { query.eq = [column, value]; return this; },
          ilike(column, value) { query.ilike = [column, value]; return this; },
          async maybeSingle() {
            calls.push(query);
            if (name === 'admin-create-member') return { data: query.columns === 'role, is_active'
              ? (scenario.actor ?? { role: 'ADMIN', is_active: true }) : (scenario.existing ?? null), error: null };
            return { data: query.columns === 'id' ? profile : current, error: scenario.profileError || null };
          },
        };
      },
      auth: {
        async getUser() { return { data: { user: { id: 'actor-id' } }, error: scenario.callerError || null }; },
        admin: {
          async getUserById(id) { calls.push({ getUserById: id }); return { data: { user: { email: 'test@example.invalid' } } }; },
          async createUser(body) { calls.push({ createUser: body }); return { data: { user: { id: 'new-id' } }, error: null }; },
        },
        async signInWithPassword(body) {
          assert.equal(admin, false);
          calls.push({ signIn: body });
          return scenario.badPassword ? { data: {}, error: { code: 'invalid_credentials' } }
            : { data: { user: { id: 'member-id', email: 'test@example.invalid' }, session: { access_token: 'test-access', refresh_token: 'test-refresh' } } };
        },
        async signOut(args) { calls.push({ signOut: args }); return {}; },
      },
    };
  };
  const source = fs.readFileSync(path.join(root, name, 'index.ts'), 'utf8');
  const js = stripTypeScriptTypes(source.replace(/^import .*\r?\n/, ''));
  vm.runInNewContext(js, { createClient, Request, Response, console,
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', SUPABASE_ANON_KEY: 'public-key' })[name] }, serve: fn => { handler = fn; } } });
  return { calls, async run(body, header = 'Bearer test') {
    const result = await handler(new Request('https://example.invalid', { method: 'POST', headers: { Authorization: header, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: result.status, body: await result.json() };
  } };
}
(async () => {
  for (const membership_status of ['PENDING', 'REJECTED', 'APPROVED']) {
    const current = { role: 'MEMBER', membership_status, is_active: membership_status === 'APPROVED' };
    const f = make('login-by-nickname', { current });
    const r = await f.run({ login_name: 'A_C', password: 'synthetic-password' });
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); checks++;
    assert.equal(f.calls[0].ilike[1], 'a\\_c'); checks++;
    assert(!('email' in r.body.user)); checks++;
    assert(f.calls.findIndex(x => x.signIn) < f.calls.findIndex(x => x.columns?.includes('membership_status'))); checks++;
    const bad = make('login-by-nickname', { current, badPassword: true });
    const denied = await bad.run({ login_name: 'test', password: 'wrong' });
    assert.equal(denied.status, 401); assert.deepEqual(denied.body, { error: 'INVALID_LOGIN' }); checks++;
    assert(!bad.calls.some(x => x.columns?.includes('membership_status'))); checks++;
  }
  for (const current of [{ role: 'MEMBER', membership_status: 'APPROVED', is_active: false }, { role: 'ADMIN', membership_status: 'PENDING', is_active: false }, { role: 'MEMBER', membership_status: 'UNKNOWN', is_active: true }]) {
    const f = make('login-by-nickname', { current });
    const r = await f.run({ login_name: 'test', password: 'synthetic-password' });
    assert.equal(r.status, 401); assert(!r.body.session); assert.equal(f.calls.find(x => x.signOut).signOut.scope, 'local'); checks++;
  }
  const payload = { full_name: 'Test', login_name: 'New_Name', email: 'test@example.invalid', password: 'synthetic-password', initial_rating: 4.25,
    app_metadata: { membership_created_by: 'attacker' }, membership_source: 'attacker' };
  const admin = make('admin-create-member');
  assert.equal((await admin.run(payload)).status, 200); checks++;
  const created = admin.calls.find(x => x.createUser).createUser;
  assert.equal(created.app_metadata.membership_created_by, 'actor-id');
  assert.equal(created.app_metadata.membership_source, 'ADMIN_CREATE_MEMBER'); checks++;
  assert.equal(created.user_metadata.initial_rating, '4.25');
  assert.equal(created.user_metadata.must_change_password, true); checks++;
  for (const actor of [{ role: 'MEMBER', is_active: true, can_manage_members: true }, { role: 'ADMIN', is_active: false }]) {
    const f = make('admin-create-member', { actor }); assert.equal((await f.run(payload)).status, 403);
    assert(!f.calls.some(x => x.createUser)); checks++;
  }
  console.log(`PASS: ${checks} offline Edge contract checks (no production calls).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
