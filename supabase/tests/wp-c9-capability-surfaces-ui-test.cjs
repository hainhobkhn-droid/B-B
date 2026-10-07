'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const app = read('app.js'), account = read('account.js'), players = read('players.js');
const capabilities = [
  'can_collect_tournament_fee', 'can_approve_matches', 'can_manage_tournaments',
  'can_manage_fund', 'can_manage_members', 'can_manage_players',
  'can_manage_player_lifecycle', 'can_adjust_rating', 'can_collect_fund', 'can_view_audit'
];
function node(tag, text, cls) {
  return { tag, text: text || '', cls, children: [],
    classList: { add() {} }, append(...items) { this.children.push(...items); } };
}
const text = root => [root.text, ...root.children.map(text)].join(' ');
function context(profile) {
  const content = node('div'), panels = [], actions = [];
  const scope = {
    state: { profile, session: { user: { id: 'fixture' } }, errors: {},
      fundCollectionBalances: [], fundCollectionBalancesReady: true },
    upper: value => String(value || '').toUpperCase(), number: String,
    rows: () => [], ready: () => true, el: node,
    panel(title, root) { const result = node('section', title); panels.push(result); root.append(result); return result; },
    button: (label, action, cls) => node('button', label, cls), navigate() {},
    $: () => content, sources() {}, playerDetailSection() {}, manualRatingAdjustmentForm() {},
    collapsibleAdminSection(root, title) { actions.push(title); },
  };
  vm.createContext(scope);
  const start = app.indexOf('      const isAdmin = () =>');
  const end = app.indexOf('      function el(', start);
  assert(start >= 0 && end > start);
  vm.runInContext(app.slice(start, end) + `
    this.gates = {isAdmin, canManageMembers, canManagePlayers, canManagePlayerLifecycle,
      canApproveMatches, canManageFund, canCollectFund, canManageTournaments,
      canCollectTournamentFee, canAdjustRating, canViewAudit};`, scope);
  Object.assign(scope, scope.gates);
  const overviewStart = app.indexOf('      function overviewManagementWorkspace(');
  const overviewEnd = app.indexOf('      function memberOverview(', overviewStart);
  vm.runInContext(app.slice(overviewStart, overviewEnd), scope);
  const playerStart = players.indexOf('    function playersPage()');
  const playerEnd = players.indexOf('    return {', playerStart);
  assert(playerStart >= 0 && playerEnd > playerStart);
  vm.runInContext(players.slice(playerStart, playerEnd), scope);
  const root = node('div');
  scope.overviewManagementWorkspace(root);
  scope.playersPage();
  return {scope, root, panels, actions};
}

const member = (caps = [], active = true) => ({role: 'MEMBER', is_active: active,
  membership_status: 'APPROVED', must_change_password: false,
  ...Object.fromEntries(caps.map(cap => [cap, true]))});
