'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const extract = name => app.slice(app.indexOf(`// WP-C7 ${name} START`), app.indexOf(`// WP-C7 ${name} END`));
class Node {
  constructor(id) { this.id = id; this.attributes = {}; this.hidden = false; this.isConnected = true; this.disabled = false; this.writes = 0; this._text = ''; this.children = []; this.classList = { toggle() {} }; }
  get textContent() { return this._text; }
  set textContent(value) { this._text = value; this.writes++; }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  append(...children) { this.children.push(...children); }
  contains(node) { return this.children.some(child => child === node || child.contains(node)); }
  addEventListener() {}
  closest() { return this.hiddenAncestor ? {} : null; }
  focus(options) { this.focusOptions = options; doc.activeElement = this; }
}
const nodes = Object.fromEntries(['notice-status', 'notice-alert', 'page-title', 'field'].map(id => [id, new Node(id)]));
const doc = { body: new Node('body'), activeElement: null };
const state = { page: 'players', busy: false };
const tasks = [];
const scope = { $: id => nodes[id], document: doc, state, queueMicrotask: fn => tasks.push(fn) };
vm.runInNewContext(extract('SHARED NOTICE') + extract('CONTENT FOCUS') + '\nthis.notice=notice;this.preserveContentFocus=preserveContentFocus;', scope);
const target = new Node('message');
target.attributes.role = 'alert';
scope.notice(target, 'Saved', false, true);
assert.equal(target.className, 'notice success');
assert.equal(target.attributes.role, undefined);
assert.equal(target.attributes['aria-live'], 'off');
assert.equal(nodes['notice-status'].textContent, 'Saved');
assert.equal(nodes['notice-alert'].textContent, '');
const writes = nodes['notice-status'].writes;
scope.notice(target, 'Saved', false, true);
assert.equal(nodes['notice-status'].writes, writes, 'same notice must not repeat announcement');
scope.notice(target, '');
scope.notice(target, 'Saved', false, true);
assert.equal(nodes['notice-status'].writes, writes + 1, 'a new retry after clearing is delivered again');
scope.notice(target, 'Saved', { critical: true });
assert.equal(nodes['notice-alert'].textContent, 'Saved', 'critical upgrade must not be suppressed by polite deduplication');
nodes['notice-alert'].textContent = '';
scope.notice(target, 'Reason required', true);
assert.equal(target.className, 'notice error');
assert.equal(nodes['notice-status'].textContent, 'Reason required', 'ordinary validation is polite');
assert.equal(nodes['notice-alert'].textContent, '');
scope.notice(target, 'Cannot start', { tone: 'error', critical: true });
assert.equal(nodes['notice-alert'].textContent, 'Cannot start');
scope.notice(target, 'Static preview', { announce: false });
assert.equal(nodes['notice-status'].textContent, 'Reason required');
scope.notice(target, '');
assert(target.hidden);
assert.equal(target.textContent, '');
target.isConnected = false;
scope.notice(target, 'Initial empty queue');
assert.equal(nodes['notice-status'].textContent, 'Reason required', 'detached initial render stays silent');
target.isConnected = true;
scope.notice(target, 'Retry succeeded', { tone: 'success' });
assert.equal(nodes['notice-status'].textContent, 'Retry succeeded');
assert.equal(doc.activeElement, null, 'notice must never move focus');

const content = { isConnected: true, contains: node => node === nodes.field };
function flush() { while (tasks.length) tasks.shift()(); }
doc.activeElement = nodes.field;
scope.preserveContentFocus(content);
const removedField = nodes.field;
nodes.field = new Node('field');
doc.activeElement = doc.body;
flush();
assert.equal(doc.activeElement, nodes.field, 'restore stable field ID after render');
assert.notEqual(doc.activeElement, removedField);
assert.equal(nodes.field.focusOptions.preventScroll, true);
doc.activeElement = nodes.field;
scope.preserveContentFocus(content);
nodes.field.disabled = true;
doc.activeElement = doc.body;
flush();
assert.equal(doc.activeElement, nodes['page-title'], 'disabled replacement falls back to heading');
nodes.field.disabled = false;
doc.activeElement = nodes.field;
scope.preserveContentFocus(content);
const navigation = new Node('nav');
doc.activeElement = navigation;
flush();
assert.equal(doc.activeElement, navigation, 'never steal user focus');
doc.activeElement = nodes.field;
state.busy = true;
scope.preserveContentFocus(content);
doc.activeElement = doc.body;
flush();
assert.equal(doc.activeElement, doc.body, 'loading waits for completion');
state.busy = false;
scope.preserveContentFocus(content);
flush();
assert.equal(doc.activeElement, nodes.field);
doc.activeElement = nodes.field;
scope.preserveContentFocus(content);
state.page = 'fund';
doc.activeElement = doc.body;
flush();
assert.equal(doc.activeElement, doc.body, 'page change cancels stale restoration');

scope.el = (tag, text, cls) => { const node = new Node(''); node.textContent = text ?? ''; node.className = cls || ''; return node; };
const accordionSource = app.slice(app.indexOf('// WP-C4 SHARED ACTION ACCORDION START'), app.indexOf('// WP-C4 SHARED ACTION ACCORDION END'));
vm.runInNewContext(accordionSource + '\nthis.actionAccordion=actionAccordion;', scope);
const accordion = scope.actionAccordion({ title: 'Action', expanded: true });
const inside = new Node('inside');
accordion.body.append(inside);
doc.activeElement = inside;
accordion.setExpanded(false);
assert.equal(doc.activeElement, accordion.toggle, 'collapse restores focus before hiding focused content');
assert.equal(accordion.toggle.focusOptions.preventScroll, true);
doc.activeElement = navigation;
accordion.setExpanded(true);
accordion.setExpanded(false);
assert.equal(doc.activeElement, navigation, 'collapse must not steal unrelated focus');

assert.match(html, /id="notice-status"[^>]*role="status"[^>]*aria-atomic="true"/);
assert.match(html, /id="notice-alert"[^>]*role="alert"[^>]*aria-atomic="true"/);
assert(!/id="global-message"\s+role="alert"/.test(html));
assert.match(html, /id="page-title"\s+tabindex="-1"/);
assert.match(app, /const heading = el\('h2', title\);\s+heading\.tabIndex = -1/);
assert.match(html, /app\.js\?v=wp-c9-capability-surfaces-20261007-1/);
assert(css.includes('button:focus-visible') && css.includes('.sr-only'));
assert.match(css, /\.field:focus-visible,[\s\S]*?outline:3px solid var\(--text\)/);
assert.match(app, /body\.contains\(document\.activeElement\)[\s\S]*?toggle\.focus\(\{ preventScroll: true \}\)/);
for (const file of ['account.js', 'players.js', 'matches.js', 'fund.js']) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert(source.includes('notice,'), `${file} consumes shared notice`);
  assert(!source.includes('function notice('), `${file} must not duplicate delivery`);
}
console.log('PASS WP-C7 polite/critical/silent notice, deduplication, compatibility, focus restore/no theft/stale guards and shared delivery');
