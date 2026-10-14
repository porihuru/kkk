const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function fn(name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  function ', start + 1);
  return source.slice(start, end);
}
function setup() {
  const elements = {};
  const titles = ['', '', '', '', ''];
  const urls = Array(5).fill('old.pdf');
  let loads = 0, generations = 0;
  const c = {
    workflowBusy: false, pendingSave: null, resultWorkMode: false,
    filenameGenerationSequences: [], filenameDirty: [], filenamePending: [],
    activeFiscalYear: 'R8', PDF_ROW_COUNT: 5, selectedPdfFiles: {}, unsaved: false, formDirty: false,
    byId: id => elements[id] || (elements[id] = {value: ''}),
    pdfInput: (id, row) => id === 'link-text-input' ? {value: titles[row]} : {
      get value() { return urls[row]; }, set value(v) { urls[row] = v; }
    },
    fiscalYearForBidDate: () => 'R8', bidDateAsDate: () => new Date(2026,9,19),
    deactivateAdmin() {}, applyLoadedData() {}, showError() {},
    DataService: {load() {loads++;}},
    global: {FilenameGenerator: {}},
    generatePdfName() {generations++; c.workflowBusy = true;}
  };
  vm.createContext(c);
  vm.runInContext(['updatePdfLink','updatePdfLinks','loadData'].map(fn).join('\n'),c);
  return {c, titles, urls, loads:()=>loads, generations:()=>generations};
}
test('empty initial form does not block the following DB load', () => {
  const s = setup();
  s.c.updatePdfLinks(); s.c.loadData();
  assert.equal(s.generations(),0);
  assert.equal(s.c.workflowBusy,false);
  assert.equal(s.loads(),1);
  assert.deepEqual(s.urls,['','','','','']);
});
test('nonempty title still starts blocking filename generation', () => {
  const s = setup(); s.titles[0] = 'たこごはん';
  s.c.updatePdfLink(0);
  assert.equal(s.generations(),1);
  assert.equal(s.c.workflowBusy,true);
});
test('existing active work still prevents DB reload', () => {
  const s = setup(); s.c.workflowBusy = true; s.c.loadData();
  assert.equal(s.loads(),0);
});
