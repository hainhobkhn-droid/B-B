const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const rootPath = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(rootPath, 'players.js'),
  'utf8'
);
const matchesSource = fs.readFileSync(
  path.join(rootPath, 'matches.js'),
  'utf8'
);

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
    this.isConnected = true;
  }

  append(...nodes) {
    nodes.forEach(node => {
      this.children.push(node);
      if (node && typeof node === 'object') {
        node.parent = this;
        if (
          this.tag === 'select' &&
          !this.value &&
          node.value
        ) {
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
    ...node.children.flatMap(child =>
      child instanceof Element
        ? walk(child)
        : []
    )
  ];
}

function content(node) {
  return [
    node.textContent,
    ...node.children.map(child =>
      child instanceof Element
        ? content(child)
        : String(child)
    )
  ].join(' ');
}

async function fire(node, name, event = {}) {
  for (const handler of node.events[name] || []) {
    await handler({
      preventDefault() {},
      ...event
    });
  }
  await new Promise(resolve => setImmediate(resolve));
}

function mount({
  role = 'ADMIN',
  canManage = true,
  status = 'ACTIVE',
  previewOverrides = {},
  deleteRace = false
} = {}) {
  const contentRoot = new Element('main');
  const globalMessage = new Element('div');
  const calls = [];
  const players = [{
    id: 'player-1',
    full_name: 'VĐV Fixture Tên Rất Dài Để Kiểm Tra',
    player_type: 'CLUB',
    status,
    phone: '',
    joined_at: '2026-01-01',
    date_of_birth: '1990-01-01',
    notes: '',
    initial_rating: 3.5,
    current_rating: 3.75
  }];
  let previewReads = 0;

  const preview = () => ({
    player_id: 'player-1',
    current_status: status,
    reference_total: 0,
    hard_delete_allowed: true,
    recommended_action: 'HARD_DELETE_PREVIEW_ELIGIBLE',
    ...previewOverrides,
    ...(deleteRace && previewReads > 1
      ? {
          reference_total: 1,
          match_players_count: 1,
          hard_delete_allowed: false,
          recommended_action: 'INACTIVATE_ONLY'
        }
      : {})
  });

  const make = (tag, text, className) =>
    new Element(tag, text, className);
  const window = {
    confirm: () => true
  };

  vm.runInNewContext(source, {
    window,
    document: {
      createElement: make
    },
    Option: function Option(text, value) {
      const option = make('option', text);
      option.value = value;
      return option;
    },
    console
  });

  const context = {
    $: id => id === 'content'
      ? contentRoot
      : globalMessage,
    state: {
      data: {
        players,
        matches: [],
        match_players: [],
        rating_events: []
      },
      profile: {
        id: 'actor',
        role,
        is_active: true,
        can_manage_members: canManage
      },
      session: {
        user: {
          id: 'actor'
        }
      },
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
        if (name === 'get_player_lifecycle_preview') {
          previewReads += 1;
          return {
            data: preview(),
            error: null
          };
        }
        if (
          name === 'delete_player_if_unreferenced' &&
          deleteRace
        ) {
          return {
            data: null,
            error: {
              message: 'PLAYER_HAS_REFERENCES'
            }
          };
        }
        if (name === 'delete_player_if_unreferenced') {
          return {
            data: {
              success: true,
              deleted: true,
              player_id: args.p_player_id
            },
            error: null
          };
        }
        if (name === 'set_player_lifecycle_status') {
          status = args.p_status;
          players[0].status = status;
          return {
            data: {
              success: true,
              changed: true,
              player_id: args.p_player_id,
              new_status: status
            },
            error: null
          };
        }
        return {
          data: null,
          error: null
        };
      }
    },
    isAdmin: () =>
      role === 'ADMIN',
    canManageMembers: () =>
      role === 'ADMIN' || canManage,
    button: (label, fn, className = 'btn') => {
      const button = make(
        'button',
        label,
        className
      );
      button.addEventListener('click', fn);
      return button;
    },
    el: make,
    rows: table =>
      context.state.data[table] || [],
    raw: value =>
      value == null ? '' : String(value),
    upper: value =>
      String(value || '').toUpperCase(),
    number: value =>
      String(value ?? '—'),
    dateCol: () => [],
    sources() {},
    table() {},
    panel: (title, root) => {
      const panel = make('section', '', 'panel');
      panel.append(make('h2', title));
      root.append(panel);
      return panel;
    },
    notice: (node, text, bad = false) => {
      node.textContent = text || '';
      node.hidden = !text;
      node.bad = bad;
    },
    load: async () => {},
    render: () => {},
    explain: error =>
      String(error?.message || error || ''),
    playerName: id =>
      players.find(player => player.id === id)?.full_name || id,
    matchCode: () => 'M-1',
    CURRENT_RATING_VERSION: 'v1'
  };

  window.PickPlayers.create(context).playersPage();
  return {
    root: contentRoot,
    calls,
    all: () => walk(contentRoot),
    text: () => content(contentRoot)
  };
}

function findByText(fixture, tag, text) {
  return fixture.all().find(node =>
    node.tag === tag &&
    node.textContent === text
  );
}

function findById(fixture, id) {
  return fixture.all().find(node =>
    node.id === id
  );
}

(async () => {
  const updateBlock = source.slice(
    source.indexOf('    function updatePlayerForm'),
    source.indexOf('    function playerLifecycleManager')
  );
  assert(!updateBlock.includes("const status = el(\n        'select'"));
  assert(updateBlock.includes("'Trạng thái (chỉ xem)'"));
  assert(updateBlock.includes('p_status:'));
  assert(updateBlock.includes('player.status'));

  const admin = mount();
  assert.deepEqual(
    admin.all()
      .filter(node =>
        node.tag === 'button' &&
        node.className === 'app-action-toggle'
      )
      .map(node => node.textContent),
    [
      '▶ Tạo VĐV',
      '▶ Chuyển VĐV khách thành thành viên',
      '▶ Sửa thông tin VĐV',
      '▶ Vòng đời VĐV',
      '▶ Xóa vĩnh viễn VĐV'
    ]
  );
  const lifecycleToggle = findByText(
    admin,
    'button',
    '▶ Vòng đời VĐV'
  );
  assert(lifecycleToggle);
  assert(findByText(admin, 'button', '▶ Xóa vĩnh viễn VĐV'));
  await fire(lifecycleToggle, 'click');
  assert(admin.calls.some(call =>
    call.name === 'get_player_lifecycle_preview'
  ));
  const lifecycleReason = findById(
    admin,
    'lifecycle-player-reason'
  );
  const lifecycleForm = lifecycleReason.parent.parent;
  await fire(lifecycleForm, 'submit');
  assert(!admin.calls.some(call =>
    call.name === 'set_player_lifecycle_status'
  ));
  assert(admin.text().includes('Lý do là bắt buộc'));
  lifecycleReason.value = '  Tạm nghỉ  ';
  await fire(lifecycleForm, 'submit');
  const deactivate = admin.calls.find(call =>
    call.name === 'set_player_lifecycle_status'
  );
  assert.equal(deactivate.args.p_player_id, 'player-1');
  assert.equal(deactivate.args.p_status, 'INACTIVE');
  assert.equal(deactivate.args.p_reason, 'Tạm nghỉ');

  const inactive = mount({ status: 'INACTIVE' });
  assert(inactive.text().includes('Ngừng hoạt động'));
  await fire(
    findByText(inactive, 'button', '▶ Vòng đời VĐV'),
    'click'
  );
  assert(findByText(inactive, 'button', 'Kích hoạt lại'));
  const reactivateReason = findById(
    inactive,
    'lifecycle-player-reason'
  );
  reactivateReason.value = 'Đã sẵn sàng';
  await fire(reactivateReason.parent.parent, 'submit');
  assert.equal(
    inactive.calls.find(call =>
      call.name === 'set_player_lifecycle_status'
    ).args.p_status,
    'ACTIVE'
  );

  const manager = mount({
    role: 'MEMBER',
    canManage: true
  });
  assert(findByText(manager, 'button', '▶ Vòng đời VĐV'));
  assert(!findByText(manager, 'button', '▶ Xóa vĩnh viễn VĐV'));

  const member = mount({
    role: 'MEMBER',
    canManage: false
  });
  assert(!findByText(member, 'button', '▶ Vòng đời VĐV'));
  assert(!findByText(member, 'button', '▶ Xóa vĩnh viễn VĐV'));
  assert(member.text().includes('Ngừng hoạt động') === false);

  const blockedDelete = mount({
    previewOverrides: {
      reference_total: 2,
      match_players_count: 2,
      hard_delete_allowed: false,
      recommended_action: 'INACTIVATE_ONLY'
    }
  });
  await fire(
    findByText(blockedDelete, 'button', '▶ Xóa vĩnh viễn VĐV'),
    'click'
  );
  assert(blockedDelete.text().includes('không thể xóa vĩnh viễn'));
  assert(findByText(blockedDelete, 'button', 'Xóa vĩnh viễn').disabled);

  const deleteAllowed = mount();
  await fire(
    findByText(deleteAllowed, 'button', '▶ Xóa vĩnh viễn VĐV'),
    'click'
  );
  const deleteReason = findById(
    deleteAllowed,
    'delete-player-reason'
  );
  deleteReason.value = 'Tạo nhầm';
  await fire(deleteReason.parent.parent, 'submit');
  assert(deleteAllowed.calls.some(call =>
    call.name === 'delete_player_if_unreferenced' &&
    call.args.p_reason === 'Tạo nhầm'
  ));

  const racedDelete = mount({ deleteRace: true });
  await fire(
    findByText(racedDelete, 'button', '▶ Xóa vĩnh viễn VĐV'),
    'click'
  );
  const racedReason = findById(
    racedDelete,
    'delete-player-reason'
  );
  racedReason.value = 'Dọn dữ liệu';
  await fire(racedReason.parent.parent, 'submit');
  assert.equal(
    racedDelete.calls.filter(call =>
      call.name === 'get_player_lifecycle_preview'
    ).length,
    2
  );
  assert(racedDelete.text().includes('vừa phát sinh dữ liệu liên quan'));
  assert(findByText(racedDelete, 'button', 'Xóa vĩnh viễn').disabled);

  assert(source.includes("upper(player.status) === 'ACTIVE'"));
  assert(source.includes("upper(player.status) === 'INACTIVE'"));
  assert(source.includes('function createPlayerForm'));
  assert(source.includes('function promoteGuestForm'));
  const matchPicker = matchesSource.slice(
    matchesSource.indexOf("const activePlayers = rows('players')"),
    matchesSource.indexOf("const activePlayers = rows('players')") + 500
  );
  assert(matchPicker.includes("player.status"));
  assert(matchPicker.includes("'ACTIVE'"));
  console.log('PASS: PLAYER-LIFECYCLE01E metadata, lifecycle, permission, preview, delete and race UI fixtures.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
