const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createTableNavigation() {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = fs.readFileSync('js/app.js', 'utf8');
  const start = source.indexOf('  function refreshTableNavigation()');
  const end = source.indexOf('  function showError()', start);
  assert(start >= 0 && end > start, 'table navigation functions are present');

  const nodes = {};
  for (const kind of ['planned', 'published']) {
    assert(html.includes(`id="${kind}-table-wrap"`), `${kind} has a scrollable table`);
    assert(html.includes(`id="${kind}-table-navigation"`), `${kind} has a navigation panel`);
    for (const side of ['left', 'right']) {
      assert(html.includes(`id="${kind}-table-${side}"`), `${kind} has its ${side} button`);
      nodes[`${kind}-table-${side}`] = { disabled: false };
    }
    nodes[`${kind}-table-wrap`] = {
      clientWidth: 1000,
      scrollWidth: kind === 'planned' ? 1800 : 2200,
      scrollLeft: 0,
      addEventListener(type, callback) { this[`on${type}`] = callback; }
    };
    nodes[`${kind}-table-navigation`] = { style: {} };
  }
  const context = {
    byId(id) { return nodes[id]; },
    addEventListener(type, callback) { this[`on${type}`] = callback; }
  };
  context.global = context;
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  context.setupTableNavigation();
  return { nodes, context };
}

test('each table can reveal hidden bid date and remarks columns from the top controls', () => {
  const { nodes } = createTableNavigation();
  const kind = 'published';
  const wrap = nodes[`${kind}-table-wrap`];
  const left = nodes[`${kind}-table-left`];
  const right = nodes[`${kind}-table-right`];
  assert.equal(left.disabled, true);
  assert.equal(right.disabled, false);
  right.onclick();
  assert.equal(wrap.scrollLeft, 1200);
  assert.equal(right.disabled, true);
  assert.equal(left.disabled, false);
  left.onclick();
  assert.equal(wrap.scrollLeft, 0);
  assert.equal(left.disabled, true);
});

test('both table controls remain independent and disappear when the whole row fits', () => {
  const { nodes, context } = createTableNavigation();
  nodes['planned-table-right'].onclick();
  assert.equal(nodes['planned-table-wrap'].scrollLeft, 800);
  assert.equal(nodes['published-table-wrap'].scrollLeft, 0);
  nodes['published-table-wrap'].scrollWidth = 900;
  context.onresize();
  assert.equal(nodes['published-table-navigation'].style.display, 'none');
  assert.equal(nodes['published-table-right'].disabled, true);
  assert.equal(nodes['planned-table-navigation'].style.display, '');
});

test('desktop list tables fit all 13 columns and wrap long item names', () => {
  const css = fs.readFileSync('css/style.css', 'utf8');
  assert.match(css, /#planned-table-wrap \.subject-cell,[\s\S]*?word-break: break-all;/);
  assert.match(css, /#planned-table-wrap table,[\s\S]*?table-layout: fixed;/);
  const widths = [...css.matchAll(/#planned-table-wrap th:nth-child\((\d+)\)[^\n]*width: (\d+)%;/g)]
    .map(match => ({ column: Number(match[1]), percent: Number(match[2]) }));
  assert.deepEqual(widths.map(item => item.column), Array.from({ length: 13 }, (_, index) => index + 1));
  assert.equal(widths.reduce((total, item) => total + item.percent, 0), 100);
  assert(widths[10].percent > widths[11].percent, 'item names get more space than bid dates');
});
