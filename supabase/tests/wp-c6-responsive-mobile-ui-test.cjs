const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = process.argv[2] || path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('app.css');
const index = read('index.html');
const app = read('app.js');
const matches = read('matches.js');
const players = read('players.js');

const start = css.indexOf('WP-C6 RESPONSIVE / MOBILE DENSITY');
const end = css.indexOf('/WP-C6 RESPONSIVE / MOBILE DENSITY');
assert(start >= 0 && end > start, 'WP-C6 CSS markers are required');
const wpC6 = css.slice(start, end);

assert.match(wpC6, /@media \(max-width:700px\)/);
assert(!/\border\s*:/.test(wpC6), 'WP-C6 must preserve business DOM order');
assert(!/display\s*:\s*none/.test(wpC6), 'WP-C6 must not hide decision data to create density');
assert(!/overflow-x\s*:\s*auto/.test(wpC6), 'WP-C6 must not add horizontal-scroll workarounds');

assert.match(wpC6, /\.matches-ui \.match-record-teams\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) 52px minmax\(0,1fr\)/);
assert.match(wpC6, /\.matches-ui \.match-card-action\{[\s\S]*?min-height:44px/);
assert.match(wpC6, /\.matches-ui \.table-mobile-card-row\{[\s\S]*?grid-template-columns:76px minmax\(0,1fr\)/);
assert.match(wpC6, /\.players-ui \.player-card-header\{[\s\S]*?grid-template-areas:'identity rating action'/);
assert.match(wpC6, /\.players-ui \.player-card-name\{[\s\S]*?overflow-wrap:anywhere/);
assert.match(wpC6, /\.ranking-ui \.ranking-header\{[\s\S]*?grid-template-areas:'rank name rating matches action'/);
assert.match(wpC6, /\.ranking-ui \.ranking-detail-toggle\{[\s\S]*?min-height:44px/);
assert.match(wpC6, /\.contribution-top-name\{[\s\S]*?white-space:normal/);
assert.match(wpC6, /\.contribution-detail-toggle\{[\s\S]*?min-height:44px/);
assert.match(wpC6, /\.overview-kpi-grid \+ \.panel table\{[\s\S]*?min-width:0/);

assert(matches.includes("makeNode(\n                'article',\n                'match-record-card"));
assert(players.includes("'player-record-card ui-compact-card'"));
assert(app.includes("'ranking-card ranking-card-open ui-compact-card'"));
assert(app.includes("'contribution-detail-toggle'"));
assert(!app.includes('wp-c6-mobile-only'));
assert(!matches.includes('wp-c6-mobile-only'));
assert(!players.includes('wp-c6-mobile-only'));

assert.match(index, /app\.css\?v=match-safari-date-20261009-2/);
assert.equal((index.match(/wp-c5-information-hierarchy-20261005-1/g) || []).length, 1);
assert.match(index, /app\.js\?v=member-match01-20261009-1/);

console.log('PASS WP-C6 responsive density, comparison rows, touch targets, wrapping and cache scope');
