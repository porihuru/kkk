const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function diagnosticsEnvironment() {
  const nodes = [];
  function element(tag) {
    const node = {
      tagName: String(tag).toUpperCase(), style: {}, children: [], value: '', innerHTML: '',
      appendChild(child) { this.children.push(child); },
      setAttribute() {}, focus() {}, select() {}
    };
    nodes.push(node);
    return node;
  }
  function FileReader() {}
  FileReader.prototype.readAsArrayBuffer = function () {};
  const context = {
    FileReader,
    location: { href: 'http://localhost/index.html' },
    document: {
      readyState: 'complete', body: element('body'),
      createElement: element, execCommand() {},
      addEventListener() {}
    },
    addEventListener() {},
    attachEvent() {}
  };
  vm.createContext(context);
  const source = fs.readFileSync('js/csv-data.js', 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('/* CSVデータ')), context);
  return { context, nodes };
}

test('PDF diagnostics accepts a non-empty PDF and rejects wrong extension or empty content', () => {
  const { context } = diagnosticsEnvironment();
  assert.equal(context.Diagnostics.checkPdfFile({ name: 'notice.pdf', size: 1024, type: 'application/pdf' }, '公告PDF'), true);
  assert.equal(context.Diagnostics.checkPdfFile({ name: 'notice.txt', size: 1024, type: 'text/plain' }, '公告PDF'), false);
  assert.equal(context.Diagnostics.checkPdfFile({ name: 'empty.pdf', size: 0, type: 'application/pdf' }, '結果PDF'), false);
});

test('PDF diagnostic button checks the configured storage service', () => {
  const { context, nodes } = diagnosticsEnvironment();
  let calls = 0;
  context.DataService = { runPdfUploadDiagnostics() { calls += 1; } };
  const button = nodes.find(node => node.innerHTML === 'PDF保存診断');
  assert(button);
  button.onclick();
  assert.equal(calls, 1);
});

function sharePointService(uploadError) {
  const records = [];
  let checkedFolder = '';
  let uploadedFolder = '';
  const context = {
    Diagnostics: {
      log(source, message, detail) { records.push({ level: 'INFO', source, message, detail }); },
      warn(source, message, detail) { records.push({ level: 'WARN', source, message, detail }); },
      error(source, message, detail) { records.push({ level: 'ERROR', source, message, detail }); },
      checkPdfFile() { return true; }
    },
    ErrorNotice: { notify(message) { records.push({ level: 'NOTICE', message }); } },
    CsvData: { load(success) { success({}); } },
    SP: {
      init() {},
      getCurrentUser(success) { success({ id: '7', name: '利用者', isAdmin: false }); },
      load(name, columns, success) { success([]); },
      checkFolder(folder, success) { checkedFolder = folder; success({ ServerRelativeUrl: '/sites/finance/' + folder }); },
      uploadFile(folder, name, file, success, error) {
        uploadedFolder = folder;
        if (uploadError) { error(uploadError); } else { success({}); }
      }
    }
  };
  context.XMLHttpRequest = function () {
    this.open = () => {};
    this.send = () => {
      this.readyState = 4;
      this.status = 200;
      this.responseText = 'DATA_MODE=SHAREPOINT\nWEB_ROOT=/sites/finance\nPDF_LIBRARY=nafin/R8/be\nDB_KOKOKU_PDF_LIBRARY=nafin/R8/be';
      this.onreadystatechange();
    };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/data-service.js', 'utf8'), context);
  context.DataService.load(() => {}, assert.fail);
  return { context, records, getCheckedFolder: () => checkedFolder, getUploadedFolder: () => uploadedFolder };
}

test('SharePoint PDF diagnostics verifies the database-specific folder without uploading a file', () => {
  const state = sharePointService(null);
  state.context.DataService.runPdfUploadDiagnostics();
  assert.equal(state.getCheckedFolder(), 'nafin/R8/be');
  assert.equal(state.getUploadedFolder(), '');
  assert(state.records.some(record => /接続を確認/.test(record.message)));
});

test('SharePoint folder diagnosis uses a read-only request', () => {
  const calls = [];
  const context = { window: { location: { pathname: '/sites/finance/doclib/index.html' } } };
  context.XMLHttpRequest = function () {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = () => {};
    this.send = () => {
      calls.push({ method: this.method, url: this.url });
      this.status = 200;
      this.responseText = JSON.stringify({ d: { Exists: true, ServerRelativeUrl: '/sites/finance/nafin/R8/be' } });
      this.readyState = 4;
      this.onreadystatechange();
    };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/sp.js', 'utf8'), context);
  context.SP.init('/sites/finance');
  let folder;
  context.SP.checkFolder('nafin/R8/be', result => { folder = result.ServerRelativeUrl; }, assert.fail);
  assert.equal(folder, '/sites/finance/nafin/R8/be');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /GetFolderByServerRelativeUrl/);
});

test('PDF upload permission failure is recorded with an actionable cause and visible notice', () => {
  const state = sharePointService({ status: 403, statusText: 'Forbidden' });
  let failed = false;
  state.context.DataService.uploadPdf({ name: 'result.pdf', size: 2048 }, 'result_kk.pdf', assert.fail, () => { failed = true; }, '結果PDF');
  assert.equal(failed, true);
  assert.equal(state.getUploadedFolder(), 'nafin/R8/be');
  const error = state.records.find(record => record.level === 'ERROR' && /アップロードできません/.test(record.message));
  assert(error);
  assert.match(error.detail, /HTTP 403/);
  assert.match(error.detail, /書き込み権限/);
  assert(state.records.some(record => record.level === 'NOTICE' && /診断/.test(record.message)));
});
