const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const rootPath = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(rootPath, 'players.js'), 'utf8');
const appSource = fs.readFileSync(path.join(rootPath, 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(rootPath, 'app.css'), 'utf8');

class Element {
  constructor(tag, text = '', className = '') {
    this.tag = tag;
    this.textContent = text == null ? '' : String(text);
    this.className = className || '';
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.isConnected = false;
  }

  append(...nodes) {
    const connectTree = (node, connected) => {
      if (!(node instanceof Element)) return;
      node.isConnected = connected;
      node.children.forEach(child => connectTree(child, connected));
    };

    nodes.forEach(node => {
      this.children.push(node);
      if (node && typeof node === 'object') {
        node.parent = this;
        connectTree(node, this.isConnected);
        if (this.tag === 'select' && !this.value && node.value) {
          this.value = node.value;
        }
      }
    });
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.textContent = '';
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

  focus() {
    this.focused = true;
  }
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

async function fire(node, name, event = {}) {
  for (const handler of node.events[name] || []) {
    await handler({ preventDefault() {}, ...event });
  }
  await new Promise(resolve => setImmediate(resolve));
}

function mount({
  role = 'ADMIN',
  canManage = true,
  rpcResult = {
    data: {
      success: true,
      changed: false,
      new_initial_rating: 3.5,
      new_current_rating: 3.5
    },
    error: null
  },
  rpcHandler = null
} = {}) {
  const contentRoot = new Element('main');
  contentRoot.isConnected = true;
  const globalMessage = new Element('div');
  const calls = [];
  const players = [{
    id: 'player-1',
    full_name: 'VĐV Fixture',
    player_type: 'CLUB',
    status: 'ACTIVE',
    phone: '',
    joined_at: '2026-01-01',
    date_of_birth: '1990-01-01',
    notes: 'Giữ nguyên',
    initial_rating: 3.5,
    current_rating: 3.75
  }];
  let renderCount = 0;
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

  const context = {
    $: id => id === 'content' ? contentRoot : globalMessage,
    state: {
      data: {
        players,
        matches: [],
        match_players: [],
        rating_events: [],
        rating_settings: [{
          algorithm_version: 'V1.1',
          initial_rating: 4,
          min_rating: 2,
          max_rating: 8,
          is_active: true
        }]
      },
      profile: {
        id: 'actor',
        role,
        is_active: true,
        can_manage_members: canManage
      },
      session: { user: { id: 'actor' } },
      generation: 1,
      errors: {},
      partial: {},
      writeBusy: false,
      busy: false,
      page: 'players'
    },
    client: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === 'set_player_initial_rating_before_history') {
          return rpcHandler ? rpcHandler(name, args) : rpcResult;
        }
        if (name === 'get_player_lifecycle_preview') {
          return {
            data: {
              player_id: 'player-1',
              current_status: 'ACTIVE',
              reference_total: 0,
              hard_delete_allowed: true
            },
            error: null
          };
        }
        return { data: null, error: null };
      }
    },
    isAdmin: () => role === 'ADMIN',
    canManageMembers: () => role === 'ADMIN' || canManage,
    canManagePlayers: () => role === 'ADMIN' || canManage,
    canManagePlayerLifecycle: () => role === 'ADMIN' || canManage,
    button: (label, fn, className = 'btn') => {
      const node = make('button', label, className);
      node.addEventListener('click', fn);
      return node;
    },
    actionAccordion: actionAccordionFactory(make),
    el: make,
    rows: table => context.state.data[table] || [],
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
    notice: (node, text, bad = false, good = false) => {
      node.textContent = text || '';
      node.hidden = !text;
      node.bad = bad;
      node.good = good;
    },
    load: async () => {},
    render: () => { renderCount += 1; },
    explain: error => String(error?.message || error || ''),
    playerName: id => players.find(player => player.id === id)?.full_name || id,
    matchCode: () => 'M-1',
    CURRENT_RATING_VERSION: 'V1.1'
  };

  context.paginatedList = require('./wp-c8-list-fixture.cjs')(context);
  window.PickPlayers.create(context).playersPage();
  return {
    root: contentRoot,
    globalMessage,
    calls,
    players,
    all: () => walk(contentRoot),
    text: () => content(contentRoot),
    renderCount: () => renderCount
  };
}

