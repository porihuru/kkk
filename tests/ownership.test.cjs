const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function service(mode, user, failUser) {
  const ctx = { CsvData: { load: cb => cb({}) }, SP: {
    init: () => {}, load: (name, columns, cb) => cb([]),
    getCurrentUser: (cb, fail) => failUser ? fail({status:403}) : cb(user)
  }};
  ctx.XMLHttpRequest = function () {
    this.open = () => {};
    this.send = () => { this.readyState=4;this.status=200;this.responseText='DATA_MODE='+mode+'\nCSV_USER_ID=alice\nCSV_USER_NAME=Alice';this.onreadystatechange(); };
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/data-service.js','utf8'),ctx);
  ctx.DataService.load(()=>{},()=>{});
  return ctx.DataService;
}

test('explicit CSV selection survives reload on a test site with SharePoint configuration', () => {
  const stored = {};
  function loadPage() {
    const ctx = {
      location: { pathname: '/index.html' },
      localStorage: { getItem: key => stored[key], setItem: (key, value) => { stored[key] = value; } },
      CsvData: { load: success => success({}) },
      SP: { init() {}, load() {}, getCurrentUser(success, fail) { fail({ status: 404 }); } },
      XMLHttpRequest: function () {
        this.open = () => {};
        this.send = () => {
          this.readyState = 4; this.status = 200;
          this.responseText = 'DATA_MODE=SHAREPOINT';
          this.onreadystatechange();
        };
      }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('js/data-service.js', 'utf8'), ctx);
    return ctx.DataService;
  }
  const first = loadPage();
  first.load(() => assert.fail('SharePoint should fail on test server'), () => {});
  assert.equal(first.getMode(), 'SHAREPOINT');
  assert.equal(first.getCurrentUser(), null);
  first.setMode('CSV');
  first.load(data => assert.equal(data.mode, 'CSV'), assert.fail);
  assert.equal(first.getCurrentUser().id, 'csv-user-1');
  const reloaded = loadPage();
  reloaded.load(data => assert.equal(data.mode, 'CSV'), assert.fail);
  assert.equal(reloaded.getCurrentUser().id, 'csv-user-1');
});

test('new registration without loaded user reports initialization failure, not ownership denial', () => {
  const elements = { 'announcement-id': { value: '' }, 'form-message': {} };
  const ctx = { DataService: { getCurrentUser: () => null }, document: { getElementById: id => elements[id] } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace('global.onload = start;', 'global.saveTest = saveAnnouncement;'), ctx);
  assert.equal(ctx.saveTest({ preventDefault() {} }), false);
  assert.match(elements['form-message'].textContent, /読み込みが完了していない/);
  assert.match(elements['form-message'].textContent, /CSVモード/);
  assert.doesNotMatch(elements['form-message'].textContent, /修正する権限/);
});

test('CSV allows only own planned posts, with administrator override', () => {
  const d=service('CSV');
  assert(d.canManageAnnouncement({AuthorId:'alice'},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:'bob'},'planned',false));
  assert(!d.canManageAnnouncement({},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:'alice'},'published',false));
  assert(d.canManageAnnouncement({AuthorId:'bob'},'planned',true));
  assert(d.canManageAnnouncement({},'published',true));
});

test('SharePoint uses authenticated numeric AuthorId and allows activated application administrators', () => {
  const d=service('SHAREPOINT',{id:'7',name:'Alice',isAdmin:false});
  assert(d.canManageAnnouncement({AuthorId:7},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:8},'planned',false));
  assert(d.canManageAnnouncement({AuthorId:8},'planned',true));
  assert(d.canManageAnnouncement({},'published',true));
  assert(!d.canManageAnnouncement({AuthorId:'alice'},'planned',false));
  const admin=service('SHAREPOINT',{id:'9',name:'Admin',isAdmin:true});
  assert(admin.canManageAnnouncement({AuthorId:8},'planned',true));
  assert(admin.canManageAnnouncement({},'published',true));
});

test('User lookup failure denies ownership checks even with administrator flag', () => {
  const d=service('SHAREPOINT',null,true);
  assert.equal(d.getCurrentUser(),null);
  assert(!d.canManageAnnouncement({AuthorId:7},'planned',true));
});

test('Administrator activation requires password in both modes, including site administrators', () => {
  for (const mode of ['CSV', 'SHAREPOINT']) {
    for (const isAdmin of [false, true]) {
      const elements = {};
      const ctx = { DataService: { getCurrentUser: () => ({id:'7', isAdmin}), isSharePoint: () => mode === 'SHAREPOINT' },
        document: { getElementById: id => elements[id] || (elements[id] = {value:'', innerHTML:''}) } };
      vm.createContext(ctx);
      const source = fs.readFileSync('js/app.js','utf8').replace('global.onload = start;',
        'setAdminVisibility=function(){};filterAnnouncements=function(){};global.adminTest={activate:activateAdmin,active:function(){return adminActive;}};');
      vm.runInContext(source, ctx);
      ctx.document.getElementById('admin-password').value = 'wrong';
      ctx.adminTest.activate();
      assert.equal(ctx.adminTest.active(), false);
      elements['admin-password'].value = 'snk';
      ctx.adminTest.activate();
      assert.equal(ctx.adminTest.active(), true);
      assert.equal(elements['admin-password'].value, '');
    }
  }
});

test('Direct save and delete handlers reject other users posts without changing state', () => {
  const elements={ 'announcement-id':{value:'1'},'form-message':{innerHTML:''} };
  const ctx={DataService:service('CSV'),document:{getElementById:id=>elements[id]}};
  ctx.window=ctx;
  ctx.confirm=()=>assert.fail('unauthorized delete must stop before confirmation');
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),ctx);
  const source=fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', 'activeFiscalYear="R8";global.guardTest = { save: saveAnnouncement, remove: deleteAnnouncement, setItems: function(items) { plannedAnnouncements=items; } };');
  vm.runInContext(source,ctx);
  const item={ID:'1',AuthorId:'bob',Remarks:'original',BidDate:'R8.10.1',FiscalYear:'R8'};
  ctx.guardTest.setItems([item]);
  assert.equal(ctx.guardTest.save({preventDefault:()=>{}}),false);
  ctx.guardTest.remove.call({getAttribute:key=>key==='data-id'?'1':'planned'});
  assert.equal(item.Remarks,'original');
  assert(elements['form-message'].innerHTML.includes('権限'));
});

test('CSV retains AuthorId across export/import', () => {
  const ctx={};vm.createContext(ctx);
  const source=fs.readFileSync('js/csv-data.js','utf8');
  vm.runInContext(source.slice(source.indexOf('/* CSVデータ')),ctx);
  const rows=ctx.CsvData.parse(ctx.CsvData.toCsv([{ID:'1',AuthorId:'alice',AuthorName:'投稿者A',Created:'2026-09-12T23:30:00Z'}],['ID','AuthorId','AuthorName','Created']));
  assert.equal(rows[0].AuthorId,'alice');
  assert.equal(rows[0].AuthorName,'投稿者A');
  assert.equal(rows[0].Created,'2026-09-12T23:30:00Z');
});

test('Posting timestamp is displayed in Japan time and missing timestamps remain unknown', () => {
  const ctx={};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', 'global.formatPostingDate = postingDateText;'),ctx);
  assert.equal(ctx.formatPostingDate('2026-09-12T23:30:00Z'),'2026/09/13 08:30');
  assert.equal(ctx.formatPostingDate(''),'不明');
  assert.equal(ctx.formatPostingDate('invalid'),'不明');
});
