const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function environment(missing) {
  const handlers = {}, nodes = [];
  function element(tag) {
    const node = { tagName: tag.toUpperCase(), style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); } };
    if (tag === 'a') node.download = '';
    nodes.push(node); return node;
  }
  const context = { navigator: { msSaveBlob() {} }, Blob() {}, Uint8Array, DOMParser() {}, XMLHttpRequest() {}, FileReader: function () {},
    document: { createElement: element, body: element('body'), implementation: { createHTMLDocument() {} } },
    addEventListener: (type, handler) => { handlers[type] = handler; }
  };
  context.FileReader.prototype.readAsArrayBuffer = function () {};
  if (missing) delete context.FileReader;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/error-notice.js', 'utf8'), context);
  return { context, handlers, panel: nodes.find(n => n.id === 'error-notice') };
}

test('IE-style download and date fallback do not produce a compatibility error', () => {
  const { context, panel } = environment(false);
  assert.equal(context.ErrorNotice.checkCapabilities().length, 0);
  assert.equal(panel.hidden, true);
});

test('Missing required feature names the affected operation in visible notification', () => {
  const { panel } = environment(true);
  assert.equal(panel.hidden, false);
  assert.match(panel.children[1].textContent, /PDF読込・ZIP作成/);
});

test('Runtime and script-loading errors are visible and dismissible', () => {
  const { panel, handlers } = environment(false);
  handlers.error({});
  assert.match(panel.children[1].textContent, /画面の処理中/);
  panel.children[2].onclick(); assert.equal(panel.hidden, true);
  handlers.error({target:{tagName:'SCRIPT'}});
  assert.equal(panel.hidden, false);
  assert.match(panel.children[1].textContent, /プログラムを読み込めません/);
});