const expectedCards = {
  can_collect_tournament_fee: 'Giải đấu', can_approve_matches: 'Trận cần xử lý',
  can_manage_tournaments: 'Giải đấu', can_manage_fund: 'Quỹ cần xử lý',
  can_manage_members: null, can_manage_players: 'Quản lý VĐV',
  can_manage_player_lifecycle: 'Quản lý VĐV', can_adjust_rating: 'Quản lý VĐV',
  can_collect_fund: 'Quỹ cần xử lý', can_view_audit: null
};
for (const cap of capabilities) {
  const result = context(member([cap]));
  const headings = result.root.children.flatMap(section => section.children)
    .flatMap(child => child.children).flatMap(card => card.children)
    .flatMap(child => child.children).filter(child => child.tag === 'h3').map(child => child.text);
  // Inspect actual rendered tree, not a copied capability predicate.
  const rendered = text(result.root);
  if (expectedCards[cap]) assert(rendered.includes(expectedCards[cap]), cap + ' shortcut');
  else assert.equal(result.root.children.length, 0, cap + ' must not create an empty management shell');
  assert(!result.actions.includes('Điều chỉnh Rating ban đầu'), cap + ' initial remains ADMIN-only');
  assert(!result.actions.includes('Xóa vĩnh viễn VĐV'), cap + ' hard-delete remains ADMIN-only');
  assert.equal(result.actions.includes('Tạo VĐV'), cap === 'can_manage_players');
  assert.equal(result.actions.includes('Sửa thông tin VĐV'), cap === 'can_manage_players');
  assert.equal(result.actions.includes('Vòng đời VĐV'), cap === 'can_manage_player_lifecycle');
  assert(!result.actions.includes('Chuyển VĐV khách thành thành viên'), cap + ' promotion requires BOTH');
}
assert.equal(context(member()).root.children.length, 0);
assert.equal(context(member()).actions.length, 0);
assert.equal(context(member(capabilities, false)).actions.length, 0);
assert.equal(context(member(capabilities, false)).root.children.length, 0);
const both = context(member(['can_manage_members', 'can_manage_players']));
assert(both.actions.includes('Chuyển VĐV khách thành thành viên'));
const ratingAudit = context(member(['can_adjust_rating', 'can_view_audit']));
assert.deepEqual(ratingAudit.actions, ['Điều chỉnh Rating']);
assert(text(ratingAudit.root).includes('Điều chỉnh Rating trong phạm vi được ủy quyền.'));
for (const extra of ['can_adjust_rating', 'can_view_audit']) {
  assert.deepEqual(context(member(['can_manage_players', extra])).actions.filter(action => action !== 'Điều chỉnh Rating'),
    context(member(['can_manage_players'])).actions, extra + ' no privilege expansion');
}
const admin = context({role: 'ADMIN', is_active: true});
assert(admin.actions.includes('Điều chỉnh Rating ban đầu'));
assert(admin.actions.includes('Xóa vĩnh viễn VĐV'));
assert(admin.actions.includes('Chuyển VĐV khách thành thành viên'));
const collector = text(context(member(['can_collect_tournament_fee'])).root);
assert(collector.includes('Thu phí giải đấu trong phạm vi được ủy quyền.'));
assert(!collector.includes('Quản lý giải và'));
assert(text(context(member(['can_manage_tournaments', 'can_collect_tournament_fee'])).root)
  .includes('Quản lý giải và thu phí trong phạm vi được ủy quyền.'));

// Actual Account summary: stored permissions remain visible, with unavailable explanation;
// no new management button, live region or database call is introduced.
const summaryStart = account.indexOf('      function memberPersonalSummary(');
const summaryEnd = account.indexOf('      function memberNickname(', summaryStart);
for (const caps of [[], ['can_adjust_rating'], ['can_view_audit'], capabilities]) {
  const profile = {...member(caps), login_name: 'fixture'};
  const scope = {state: {profile}, el: node, membershipLabel: () => 'Đã duyệt'};
  vm.createContext(scope);
  vm.runInContext(account.slice(summaryStart, summaryEnd), scope);
  const root = node('div'); scope.memberPersonalSummary(root, null);
  const summary = text(root);
  assert.equal(summary.includes('Điều chỉnh Rating: mở VĐV'), caps.includes('can_adjust_rating'));
  assert.equal(summary.includes('Xem Audit: mở Lịch sử thao tác'), caps.includes('can_view_audit'));
  assert(!summary.includes('tokens') && !summary.includes('service_role'));
}
assert(account.includes('Sửa Rating ban đầu vẫn chỉ dành cho ADMIN'));
assert.match(account, /if \(canViewAudit\(\)\) auditWorkspace\(root\)/);
assert.match(account, /function adminMemberPermissions\([^)]*\) \{\s*if \(!isAdmin\(\)\) return/);
assert.match(account, /function adminSystemConfig\([^)]*\) \{\s*if \(!isAdmin\(\)\) return/);
assert.match(account, /if \(!isAdmin\(\)\)[\s\S]*?memberPersonalSummary\(p, linked\)[\s\S]*?return;\s*}\s*const memberWorkspace/);
assert(!/client\.from\(['"]audit_logs['"]\)/.test([app, account, players].join('\n')));
assert(players.includes("client.rpc('record_rating_adjustment_active'"));
assert(account.includes("client.rpc('get_audit_events'"));
assert.match(app, /state\.profile\.membership_status !== 'APPROVED'/);
const renderSource = app.slice(app.indexOf('function render()'));
const dispatch = /switch\s*\(\s*state\.page/.exec(renderSource);
assert(dispatch && renderSource.indexOf('forcedPasswordChange(root);') >= 0);
assert(renderSource.indexOf('forcedPasswordChange(root);') < dispatch.index);
console.log('PASS WP-C9: actual frontend gate/shortcut/Player/Account functions; 10 single caps, mixed/ADMIN/inactive/normal; exact Rating/Audit boundaries and RPC wiring. Backend denial/live role verification not claimed by this test.');