function findByText(fixture, tag, text) {
  return fixture.all().find(node => node.tag === tag && node.textContent === text);
}

function findById(fixture, id) {
  return fixture.all().find(node => node.id === id);
}

function formFor(fixture) {
  return findById(fixture, 'initial-rating-reason').parent.parent.parent;
}

function fillValid(fixture, rating = '4.250', reason = 'Đánh giá đầu vào chính xác hơn') {
  findById(fixture, 'initial-rating-new-value').value = rating;
  findById(fixture, 'initial-rating-reason').value = reason;
}

(async () => {
  const admin = mount();
  assert.equal(
    findById(admin, 'initial-rating-player-id').disabled,
    false,
    'Rating selector must be enabled after accordion content is attached to DOM'
  );
  console.log('PASS Rating selector enabled after connected accordion mount');
  const manager = mount({ role: 'MEMBER', canManage: true });
  const member = mount({ role: 'MEMBER', canManage: false });
  assert(findByText(admin, 'button', 'Điều chỉnh Rating ban đầu'));
  assert(!findByText(manager, 'button', 'Điều chỉnh Rating ban đầu'));
  assert(!findByText(member, 'button', 'Điều chỉnh Rating ban đầu'));
  assert.deepEqual(
    admin.all().filter(node => node.tag === 'button' && node.className === 'action-accordion-toggle').map(node => node.textContent),
    [
      'Tạo VĐV',
      'Chuyển VĐV khách thành thành viên',
      'Sửa thông tin VĐV',
      'Điều chỉnh Rating ban đầu',
      'Vòng đời VĐV',
      'Xóa vĩnh viễn VĐV'
    ]
  );
  console.log('PASS ADMIN-only action placement and delegated/MEMBER visibility');

  assert(admin.text().includes('Khởi tạo: 3.500 • Hiện tại: 3.750'));
  const rating = findById(admin, 'initial-rating-new-value');
  const reason = findById(admin, 'initial-rating-reason');
  assert.equal(rating.min, '2');
  assert.equal(rating.max, '8');
  assert.equal(rating.step, '0.001');
  assert.equal(rating.required, true);
  assert.equal(reason.required, true);
  assert.equal(reason.maxLength, 1000);

  reason.value = 'x';
  rating.value = '';
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('Rating mới là bắt buộc'));
  rating.value = 'abc';
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('phải là một số hợp lệ'));
  rating.value = '1.999';
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('Rating phải từ 2.000 đến 8.000'));
  rating.value = '8.001';
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('Rating phải từ 2.000 đến 8.000'));
  rating.value = '4.25';
  reason.value = '   ';
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('Lý do là bắt buộc'));
  reason.value = 'x'.repeat(1001);
  await fire(formFor(admin), 'submit');
  assert(admin.text().includes('không được vượt quá 1000 ký tự'));
  assert.equal(admin.calls.filter(call => call.name === 'set_player_initial_rating_before_history').length, 0);
  console.log('PASS summary and client-side required/number/range/reason validation');

  let resolvePending;
  const pending = mount({
    rpcHandler: () => new Promise(resolve => { resolvePending = resolve; })
  });
  fillValid(pending);
  const pendingSubmit = fire(formFor(pending), 'submit');
  await new Promise(resolve => setImmediate(resolve));
  assert(findByText(pending, 'button', 'Đang lưu…').disabled);
  assert(findById(pending, 'initial-rating-player-id').disabled);
  resolvePending({ data: { changed: false }, error: null });
  await pendingSubmit;
  assert(!findByText(pending, 'button', 'Lưu Rating ban đầu').disabled);
  console.log('PASS duplicate-submit controls while RPC is pending');

  const changed = mount({
    rpcResult: {
      data: {
        success: true,
        changed: true,
        new_initial_rating: 4.25,
        new_current_rating: 4.25
      },
      error: null
    }
  });
  fillValid(changed, '4.250', '  Hiệu chỉnh đầu vào  ');
  await fire(formFor(changed), 'submit');
  const call = changed.calls.find(item => item.name === 'set_player_initial_rating_before_history');
  assert.deepEqual(Object.keys(call.args).sort(), ['p_player_id', 'p_rating', 'p_reason']);
  assert.equal(call.args.p_player_id, 'player-1');
  assert.equal(call.args.p_rating, 4.25);
  assert.equal(call.args.p_reason, 'Hiệu chỉnh đầu vào');
  assert.equal(changed.players[0].initial_rating, 4.25);
  assert.equal(changed.players[0].current_rating, 4.25);
  assert.equal(changed.renderCount(), 1);
  assert.equal(changed.globalMessage.textContent, 'Đã cập nhật Rating ban đầu.');

  const unchanged = mount();
  fillValid(unchanged, '3.500', 'Không đổi');
  await fire(formFor(unchanged), 'submit');
  assert(unchanged.text().includes('Rating ban đầu không thay đổi.'));
  assert.equal(unchanged.renderCount(), 0);
  console.log('PASS exact RPC payload, changed refresh and unchanged feedback');

  const mappings = [
    ['PLAYER_RATING_HISTORY_EXISTS', 'VĐV đã có lịch sử Rated'],
    ['PLAYER_RATING_STATE_INCONSISTENT', 'Dữ liệu Rating hiện tại không đồng nhất'],
    ['PLAYER_RATING_OUT_OF_RANGE', 'Rating nằm ngoài phạm vi cho phép'],
    ['PLAYER_RATING_REQUIRED', 'Rating mới là bắt buộc'],
    ['RATING_ACTIVE_SETTINGS_INVALID', 'Cấu hình Rating hiện tại không hợp lệ'],
    ['RATING_ACTIVE_SETTINGS_HARD_RANGE_CONFLICT', 'Cấu hình Rating hiện tại không hợp lệ'],
    ['REASON_REQUIRED_MAX_1000', 'Lý do là bắt buộc'],
    ['PLAYER_NOT_FOUND', 'Không tìm thấy VĐV đã chọn'],
    ['ADMIN_REQUIRED', 'Chỉ ADMIN đang hoạt động'],
    ['BUSINESS_ACCESS_REQUIRED', 'Tài khoản hiện không được phép'],
    ['AUTH_REQUIRED', 'Phiên đăng nhập đã hết hạn']
  ];
  for (const [code, expected] of mappings) {
    const fixture = mount({ rpcResult: { data: null, error: { message: code, details: 'raw detail must stay hidden' } } });
    fillValid(fixture);
    await fire(formFor(fixture), 'submit');
    assert(fixture.text().includes(expected), code);
    assert(!fixture.text().includes('raw detail must stay hidden'), code);
  }
  console.log('PASS backend error mapping without PostgreSQL DETAIL exposure');

  assert(source.includes('function createPlayerForm'));
  assert(source.includes('function updatePlayerForm'));
  assert(source.includes('function promoteGuestForm'));
  assert(source.includes('function playerLifecycleManager'));
  assert(appSource.includes("'get_signup_rating_config'"));
  assert(cssSource.includes('.action-accordion-toggle{'));
  assert(cssSource.includes('min-height:54px;'));
  assert(cssSource.includes('.action-accordion-icon{'));
  assert(cssSource.includes('width:30px;'));
  assert(cssSource.includes('.players-ui .form-actions > .primary{flex-basis:100%;}'));
  assert(source.includes("el('div', null, 'form-grid')"));
  console.log('PASS creation/signup/promotion/lifecycle source boundaries and shared responsive Action Accordion');

  console.log('RATING-INITIAL01C UI TESTS PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
