const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = process.argv[2] || path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const account = read('account.js');
const players = read('players.js');
const matches = read('matches.js');
const fund = read('fund.js');
const css = read('app.css');
const index = read('index.html');

function ordered(source, ...needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = source.indexOf(needle, cursor + 1);
    assert(next >= 0, `Missing hierarchy marker: ${needle}`);
    assert(next > cursor, `Wrong hierarchy order at: ${needle}`);
    cursor = next;
  }
}

// Players: management actions exist only for the current capability boundary,
// receive one shared heading, and remain before the read directory.
const playerPage = players.slice(players.indexOf('function playersPage()'));
ordered(
  playerPage,
  "const hasManagementActions =",
  "el('h2', 'Thao tác', 'workflow-section-heading')",
  "collapsibleAdminSection(",
  'playerDetailSection(root)'
);
assert.match(playerPage, /canManagePlayers\(\) \|\|\s*isAdmin\(\) \|\|\s*canManagePlayerLifecycle\(\)/);
assert(!playerPage.includes("el('h2', 'Cần xử lý'"), 'Players must not invent a pending queue');

// Account: member review workspace precedes all generic ADMIN actions.
ordered(
  account,
  "const memberWorkspace = el('section'",
  "accountAction(memberWorkspace, 'Thành viên'",
  "const adminActions = el('section'",
  "el('h2', 'Thao tác'",
  "accountAction(adminActions, 'Đổi mật khẩu'",
  "accountAction(adminActions, 'Tạo tài khoản thành viên'"
);
assert.match(account, /if \(!isAdmin\(\)\)[\s\S]*?const selfActions = el\('section'[\s\S]*?accountAction\(selfActions, 'Đổi mật khẩu'/);

// MEMBER Match: actor-specific confirmation/rejected queue is mounted before create.
const matchesPage = matches.slice(matches.indexOf('function matchesPage()'));
ordered(
  matchesPage,
  'memberOpponentConfirmationPanel(root)',
  "el('h2', 'Thao tác', 'workflow-section-heading')",
  'createMyPendingMatchForm('
);
assert.match(matches, /confirmationAction\.wrapper\.hidden = true/);
assert.match(matches, /if \(error\)[\s\S]*?confirmationAction\.wrapper\.hidden =\s*false/);
assert.match(matches, /actionable\.length === 0[\s\S]*?confirmationAction\.wrapper\.hidden =\s*true/);
assert(matches.indexOf("'Cần xử lý'") < matches.indexOf("'Thao tác'"));

// Fund: authoritative outstanding/error decides whether debt precedes actions.
ordered(
  fund,
  'const debtNeedsAttention =',
  "el('h2', 'Cần xử lý', 'workflow-section-heading')",
  'fundDebtWorkspace',
  'fundActionWorkspace'
);
assert.match(fund, /!debtDataComplete \|\|\s*Number\(totalOutstanding\) > 0/);
assert.match(fund, /if \(fundActionWorkspace\)[\s\S]*?root\.append\(fundActionWorkspace\)[\s\S]*?if \(fundDebtWorkspace\)/);

// Tournament: loading/error/pending registration attention is before actions.
ordered(
  app,
  'let tournamentNeedsRoot = null',
  'state.errors.tournament_registrations',
  "upper(registration.status) === 'DANG_KY'",
  'if (tournamentNeedsRoot)',
  'root.append(tournamentNeedsRoot)',
  'root.append(tournamentActionRoot)'
);
assert.match(app, /!ready\('tournament_registrations'\)[\s\S]*?Đang tải đăng ký giải cần xử lý/);
assert.match(app, /canManageTournaments\(\)[\s\S]*?pendingRegistrations/);

// Overview already follows the decision-first contract; read-only surfaces stay free
// of fabricated management headings.
ordered(app, 'root.append(hero)', 'overviewManagementWorkspace(root)');
const contribution = app.slice(app.indexOf('function contributions()'), app.indexOf("case 'tournaments'"));
assert(!contribution.includes("'Cần xử lý'"));
const ranking = app.slice(app.indexOf("case 'ranking'"), app.indexOf("case 'fund'"));
assert(!ranking.includes("'Thao tác'"));

// Role-aware fixture matrix: no empty management group for unauthorized actors.
const playerActionsVisible = actor =>
  actor.admin || actor.canManagePlayers || actor.canManagePlayerLifecycle;
assert.equal(playerActionsVisible({ admin: true }), true);
assert.equal(playerActionsVisible({ canManagePlayers: true }), true);
assert.equal(playerActionsVisible({ canManagePlayerLifecycle: true }), true);
assert.equal(playerActionsVisible({ admin: false, canManagePlayers: false, canManagePlayerLifecycle: false }), false);

const tournamentActionsVisible = actor =>
  actor.canManageTournaments || (actor.role === 'MEMBER' && actor.active);
assert.equal(tournamentActionsVisible({ canManageTournaments: true }), true);
assert.equal(tournamentActionsVisible({ role: 'MEMBER', active: true }), true);
assert.equal(tournamentActionsVisible({ role: 'MEMBER', active: false }), false);

// Mobile uses the same DOM order; WP-C5 does not use CSS visual ordering.
const wpC5Css = css.slice(css.indexOf('WP-C5 INFORMATION HIERARCHY'), css.indexOf('/WP-C5 INFORMATION HIERARCHY'));
assert(wpC5Css.includes('.workflow-section-heading'));
assert(!/\border\s*:/.test(wpC5Css), 'WP-C5 must not fake business order with CSS order');

// Shared Action Accordion stays in place. WP-C7 advances app.js and app.css;
// the four unchanged module assets retain their WP-C5 tags.
assert(app.includes('function actionAccordion(options = {})'));
assert.equal((index.match(/wp-c5-information-hierarchy-20261005-1/g) || []).length, 4);
assert.match(index, /app\.js\?v=wp-c7-notice-focus-20261005-1/);
assert.match(index, /app\.css\?v=wp-c7-notice-focus-20261005-1/);

console.log('PASS WP-C5 decision-first DOM/source order, role-aware empty states, loading/error hierarchy and mobile order contract');
