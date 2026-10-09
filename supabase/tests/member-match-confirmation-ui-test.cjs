'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'matches.js'), 'utf8');
class Element {
  constructor(tag, text = '', cls = '') { Object.assign(this, { tag, textContent: text ?? '', className: cls ?? '', children: [], listeners: {}, attributes: {}, value: '', isConnected: true }); this.classList = { toggle() {} }; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  fire(key) { if (key !== 'click' || !this.disabled) this.listeners[key]?.(); }
  all() { return [this, ...this.children.flatMap(n => n.all())]; }
}
const el = (tag, text, cls) => new Element(tag, text, cls);
const records = Array.from({ length: 28 }, (_, i) => ({ id: `m${i}`, match_number: i, played_at: `2026-10-${String(9 + i % 10).padStart(2, '0')}T04:00:00Z`,
  match_type: i % 2 ? 'CLUB_RATED' : 'TRAINING', status: i % 3 ? 'PENDING' : 'APPROVED', opponent_rejected: i % 3 === 2,
  my_team: i % 2 ? 'A' : 'B', team_a_score: 11, team_b_score: 7,
  players: ['A', 'A', 'B', 'B'].map((team, j) => ({ team, full_name: i === 24 ? 'Đặng Nguyễn Tên rất dài cho thiết bị di động' : `Player ${j} match ${i}` })) }));
async function mount({ data = { player_id: 'p1', matches: records }, error = null, admin = false } = {}) {
  const state = { profile: { role: admin ? 'ADMIN' : 'MEMBER' }, session: { user: { id: 'fixture' } } };
  const calls = []; const scope = { el, state, isAdmin: () => admin, raw: x => x == null ? '' : String(x), matchCode: m => m.id,
    explain: e => e.message, notice: (node, text) => { node.textContent = text; },
    client: { rpc: async (name, ...args) => { calls.push({ name, args }); return name === 'get_match_creator_context' ? { data: [{ match_id: 'm1', creator_name: 'Original creator' }] } : { data, error }; } },
    button: (text, fn) => { const n = el('button', text); n.addEventListener('click', fn); return n; } };
  scope.panel = (title, parent) => { const section = el('section', null, 'panel'); section.append(el('h2', title)); parent.append(section); return section; };
  scope.paginatedList = require('./wp-c8-list-fixture.cjs')(scope);
  scope.fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  vm.runInNewContext(app.slice(app.indexOf('// WP-C8 SHARED LIST START'), app.indexOf('// WP-C8 SHARED LIST END')), scope);
  scope.Node = Element;
  vm.runInNewContext(app.slice(app.indexOf('// WP-C4 SHARED ACTION ACCORDION START'), app.indexOf('// WP-C4 SHARED ACTION ACCORDION END')), scope);
  vm.runInNewContext(app.slice(app.indexOf('// MATCH LOOKUP SHARED RECORDS START'), app.indexOf('// MATCH LOOKUP SHARED RECORDS END')), scope);
  vm.runInNewContext(source.slice(source.indexOf('      // MEMBER-MATCH01:'), source.indexOf('      function matchesPage()')), scope);
  const node = el('main'); scope.memberMyMatches(node); await new Promise(resolve => setImmediate(resolve));
  return { node, scope, calls };
}
(async () => {
  const { node, scope, calls } = await mount();
  assert.equal(calls[0].name, 'get_my_matches'); assert.equal(calls[0].args.length, 0);
  const all = () => node.all(); const cards = () => all().filter(n => n.tag === 'article');
  const toggle = all().find(n => n.className === 'action-accordion-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  const body = all().find(n => n.className === 'action-accordion-panel'); assert.equal(body.hidden, true);
  toggle.fire('click'); assert.equal(body.hidden, false);
  assert.equal(cards().length, 20);
  assert.equal(all().filter(n => n.tag === 'tbody')[0].children.length, 20);
  assert(cards().every(n => n.className === 'table-mobile-card'));
  all().find(n => n.textContent === 'Trang sau').fire('click'); assert.equal(cards().length, 8);
  const search = all().find(n => n.tag === 'input'); search.value = 'dang nguyen'; search.fire('input'); assert.equal(cards().length, 1);
  search.value = ''; search.fire('input');
  const filter = all().find(n => n.tag === 'select'); filter.value = 'REJECTED'; filter.fire('change');
  assert.equal(cards().length, records.filter(m => m.opponent_rejected).length);
  assert(cards().every(n => n.all().some(c => c.textContent === 'Bị từ chối')));
  assert(all().some(n => n.textContent.includes('28 trận tham gia')));
  const dates = all().filter(n => n.tag === 'input' && n.type === 'date');
  const size = all().filter(n => n.tag === 'select')[1];
  assert.equal(dates.length, 2);
  assert.deepEqual(all().filter(n => n.tag === 'label').map(n => n.textContent),
    ['Tìm kiếm', 'Trạng thái', 'Từ ngày', 'Đến ngày', 'Số dòng / trang']);
  assert.equal(new Set(all().filter(n => n.tag === 'label').map(n => n.htmlFor)).size, 5);
  filter.value = ''; filter.fire('change');
  size.value = '50'; size.fire('change'); assert.equal(cards().length, 28);
  dates[0].value = '2026-10-10'; dates[0].fire('change');
  dates[1].value = '2026-10-10'; dates[1].fire('change');
  assert.equal(cards().length, 3); // Inclusive calendar day, both boundaries.
  filter.value = 'PENDING'; filter.fire('change');
  assert.equal(cards().length, records.filter(m => scope.myMatchCalendarDate(m) === '2026-10-10' && scope.myMatchStatus(m) === 'PENDING').length);
  search.value = '  PLAYER 0 match 1  '; search.fire('input'); assert.equal(cards().length, 1);
  dates[0].value = '2026-10-11'; dates[0].fire('change'); assert.equal(cards().length, 0);
  assert(all().some(n => n.textContent === 'Từ ngày phải trước hoặc bằng Đến ngày.' && !n.hidden));
  assert.equal(dates[0].value, '2026-10-11'); // No silent swapping.
  all().find(n => n.textContent === 'Xóa bộ lọc').fire('click');
  assert.equal(cards().length, 28); assert.equal(size.value, '50');
  size.value = '20'; size.fire('change');
  all().find(n => n.textContent === 'Trang sau').fire('click'); assert.equal(cards().length, 8);
  dates[0].value = '2026-10-09'; dates[0].fire('change');
  assert.equal(cards().length, 20); assert(all().some(n => n.textContent === 'Trang 1/2'));
  assert.equal(scope.myMatchCalendarDate({ played_at: '2026-10-09T17:00:00Z' }), '2026-10-10');
  assert.equal(scope.myMatchCalendarDate({ played_at: '2026-10-09T16:59:59Z' }), '2026-10-09');
  search.value = 'no such opponent'; search.fire('input'); assert.equal(cards().length, 0);
  assert(all().some(n => n.textContent.includes('Không tìm thấy trận đấu phù hợp với bộ lọc.')));
  const empty = await mount({ data: { player_id: 'p1', matches: [] } });
  assert(empty.node.all().some(n => n.textContent === 'Bạn chưa có trận đấu nào.'));
  const parent = el('div'); scope.appendMatchCreator(parent, { id: 'm1' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(parent.children[0].textContent, 'Người tạo: Original creator');
  scope.appendMatchCreator(parent, { id: 'missing' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(parent.children[1].textContent, 'Người tạo: Không xác định');
  const unlinked = await mount({ data: { player_id: null, matches: [] } });
  assert(unlinked.node.all().some(n => n.textContent === 'Tài khoản chưa liên kết với hồ sơ VĐV.'));
  const failed = await mount({ error: { message: 'read model unavailable' } });
  assert.equal(failed.node.all().filter(n => n.tag === 'article').length, 0);
  assert(failed.node.all().some(n => n.textContent === 'read model unavailable'));
  assert.equal((await mount({ admin: true })).calls.length, 0);
  const page = source.slice(source.indexOf('      function matchesPage()'));
  assert(page.indexOf('memberOpponentConfirmationPanel(root)') < page.indexOf("el('h2', 'Thao tác'"));
  assert(page.indexOf('createMyPendingMatchForm(') < page.indexOf('memberMyMatches(actionRoot)'));
  assert(page.indexOf('memberMyMatches(actionRoot)') < page.indexOf('matchHistoryLookup(actionRoot)'));
  const historyRoot = el('div'); const lookupCalls = []; scope.table = (...args) => lookupCalls.push(args);
  scope.recent = value => value; scope.rows = () => []; scope.matchCols = []; scope.state.errors = {};
  scope.matchHistoryLookup(historyRoot);
  assert.equal(historyRoot.all().find(n => n.className === 'action-accordion-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(historyRoot.all().find(n => n.className === 'action-accordion-panel').hidden, true);
  assert.equal(lookupCalls.length, 1);
  assert.equal(lookupCalls[0][0].className, 'action-accordion-panel');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  scope.badge = value => el('span', value, 'status');
  vm.runInNewContext(app.slice(app.indexOf('      function table('), app.indexOf('      const col =')), scope);
  scope.rows = () => records;
  scope.matchCols = [['Mã trận', m => m.id], ['Thời gian', m => m.played_at], ['Đội A', m => m.players.filter(p => p.team === 'A').map(p => p.full_name).join(' + ')], ['Tỷ số', m => `${m.team_a_score} – ${m.team_b_score}`], ['Đội B', m => m.players.filter(p => p.team === 'B').map(p => p.full_name).join(' + ')], ['Thể thức', m => m.match_type], ['Trạng thái', m => scope.badge(m.status)]];
  const sharedHistory = el('div'); scope.matchHistoryLookup(sharedHistory);
  const historyNodes = () => sharedHistory.all();
  assert.equal(historyNodes().filter(n => n.className === 'match-lookup-filter-toolbar').length, 1);
  assert.equal(all().filter(n => n.className === 'match-lookup-filter-toolbar').length, 1);
  assert.deepEqual(historyNodes().filter(n => n.tag === 'label').map(n => n.textContent), ['Tìm kiếm', 'Trạng thái', 'Từ ngày', 'Đến ngày', 'Số dòng / trang']);
  const historySizes = historyNodes().filter(n => n.tag === 'select')[1];
  assert.deepEqual(historySizes.children.map(n => n.textContent), ['20', '50']);
  const historyToolbar = historyNodes().find(n => n.className === 'match-lookup-filter-toolbar');
  assert.equal(historyToolbar.children.at(-1).textContent, 'Xóa bộ lọc');
  assert.equal(historyToolbar.children.at(-1).disabled, true);
  const historySearch = historyNodes().find(n => n.type === 'search');
  historySearch.value = '  PLAYER 0 MATCH 1  '; historySearch.fire('input');
  assert.equal(historyToolbar.children.at(-1).disabled, false);
  assert.equal(historyNodes().filter(n => n.tag === 'article').length, 11);
  const historyStatus = historyNodes().filter(n => n.tag === 'select')[0];
  historyStatus.value = 'APPROVED'; historyStatus.fire('change');
  assert.equal(historyNodes().filter(n => n.tag === 'article').length, records.filter(m => m.id.startsWith('m1') && m.status === 'APPROVED').length);
  historyToolbar.children.at(-1).fire('click');
  assert.equal(historySearch.value, ''); assert.equal(historyStatus.value, '');
  const historyDates = historyNodes().filter(n => n.type === 'date');
  historyDates[0].value = '2026-10-10'; historyDates[0].fire('change'); historyDates[1].value = '2026-10-10'; historyDates[1].fire('change');
  assert.equal(historyNodes().filter(n => n.tag === 'article').length, 3);
  historyDates[0].value = '2026-10-11'; historyDates[0].fire('change');
  assert(historyNodes().some(n => n.textContent === 'Từ ngày phải trước hoặc bằng Đến ngày.'));
  assert.equal(historyNodes().filter(n => n.tag === 'article').length, 0);
  historyToolbar.children.at(-1).fire('click'); historySizes.value = '50'; historySizes.fire('change');
  assert.equal(historyNodes().filter(n => n.tag === 'article').length, 28);
  const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
  assert.match(css, /match-lookup-filter-toolbar[\s\S]*grid-template-columns:minmax\(0,2fr\)/);
  assert.match(css, /@media \(max-width:700px\)\s*\{\s*\.matches-ui \.match-lookup-filter-toolbar \{ grid-template-columns:minmax\(0,1fr\)/);

  const confirmation = source.slice(source.indexOf('function memberOpponentConfirmationPanel'), source.indexOf('// MEMBER-MATCH01:'));
  assert.match(confirmation, /item\.can_confirm ===\s*true/);
  for (const rpc of ['confirm_match_by_opponent', 'reject_match_by_opponent', 'update_my_rejected_pending_match', 'resubmit_my_rejected_match']) assert(confirmation.includes(rpc));
  assert.match(confirmation, /state\.writeBusy/); assert.match(confirmation, /\.disabled =\s*true/);
  assert.match(confirmation, /await load\(\);\s*render\(\)/);
  console.log('MEMBER Match UI: participant read-model, 28 records, summary, search, filters, pagination, creator, fallback, error, hierarchy PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
