const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createExporter(extraHtml = '') {
  const template = fs.readFileSync('config/koukoku.html', 'utf8').replace('</head>', extraHtml + '</head>');
  const context = {
    XMLHttpRequest: function () {
      this.open = () => {};
      this.send = () => {
        this.status = 200;
        this.readyState = 4;
        this.responseText = template;
        this.onreadystatechange();
      };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/html-export.js', 'utf8'), context);
  context.HtmlExport.loadTemplate(() => {}, assert.fail);
  return context.HtmlExport;
}

for (const [database, expected] of [
  ['KOKOKU', '入札公告'],
  ['KOUJI', '入札公告（工事）'],
  ['OP', 'オープンカウンター'],
  ['KOBO', '公募']
]) {
  test(database + ' produces the correct visible heading and browser title', () => {
    const html = createExporter().create([], [], [], 'R8', database);
    assert.match(html, new RegExp('<title>令和８年度' + expected + '一覧</title>'));
    assert(html.includes('<h1>令和８年度<span style="color:red;">' + expected + '</span>一覧</h1>'));
    assert(html.includes('id="myTable"'));
  });
}

test('selected fiscal year changes both titles', () => {
  const html = createExporter().create([], [], [], 'R10', 'KOUJI');
  assert(html.includes('<title>令和１０年度入札公告（工事）一覧</title>'));
  assert(html.includes('<h1>令和１０年度<span style="color:red;">入札公告（工事）</span>一覧</h1>'));
});

test('old and new inter-page HTML links follow the selected fiscal year and updated filenames', () => {
  const references = ['R8kokoku.html', 'R8koukoku_kouji.html', 'R8open.html', 'R8koubo.html',
    'R9koukoku.html', 'R9kokokukouji.html'];
  const links = references.map(name => '<a href="' + name + '">link</a>').join('');
  const html = createExporter(links).create([], [], [], 'R10', 'KOKOKU');
  for (const file of ['R10koukoku.html', 'R10koukoku_kouji.html', 'R10open.html', 'R10koubo.html']) {
    assert(html.includes('href="' + file + '"'), file);
  }
  for (const file of references) assert(!html.includes('href="' + file + '"'), file);
});
