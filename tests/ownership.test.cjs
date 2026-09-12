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

test('CSV allows only own planned posts, with administrator override', () => {
  const d=service('CSV');
  assert(d.canManageAnnouncement({AuthorId:'alice'},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:'bob'},'planned',false));
  assert(!d.canManageAnnouncement({},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:'alice'},'published',false));
  assert(d.canManageAnnouncement({AuthorId:'bob'},'planned',true));
  assert(d.canManageAnnouncement({},'published',true));
});

test('SharePoint uses authenticated numeric AuthorId and rejects password-only admin elevation', () => {
  const d=service('SHAREPOINT',{id:'7',name:'Alice',isAdmin:false});
  assert(d.canManageAnnouncement({AuthorId:7},'planned',false));
  assert(!d.canManageAnnouncement({AuthorId:8},'planned',true));
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

test('Direct save and delete handlers reject other users posts without changing state', () => {
  const elements={ 'announcement-id':{value:'1'},'form-message':{innerHTML:''} };
  const ctx={DataService:service('CSV'),document:{getElementById:id=>elements[id]}};
  ctx.window=ctx;
  ctx.confirm=()=>assert.fail('unauthorized delete must stop before confirmation');
  vm.createContext(ctx);
  const source=fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', 'global.guardTest = { save: saveAnnouncement, remove: deleteAnnouncement, setItems: function(items) { plannedAnnouncements=items; } };');
  vm.runInContext(source,ctx);
  const item={ID:'1',AuthorId:'bob',Remarks:'original'};
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
