const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const matchesSource = fs.readFileSync(path.join(root, 'matches.js'), 'utf8');

class Element {
  constructor(tag, text = '', className = '') {
    this.tag = tag;
    this.textContent = text == null ? '' : String(text);
    this.className = className || '';
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.value = '';
    this.id = '';
    this.hidden = false;
    this.disabled = false;
    this.required = false;
    this.type = '';
    this.style = {};
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    };
  }

  get options() {
    return this.tag === 'select' ? this.children : [];
  }

  append(...nodes) {
    for (const node of nodes) {
      this.children.push(node);
      if (node && typeof node === 'object') node.parent = this;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.value = '';
    this.append(...nodes);
  }

  addEventListener(name, handler) {
    (this.events[name] ||= []).push(handler);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      return walk(this).find(node => node.id === selector.slice(1)) || null;
    }
    return null;
  }

  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
}

function walk(node) {
  return [node, ...node.children.flatMap(child => child instanceof Element ? walk(child) : [])];
}


function actionAccordionFactory(make) {
  return ({
    root = null,
    title,
    semantic = 'neutral',
    group = null,
    onOpen = null,
    render = null,
    className = ''
  }) => {
    const wrapper = make('section', '', `action-accordion action-accordion-${semantic}${className ? ` ${className}` : ''}`);
    const toggle = make('button', title, 'action-accordion-toggle');
    const body = make('div', '', 'action-accordion-panel');
    const controller = {
      wrapper,
      toggle,
      body,
      title,
      setExpanded(open) {
        if (open && Array.isArray(group)) {
          group.forEach(item => item !== controller && item.setExpanded(false));
        }
        const wasOpen = !body.hidden;
        body.hidden = !open;
        toggle.attributes['aria-expanded'] = String(!!open);
        if (open && !wasOpen && onOpen) return onOpen(controller);
      }
    };
    body.hidden = true;
    toggle.type = 'button';
    toggle.addEventListener('click', () => controller.setExpanded(body.hidden));
    wrapper.append(toggle, body);
    if (Array.isArray(group)) group.push(controller);
    if (root) root.append(wrapper);
    if (render) render(body, controller);
    return controller;
  };
}

function mount({ leagues, leagueError } = {}) {
  const content = new Element('main');
  const globalMessage = new Element('div');
  const make = (tag, text, className) => new Element(tag, text, className);
  const window = {};

  vm.runInNewContext(matchesSource, {
    window,
    document: { createElement: make },
    Option: function Option(text, value) {
      const option = make('option', text);
      option.value = String(value ?? '');
      return option;
    },
    console,
    DOMException,
    queueMicrotask,
    setTimeout,
    clearTimeout
  });

  const data = {
    players: [],
    matches: [{
      id: 'match-pending',
      status: 'PENDING',
      match_type: 'CLUB_RATED',
      score_mode: 'POINTS',
      team_a_score: 11,
      team_b_score: 8,
      played_at: '2026-10-04T01:00:00Z'
    }],
    match_players: [],
    tournaments: [],
    rating_events: []
  };
  if (leagues !== undefined) data.leagues = leagues;

  const state = {
    data,
    errors: leagueError ? { leagues: leagueError } : {},
    partial: {},
    profile: { role: 'ADMIN', is_active: true },
    session: { user: { id: 'admin' } },
    navigationIntent: null,
    writeBusy: false,
    generation: 1,
    page: 'matches'
  };
  const sourceRequests = [];

  const context = {
    $: id => id === 'content' ? content : globalMessage,
    state,
    client: { rpc: async () => ({ data: null, error: null }) },
    isAdmin: () => true,
    canApproveMatches: () => true,
    button: (label, handler, className = 'btn') => {
      const node = make('button', label, className);
      node.addEventListener('click', handler);
      return node;
    },
    actionAccordion: actionAccordionFactory(make),
    panel: (title, parent) => {
      const node = make('section', '', 'panel');
      node.append(make('h2', title));
      parent.append(node);
      return node;
    },
    el: make,
    rows: table => state.data[table] || [],
    raw: value => value == null ? '' : String(value),
    pick: (record, ...keys) => keys.map(key => record?.[key]).find(value => value != null),
    notice() {},
    load: async () => {},
    render() {},
    explain: error => String(error?.message || error || ''),
    sources: (_parent, tables) => sourceRequests.push([...tables]),
    recent: rows => rows,
    table() {},
    matchCols: [],
    matchCode: () => 'M-1'
  };

  window.PickMatches.create(context).matchesPage();
  return { nodes: walk(content), sourceRequests };
}

function select(fixture, id) {
  const result = fixture.nodes.find(node => node.tag === 'select' && node.id === id);
  assert(result, `missing select #${id}`);
  return result;
}

const tableBlock = appSource.slice(
  appSource.indexOf('      const tables = ['),
  appSource.indexOf('      const labels = {')
);
assert.match(tableBlock, /'leagues'/);
assert.equal((tableBlock.match(/'leagues'/g) || []).length, 1);
assert.match(appSource, /leagues:\s*'Giải nội bộ'/);
console.log('PASS shared loader registers leagues exactly once with an error label');

const leagueRows = [
  { id: 'league-planned', name: 'Giải A', code: 'A', status: 'DU_KIEN' },
  { id: 'league-running', name: 'Giải B', code: 'B', status: 'DANG_DIEN_RA' },
  { id: 'league-ended', name: 'Giải C', code: 'C', status: 'DA_KET_THUC' }
];
const populated = mount({ leagues: leagueRows });
for (const id of ['create-league', 'edit-league']) {
  const control = select(populated, id);
  assert.deepEqual(control.options.map(option => option.value), ['', 'league-planned', 'league-running']);
}
assert(populated.sourceRequests.some(tables => tables.includes('leagues')));
console.log('PASS create/edit selectors consume loaded attachable League rows without navigation');

const empty = mount({ leagues: [] });
for (const id of ['create-league', 'edit-league']) {
  const control = select(empty, id);
  assert.equal(control.options.length, 1);
  assert.equal(control.options[0].textContent, 'Chưa có giải nội bộ phù hợp');
}
console.log('PASS empty League dataset has an explicit valid empty state');

const failed = mount({ leagueError: 'NETWORK_ERROR' });
for (const id of ['create-league', 'edit-league']) {
  const control = select(failed, id);
  assert.equal(control.options.length, 1);
  assert.equal(control.options[0].textContent, 'Không tải được danh sách giải nội bộ');
}
assert(failed.sourceRequests.some(tables => tables.includes('leagues')));
console.log('PASS loader failure is distinct from an empty League dataset');

const loading = mount();
assert.equal(select(loading, 'create-league').options[0].textContent, 'Đang tải danh sách giải nội bộ…');
assert.equal(select(loading, 'edit-league').options[0].textContent, 'Đang tải danh sách giải nội bộ…');
console.log('PASS pre-load state is explicit and does not masquerade as empty');

assert.match(matchesSource, /client\.rpc\(\s*'create_pending_match'/);
assert.match(matchesSource, /client\.rpc\(\s*'update_pending_match'/);
assert.match(matchesSource, /client\.rpc\(\s*'confirm_match_by_opponent'/);
assert.match(matchesSource, /client\.rpc\(\s*'reject_match_by_opponent'/);
assert.match(matchesSource, /client\.rpc\(\s*'resubmit_my_rejected_match'/);
assert.doesNotMatch(matchesSource, /\.from\(\s*['"]leagues['"]\s*\)\.(?:insert|update|delete|upsert)/);
console.log('PASS Match create/edit and P1.2/P1.2b paths remain wired; no League mutation added');
