'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
class Element {
  constructor(tag, text = '', cls = '') { this.tag = tag; this.textContent = text ?? ''; this.className = cls; this.children = []; this.value = ''; this.disabled = false; this.listeners = {}; this.attributes = {}; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  setAttribute(key, value) { this.attributes[key] = value; }
  fire(event) { if (event === 'click' && this.disabled) return; this.listeners[event]?.(); }
  all() { return [this, ...this.children.flatMap(child => child.all())]; }
}
const el = (tag, text, cls) => new Element(tag, text, cls);
const notices = [];
const state = { session: { user: { id: 'admin-fixture' } } };
const createList = require('./wp-c8-list-fixture.cjs')({ state, el,
  button: (text, fn) => { const node = el('button', text); node.addEventListener('click', fn); return node; },
  notice: (node, text) => notices.push(text) });
const players = Array.from({ length: 100 }, (_, index) => ({ id: `p${index}`, name: index === 24 ? 'Đặng Nguyễn Tên rất dài để kiểm tra bố cục' : `VĐV ${index}`,
  status: index % 2 ? 'INACTIVE' : 'ACTIVE', player_type: index % 3 ? 'CLUB' : 'GUEST' }));
function mount(data, key = 'players', extra = {}) {
  const root = el('section'); const content = el('div'); let visible = [];
  const controls = createList({ root, key, data, content, searchText: row => row.name,
    emptyText: 'Chưa có VĐV.', filters: [
      { key: 'status', label: 'Trạng thái', options: [['', 'Tất cả'], ['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']], matches: (row, value) => row.status === value },
      { key: 'type', label: 'Loại', options: [['', 'Tất cả'], ['CLUB', 'Club'], ['GUEST', 'Guest']], matches: (row, value) => row.player_type === value }
    ], renderRows: rows => { visible = rows; content.replaceChildren(...rows.map(row => el('article', row.name))); }, ...extra });
  const all = root.all();
  return { root, controls, get visible() { return visible; }, search: all.find(n => n.tag === 'input'), filters: all.filter(n => n.tag === 'select'),
    button: text => all.find(n => n.tag === 'button' && n.textContent === text),
    summary: all.find(n => n.className.includes('list-result-count')), message: all.find(n => n.tag === 'p' && n.className === 'muted text-sm') };
}
let list = mount(players);
assert.equal(list.visible.length, 20, '100 rows only render 20');
assert(list.button('Trang trước').disabled); assert(!list.button('Trang sau').disabled);
assert.equal(notices.length, 0, 'initial render silent');
list.button('Trang sau').fire('click'); assert.equal(list.visible[0].id, 'p20');
assert.match(list.summary.textContent, /21–40 \/ 100/);
list.search.value = '  DANG NGUYEN  '; list.search.fire('input');
assert.equal(list.visible[0].id, 'p24'); assert.equal(list.visible.length, 1);
assert(list.button('Trang trước').disabled); assert(list.button('Trang sau').disabled);
list.filters[0].value = 'INACTIVE'; list.filters[0].fire('change');
assert.equal(list.visible.length, 0, 'search AND filter');
assert.match(list.message.textContent, /Không tìm thấy/);
list.button('Xóa bộ lọc').fire('click'); assert.equal(list.visible[0].id, 'p0');
list.filters[1].value = 'GUEST'; list.filters[1].fire('change');
assert(list.visible.every(row => row.player_type === 'GUEST'));
list.filters[0].value = 'ACTIVE'; list.filters[0].fire('change');
assert(list.visible.every(row => row.status === 'ACTIVE' && row.player_type === 'GUEST'));
list.button('Xóa bộ lọc').fire('click');
for (let i = 0; i < 4; i++) list.button('Trang sau').fire('click');
assert.equal(list.visible[0].id, 'p80'); assert(list.button('Trang sau').disabled);
list.button('Trang trước').fire('click'); assert.equal(list.visible[0].id, 'p60');
const shrunk = players.slice(0, 25);
list = mount(shrunk); assert.equal(list.visible[0].id, 'p20', 'retained page clamps to final page');
assert.equal(list.visible.length, 5);
shrunk.splice(1); list.controls.refresh(); assert.equal(list.visible[0].id, 'p0');
assert(list.button('Trang trước').disabled && list.button('Trang sau').disabled);
const empty = mount([], 'empty'); assert.equal(empty.message.textContent, 'Chưa có VĐV.');
const unavailable = mount(players, 'error', { unavailable: true });
assert.equal(unavailable.visible.length, 0); assert.match(unavailable.summary.textContent, /Chưa tải/);
assert(unavailable.button('Trang trước').disabled && unavailable.button('Trang sau').disabled);
const ids = list.root.all().filter(n => n.id).map(n => n.id);
assert.equal(ids.length, new Set(ids).size);
assert(list.root.all().filter(n => n.tag === 'label').every(n => n.htmlFor && ids.includes(n.htmlFor)));
assert(list.root.all().some(n => n.className === 'sr-only'), 'announcement delivery does not add visible notice');
state.session.user.id = 'normal-fixture';
assert.equal(mount(players).visible[0].id, 'p0', 'list context isolated per account');

// Execute actual ranking rules; search must not recompute competition/tied ranks.
const app = read('app.js'); const scope = { rows: table => table === 'players' ? players.map((p, i) => ({ ...p, status: 'ACTIVE', player_type: 'CLUB', current_rating: 8 - Math.floor(i / 2) / 100 })) :
  players.flatMap(p => Array.from({ length: 5 }, (_, i) => ({ player_id: p.id, match_id: `${p.id}-${i}`, algorithm_version: 'v1' }))),
  currentRatingVersion: () => 'v1', officialMinMatches: () => 5, upper: x => x.toUpperCase(), num: Number, playerName: id => players.find(p => p.id === id).name };
vm.runInNewContext(app.slice(app.indexOf('      function ranking()'), app.indexOf('      const rankCols')), scope);
const ranked = Array.from(scope.ranking());
assert.equal(ranked[0].rank, 1); assert.equal(ranked[1].rank, 1); assert.equal(ranked[2].rank, 3);
const rankList = mount(ranked, 'ranking', { filters: [], searchText: p => p.name });
rankList.button('Trang sau').fire('click'); assert.equal(rankList.visible[0].rank, 21);
rankList.search.value = 'dang nguyen'; rankList.search.fire('input');
assert.equal(rankList.visible[0].rank, 25, 'global rank survives filtering');
assert.equal(rankList.visible[0].id, 'p24');
rankList.button('Xóa bộ lọc').fire('click'); assert.equal(rankList.visible[0].rank, 1);
const account = read('account.js'); const accountScope = {};
vm.runInNewContext(account.slice(account.indexOf('      function accountMemberPageRows'), account.indexOf('      function adminMemberLifecycle')), accountScope);
const members = [{ full_name: 'Nguyễn', membership_status: 'PENDING', is_active: false }, { login_name: 'Test', membership_status: 'APPROVED', is_active: true }];
assert.equal(accountScope.accountMemberPageRows(members, ' NGUYỄN ', 'PENDING', 'false').length, 1);
assert.equal(accountScope.accountMemberPageRows(members, 'test', '', '').length, 1);
assert.equal(accountScope.accountMemberPageRows(members, 'missing', '', '').length, 0);
assert.match(account, /Tìm tên hoặc nickname trong trang/);
assert.match(account, /const pageSize = 25/);
assert.match(account, /resultCount.setAttribute\('role', 'status'\)/);
let opened = 0;
const actionScope = { actionAccordion: options => {
  options.render({}, {}); return { wrapper: { open: () => options.onOpen() } };
} };
vm.runInNewContext(account.slice(account.indexOf('      function accountAction'), account.indexOf('      function memberPersonalSummary')), actionScope);
const accountAction = actionScope.accountAction({}, 'Thành viên', () => () => { opened++; });
assert.equal(opened, 0, 'closed Account list does not fetch');
accountAction.open(); assert.equal(opened, 1, 'Account loader receives shared onOpen');
const lifecycle = account.slice(account.indexOf('      function adminMemberLifecycle'), account.indexOf('      function adminCreateMember'));
assert(!lifecycle.includes('root.parentElement.open'), 'no stale details.open guard in primary directory');
assert.match(lifecycle, /return \(\) => \{\s+if \(!loaded && !reading && !saving\) return loadPage\(offset\)/);
assert.match(read('matches.js'), /names.teamA, ...names.teamB/);
assert.match(read('players.js'), /canManageMembers\(\) && canManagePlayers\(\)/);
assert.match(read('players.js'), /if \(canManagePlayerLifecycle\(\)\)/);
assert.match(read('app.css'), /@media \(max-width:700px\)[\s\S]*list-control:first-child/);
for (const [asset, version] of [['app.js', 'member-match01-20261009-1'], ['app.css', 'match-safari-date-20261009-2']]) assert(read('index.html').includes(`${asset}?v=${version}`));
for (const asset of ['account.js', 'players.js']) assert(read('index.html').includes(`${asset}?v=wp-c9-capability-surfaces-20261007-1`));
console.log('PASS WP-C8 real-helper 25/100-row search/filter/page/reset/clamp, global/tied rank, empty/error, context isolation, native controls and Account contract');
