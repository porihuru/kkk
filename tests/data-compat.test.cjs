const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function csvApi() {
  const context = {};
  vm.createContext(context);
  const source = fs.readFileSync('js/csv-data.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('/* CSVデータ')), context);
  return context.CsvData;
}

test('All four databases export configured filenames with planned/public separation', () => {
  const text = fs.readFileSync('config/config.txt', 'utf8')
    .replace(/^DATA_MODE=.*$/m, 'DATA_MODE=CSV');
  const context = { CsvData: { load: success => success({}) } };
  context.XMLHttpRequest = function () {
    this.open = () => {};
    this.send = () => { this.responseText=text; this.status=200; this.readyState=4; this.onreadystatechange(); };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/data-service.js', 'utf8'), context);
  for(const key of ['KOKOKU','KOUJI','OP','KOBO']) {
    context.DataService.setDatabase(key);
    context.DataService.load(()=>{},()=>assert.fail('config failed'));
    for(const [kind,suffix] of Object.entries({announcements:'CSV',publishedAnnouncements:'PUBLIC_CSV',links:'LINKS_CSV',publishedLinks:'PUBLIC_LINKS_CSV',settings:'SETTINGS_CSV'})) {
      const configured=text.match(new RegExp('^DB_'+key+'_'+suffix+'=(.+)$','m'))[1].trim();
      assert.equal(context.DataService.getCsvFileName(kind), configured.split('/').pop());
    }
    assert(context.DataService.setFiscalYear('R9'));
    assert.match(context.DataService.getPublicHtmlFileName('R9'),/^R9/);
    assert.equal(context.DataService.getPublicationConfig('R9').pdfRoot, 'R9/'+({KOKOKU:'be',KOUJI:'kouji',OP:'op',KOBO:'kobo'}[key]));
    assert.match(context.DataService.getPublicationConfig('R9').pdfLibrary,/^\/na\/na\/.*Documents\/nafin\/R9\//);
    assert.match(context.DataService.getPublicationConfig('R8').endedUrl,/^R8\//);
  }
});

function sharePointApi(failSecondPage) {
  const calls = [];
  const context = { window: { location: { pathname: '/sites/finance/doclib/index.html' } } };
  context.XMLHttpRequest = function () {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = () => {};
    this.send = body => {
      calls.push({ method: this.method, url: this.url, body });
      let data;
      this.status = 200;
      if (this.url.includes('/fields?')) data = { results: ['Id', 'operationdate', 'kokokuid', 'sortorder'].map(name => ({ Title: name, InternalName: name, TypeAsString: 'Text' })) };
      else if (this.url.includes('page=2')) {
        if (failSecondPage) this.status = 500;
        data = { results: [{ Id: 42, operationdate: '2026/09/13 10:30', kokokuid: 7, sortorder: 2, Author: { Title: '投稿者A' }, Created: '2026-09-12T23:30:00Z' }] };
      } else data = { results: [{ Id: 41, operationdate: '2026/09/12 10:30', kokokuid: 7, sortorder: 1 }], __next: '/sites/finance/_api/page=2' };
      this.responseText = JSON.stringify({ d: data });
      this.readyState = 4;
      this.onreadystatechange();
    };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/sp.js', 'utf8'), context);
  context.SP.init('/sites/finance');
  return { api: context.SP, calls };
}

test('All 12 SharePoint lists read, add and update sortorder', () => {
  const calls = [];
  const context = {};
  context.XMLHttpRequest = function () {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = () => {};
    this.getResponseHeader = () => '"2"';
    this.send = body => {
      calls.push({ url: this.url, body: body && JSON.parse(body) });
      let data;
      if (this.url.includes('/fields?')) data = { results: ['Id', 'sortorder'].map(name => ({ Title: name, InternalName: name })) };
      else if (this.url.includes('contextinfo')) data = { GetContextWebInformation: { FormDigestValue: 'test', FormDigestTimeoutSeconds: 1800 } };
      else if (this.url.includes('ListItemEntityTypeFullName')) data = { ListItemEntityTypeFullName: 'SP.Data.TestListItem' };
      else if (this.method === 'GET') data = { results: [{ Id: 1, sortorder: '3', __metadata: { etag: '"1"' } }] };
      else data = { Id: 2, sortorder: '4', __metadata: { etag: '"1"' } };
      this.status = 200; this.responseText = JSON.stringify({ d: data }); this.readyState = 4; this.onreadystatechange();
    };
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/sp.js', 'utf8'), context);
  context.SP.init('/sites/test');
  let completed = 0;
  for (const db of ['kokoku', 'kouji', 'op', 'kobo']) {
    for (const suffix of ['', '_links', '_settings']) {
      const list = db + suffix;
      context.SP.load(list, ['Id', 'Sort'], rows => { assert.equal(rows[0].Sort, '3'); completed++; }, assert.fail);
      assert.match(decodeURIComponent(calls.at(-1).url), /\$select=Id,sortorder$/);
      context.SP.add(list, { Sort: '4' }, row => { assert.equal(row.Sort, '4'); completed++; }, assert.fail);
      assert.equal(calls.at(-1).body.sortorder, '4');
      assert.equal(calls.at(-1).body.sort, undefined);
      context.SP.update(list, 1, { Sort: '5' }, () => { completed++; }, assert.fail);
      assert.equal(calls.at(-1).body.sortorder, '5');
      assert.equal(calls.at(-1).body.Sort, undefined);
    }
  }
  assert.equal(completed, 36);
});

test('CSV export/import retains IDs, BOM, commas, quotes, Japanese, newlines and empty fields', () => {
  const csv = csvApi();
  const rows = [{ ID: '42', KokokuID: '7', Text: '公告,"変更"\r\n日本語', URL: '', Sort: '0', OperationDate: '2026/09/13 10:30' }];
  const restored = csv.parse(csv.toCsv(rows, Object.keys(rows[0])));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), rows);
});

test('SharePoint maps OperationDate and IDs on every response page', () => {
  const { api, calls } = sharePointApi(false);
  let loaded;
  api.load('kokoku_links', ['Id', 'OperationDate', 'KokokuID', 'Sort', 'Author/Title', 'Created'], rows => { loaded = rows; }, () => assert.fail('unexpected error'));
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0].Sort, 1);
  assert.equal(loaded[1].Sort, 2);
  assert(decodeURIComponent(calls[1].url).includes(",sortorder,"));
  assert.equal(loaded[1].ID, 42);
  assert.equal(loaded[1].OperationDate, '2026/09/13 10:30');
  assert.equal(loaded[1].AuthorName, '投稿者A');
  assert.equal(loaded[1].Created, '2026-09-12T23:30:00Z');
  assert(calls[1].url.includes('$expand=Author'));
  assert.equal(String(loaded[1].KokokuID), '7');
  assert(decodeURIComponent(calls[1].url).includes('operationdate'));
});

test('SharePoint page failure reports failure without returning incomplete data', () => {
  const { api } = sharePointApi(true);
  let successes = 0, failures = 0;
  api.load('kokoku', ['Id'], () => { successes++; }, () => { failures++; });
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test('Every configured CSV database has unique IDs and valid parent links within each list', () => {
  const csv = csvApi();
  const config = Object.fromEntries(fs.readFileSync('config/config.txt', 'utf8').split(/\r?\n/).filter(line => line && line[0] !== '#' && line.includes('=')).map(line => [line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
  for (const db of ['KOKOKU', 'KOUJI', 'OP', 'KOBO']) {
    for (const suffix of ['', 'PUBLIC_']) {
      const announcements = csv.parse(fs.readFileSync(config['DB_'+db+'_'+suffix+'CSV'], 'utf8'));
      const links = csv.parse(fs.readFileSync(config['DB_'+db+'_'+suffix+'LINKS_CSV'], 'utf8'));
      const ids = new Set(announcements.map(item => item.ID));
      assert.equal(ids.size, announcements.length, db + ' duplicate announcement ID');
      assert.equal(new Set(links.map(item=>item.ID)).size, links.length, db + ' duplicate link ID');
      for (const link of links) assert(ids.has(link.KokokuID), db + ' orphan link ' + link.ID);
    }
  }
});
