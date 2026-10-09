const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('operation history observes results, uses JST, persists 200 safe text entries and offsets fixed header',()=>{
  const nodes = {}, observers = [], stored = {};
  function node() { return {style:{display:'none'},textContent:'',value:'R8',offsetHeight:140,appendChild(){},setAttribute(){},focus(){}}; }
  const context={document:{getElementById:id=>nodes[id]||(nodes[id]=node()),createElement:node},location:{pathname:'/kkk/index.html'},
    sessionStorage:{getItem:k=>stored[k],setItem:(k,v)=>stored[k]=v,removeItem:k=>delete stored[k]},addEventListener(){},
    MutationObserver:function(callback){this.observe=function(target){observers.push({callback,target});};}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/operation-history.js','utf8'),context);
  assert.equal(nodes['menu-spacer'].style.height,'140px');
  assert.equal(context.OperationHistory.stamp(new Date('2026-10-09T07:42:31Z')),'2026/10/09 16:42:31');
  nodes['zip-message'].textContent='ZIPの取得に失敗しました。';
  observers.find(o=>o.target===nodes['zip-message']).callback();
  assert.match(nodes['operation-latest'].textContent,/要確認.*ZIP/);
  context.OperationHistory.record('保存しました。');
  assert.match(nodes['operation-latest'].textContent,/成功/);
  for(let i=0;i<205;i++)context.OperationHistory.record('<b>'+i+'</b>');
  const history=JSON.parse(stored['kkk-operation-history:/kkk/index.html']);
  assert.equal(history.length,200);assert.match(history[0],/<b>204<\/b>/);
  nodes['operation-history-clear'].onclick();assert.equal(Object.keys(stored).length,0);
});

test('display numbering starts at one without changing SharePoint IDs; count distinguishes announcement and link rows',()=>{
  const nodes={};
  const context={document:{getElementById:id=>nodes[id]||(nodes[id]={}),getElementsByClassName:()=>[]},
    DataService:{canManageAnnouncement:()=>false,getPublicLinkUrl:x=>x,getPublicationConfig:()=>({endedUrl:'end.pdf'})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;',`global.checkNumber=function(rows,links){allAnnouncements=rows;allLinks=links;preserveAnnouncementOrder=true;renderList("published",rows);};`),context);
  const rows=[{ID:'3352',FiscalYear:'R8',Category:'NEW',BidDate:'R8.10.1'}];
  context.checkNumber(rows,[{ID:'1',KokokuID:'3352',URL:'a.pdf'},{ID:'2',KokokuID:'3352',URL:'b.pdf'}]);
  assert.equal(nodes['record-count'].textContent,'公告 1件（リンク 2件）');
  assert.match(nodes['announcement-list'].innerHTML,/管理ID: 3352">1<\/span>/);
  assert.equal(rows[0].ID,'3352');
});
