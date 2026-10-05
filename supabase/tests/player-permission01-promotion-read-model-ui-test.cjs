const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const rootPath = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(rootPath, 'players.js'), 'utf8');

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
    this.isConnected = true;
  }

  append(...nodes) {
    nodes.forEach(node => {
      this.children.push(node);
      if (node && typeof node === 'object') {
        node.parent = this;
        if (this.tag === 'select' && !this.value && node.value) {
          this.value = node.value;
        }
      }
    });
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.append(...nodes);
  }

  addEventListener(name, fn) {
    (this.events[name] ||= []).push(fn);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelector() {
    return null;
  }

  focus() {}
}

function walk(node) {
  return [
    node,
    ...node.children.flatMap(child => child instanceof Element ? walk(child) : [])
  ];
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

function content(node) {
  return [
    node.textContent,
    ...node.children.map(child => child instanceof Element ? content(child) : String(child))
  ].join(' ');
}

async function fire(node, name) {
  for (const handler of node.events[name] || []) {
    await handler({ preventDefault() {} });
  }
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

function mount({
  role = 'MEMBER',
  members = false,
  players = false,
  lifecycle = false,
  candidateRows = [
    {
      candidate_kind: 'MEMBER_TARGET',
      profile_id: 'profile-target',
      profile_full_name: 'Thành viên mục tiêu',
      player_id: 'temp-player',
      player_full_name: 'Player tạm',
      player_type: 'CLUB',
      status: 'ACTIVE',
      current_rating: 4
    },
    {
      candidate_kind: 'GUEST_SOURCE',
      profile_id: null,
      profile_full_name: null,
      player_id: 'guest-player',
      player_full_name: 'VĐV khách',
      player_type: 'GUEST',
      status: 'ACTIVE',
      current_rating: 4.5
    }
  ],
  candidateError = null
} = {}) {
  const contentRoot = new Element('main');
  const globalMessage = new Element('div');
  const calls = [];
  let directReads = 0;
  const make = (tag, text, className) => new Element(tag, text, className);
  const window = { confirm: () => true };

  vm.runInNewContext(source, {
    window,
    document: { createElement: make },
    Option: function Option(text, value) {
      const option = make('option', text);
      option.value = value;
      return option;
    },
    console
  });

  const state = {
    data: { players: [], matches: [], match_players: [], rating_events: [] },
    profile: {
      id: 'actor', role, is_active: true,
      can_manage_members: members,
      can_manage_players: players,
      can_manage_player_lifecycle: lifecycle
    },
    session: { user: { id: 'actor' } },
    generation: 1,
    errors: {},
    partial: {},
    writeBusy: false,
    busy: false,
    page: 'players'
  };

  const context = {
    $: id => id === 'content' ? contentRoot : globalMessage,
    state,
    client: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'get_guest_member_promotion_candidates') {
          return { data: candidateRows, error: candidateError };
        }
        return { data: null, error: null };
      },
      from: () => {
        directReads += 1;
        throw new Error('promotion workflow must not read players directly');
      }
    },
    isAdmin: () => role === 'ADMIN',
    canManageMembers: () => role === 'ADMIN' || members,
    canManagePlayers: () => role === 'ADMIN' || players,
    canManagePlayerLifecycle: () => role === 'ADMIN' || lifecycle,
    button: (label, fn, className = 'btn') => {
      const node = make('button', label, className);
      node.addEventListener('click', fn);
      return node;
    },
    actionAccordion: actionAccordionFactory(make),
    el: make,
    rows: table => state.data[table] || [],
    raw: value => value == null ? '' : String(value),
    upper: value => String(value || '').toUpperCase(),
    number: value => String(value ?? '—'),
    dateCol: () => [],
    sources() {},
    table() {},
    panel: (title, root) => {
      const node = make('section', '', 'panel');
      node.append(make('h2', title));
      root.append(node);
      return node;
    },
    notice: (node, text, bad = false) => {
      node.textContent = text || '';
      node.hidden = !text;
      node.bad = bad;
    },
    load: async () => {},
    render() {},
    explain: error => String(error?.message || error || ''),
    playerName: id => id,
    matchCode: () => 'M-1',
    CURRENT_RATING_VERSION: 'v1'
  };

  window.PickPlayers.create(context).playersPage();
  return {
    state,
    calls,
    directReads: () => directReads,
    all: () => walk(contentRoot),
    text: () => content(contentRoot)
  };
}

