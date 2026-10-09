const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = process.argv[2] || path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const accountSource = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
const playersSource = fs.readFileSync(path.join(root, 'players.js'), 'utf8');
const matchesSource = fs.readFileSync(path.join(root, 'matches.js'), 'utf8');
const fundSource = fs.readFileSync(path.join(root, 'fund.js'), 'utf8');

const start = appSource.indexOf('      // WP-C4 SHARED ACTION ACCORDION START');
const end = appSource.indexOf('      // WP-C4 SHARED ACTION ACCORDION END');
assert(start >= 0 && end > start, 'shared Action Accordion source markers are required');
const helperSource = appSource.slice(start, end);

class Element {
  constructor(tag, text = '', className = '') {
    this.tag = tag;
    this._text = text == null ? '' : String(text);
    this.className = className || '';
    this.children = [];
    this.events = {};
    this.attributes = {};
    this.hidden = false;
    this.id = '';
    this.type = '';
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }

  get textContent() {
    return this._text + this.children.map(child => child.textContent || '').join('');
  }

  set textContent(value) {
    this._text = String(value ?? '');
    this.children = [];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  addEventListener(name, handler) {
    (this.events[name] ||= []).push(handler);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

const el = (tag, text, className) => new Element(tag, text, className);
const state = { generation: 9 };
const scope = { state, el };
vm.runInNewContext(`${helperSource}\nthis.actionAccordion = actionAccordion;`, scope);
const actionAccordion = scope.actionAccordion;

function click(node) {
  for (const handler of node.events.click || []) handler({ preventDefault() {} });
}

const rootNode = el('main');
let firstOpens = 0;
const group = [];
const first = actionAccordion({
  root: rootNode,
  title: 'Tạo bản ghi',
  semantic: 'create',
  icon: '+',
  group,
  onOpen: () => { firstOpens += 1; },
  render: body => body.append(el('p', 'Nội dung thứ nhất'))
});
const second = actionAccordion({
  root: rootNode,
  title: 'Xóa bản ghi',
  semantic: 'danger',
  icon: '!',
  group,
  render: body => body.append(el('p', 'Nội dung thứ hai'))
});

assert.equal(first.toggle.tag, 'button');
assert.equal(first.toggle.type, 'button');
assert.equal(first.toggle.getAttribute('aria-expanded'), 'false');
assert.equal(first.toggle.getAttribute('aria-controls'), first.body.id);
assert(first.body.hidden);
assert.match(first.wrapper.className, /action-accordion-create/);
assert.match(second.wrapper.className, /action-accordion-danger/);
assert.equal(first.toggle.children[0].className, 'action-accordion-icon');
assert.equal(first.toggle.children[1].className, 'action-accordion-title');
assert.equal(first.toggle.children[2].className, 'action-accordion-chevron');
assert.notEqual(first.body.id, second.body.id);
assert.deepEqual(rootNode.children, [first.wrapper, second.wrapper]);

const expandedRoot = el('main');
const initiallyExpanded = actionAccordion({
  root: expandedRoot,
  title: 'Biểu mẫu mở theo intent',
  expanded: true,
  render: body => body.append(el('p', 'Nội dung theo intent'))
});
assert.equal(initiallyExpanded.toggle.getAttribute('aria-expanded'), 'true');
assert.equal(initiallyExpanded.body.hidden, false);

click(first.toggle);
assert.equal(first.toggle.getAttribute('aria-expanded'), 'true');
assert.equal(first.body.hidden, false);
assert.equal(firstOpens, 1);
click(first.toggle);
assert.equal(first.body.hidden, true);
click(first.toggle);
assert.equal(firstOpens, 2, 'onOpen runs only on closed-to-open transitions');
click(second.toggle);
assert.equal(second.body.hidden, false);
assert.equal(first.body.hidden, true, 'exclusive group closes the other action');

assert.match(cssSource, /\.action-accordion-toggle\{[\s\S]*?min-height:54px/);
assert.match(cssSource, /\.action-accordion-icon\{[\s\S]*?width:30px;[\s\S]*?height:30px/);
assert.match(cssSource, /\.action-accordion-warning/);
assert.match(cssSource, /\.action-accordion-danger/);
assert.match(cssSource, /@media \(max-width:700px\)[\s\S]*?\.action-accordion-toggle/);
assert(!appSource.includes('match-action-collapsible'));
assert.match(accountSource, /return actionAccordion\(\{/);
assert.match(playersSource, /const controller = actionAccordion\(\{/);
assert(!matchesSource.includes('makeMatchActionAccordion'));
assert.equal((matchesSource.match(/actionAccordion\(\{/g) || []).length, 5);
assert.equal((fundSource.match(/Action = actionAccordion\(\{/g) || []).length, 3);
assert.equal((appSource.match(/Action = actionAccordion\(\{/g) || []).length, 5);

console.log('PASS WP-C4 shared Action Accordion DOM, ARIA, hierarchy, module migration, semantics and exclusive-open contract');