function promotionToggle(fixture) {
  return fixture.all().find(node =>
    node.tag === 'button' &&
    node.textContent.includes('Chuyển VĐV khách thành thành viên')
  );
}

(async () => {
  const promotionBlock = source.slice(
    source.indexOf('    function promoteGuestForm'),
    source.indexOf('    function playersPage')
  );
  assert(promotionBlock.includes("client.rpc('get_guest_member_promotion_candidates')"));
  assert(!promotionBlock.includes("client.from('players')"));
  assert(!promotionBlock.includes('allRows('));
  assert(promotionBlock.includes('state.generation === generation'));
  assert(promotionBlock.includes('state.session?.user?.id === actor'));
  assert(promotionBlock.includes('committed = true'));

  for (const config of [
    { role: 'ADMIN' },
    { members: true, players: true }
  ]) {
    const fixture = mount(config);
    const toggle = promotionToggle(fixture);
    assert(toggle, config);
    await fire(toggle, 'click');
    assert.equal(
      fixture.calls.filter(call =>
        call.name === 'get_guest_member_promotion_candidates'
      ).length,
      1
    );
    assert.equal(fixture.directReads(), 0);
    assert(fixture.text().includes('Thành viên mục tiêu'));
    assert(fixture.text().includes('VĐV khách'));
    assert(fixture.text().includes('Chọn hai hồ sơ để kiểm tra trước khi chuyển.'));
  }
  console.log('PASS ADMIN and BOTH-cap MEMBER use authoritative promotion read model');

  for (const config of [
    { members: true },
    { players: true },
    {}
  ]) {
    const fixture = mount(config);
    assert.equal(promotionToggle(fixture), undefined, config);
    assert.equal(
      fixture.calls.some(call =>
        call.name === 'get_guest_member_promotion_candidates'
      ),
      false
    );
  }
  console.log('PASS members-only, players-only and normal MEMBER hide promotion');

  const noMembers = mount({
    members: true,
    players: true,
    candidateRows: [{
      candidate_kind: 'GUEST_SOURCE',
      player_id: 'guest-player',
      player_full_name: 'VĐV khách',
      player_type: 'GUEST',
      status: 'ACTIVE',
      current_rating: 4
    }]
  });
  await fire(promotionToggle(noMembers), 'click');
  assert(noMembers.text().includes('Không có MEMBER đang hoạt động có Player liên kết.'));

  const noGuests = mount({
    members: true,
    players: true,
    candidateRows: [{
      candidate_kind: 'MEMBER_TARGET',
      profile_id: 'profile-target',
      profile_full_name: 'Thành viên mục tiêu',
      player_id: 'temp-player'
    }]
  });
  await fire(promotionToggle(noGuests), 'click');
  assert(noGuests.text().includes('Không có VĐV khách đang hoạt động.'));
  console.log('PASS legitimate empty states remain explicit');

  const denied = mount({
    members: true,
    players: true,
    candidateError: {
      message: 'MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'
    }
  });
  await fire(promotionToggle(denied), 'click');
  assert(denied.text().includes('Không tải được danh sách.'));
  assert(denied.text().includes('MEMBER_AND_PLAYER_MANAGEMENT_PERMISSION_REQUIRED'));
  assert(!denied.text().includes('Không có VĐV khách đang hoạt động.'));
  console.log('PASS authorization/network errors are not disguised as empty data');

  console.log('WP-C2 PROMOTION READ MODEL UI TESTS PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
