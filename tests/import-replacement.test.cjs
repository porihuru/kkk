const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(accept = true) {
  const elements = {}, calls = [], queue = [];
  const context = {document:{getElementById:id=>elements[id]||(elements[id]={style:{}})},confirm:()=>accept};
  context.window = context;
  context.DataService = {
    isSharePoint:()=>true,getCurrentUser:()=>({name:'tester'}),
    load:ok=>ok({announcements:[{ID:'1469'}],publishedAnnouncements:[{ID:'766'},{ID:'1470'}],links:[{ID:'90'}],publishedLinks:[{ID:'91'},{ID:'92'}],settings:[]}),
    remove:(kind,id,ok,fail)=>{calls.push(['delete',kind,id]);queue.push({ok,fail});},
    add:(kind,payload,ok,fail)=>{calls.push(['add',kind,payload]);queue.push({ok:()=>ok({Id:2000+calls.length}),fail});}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;',`clearForm=function(){};filterAnnouncements=function(){};renderSettings=function(){};updateFiscalYearUi=function(){};activeFiscalYear="R8";global.runImport=replaceImportedData;`),context);
  const data={announcements:[{ID:'1',FiscalYear:'R8',BidDate:'R8.10.1'}],links:[{ID:'1',KokokuID:'1',URL:'R8/be/a.pdf'}],settings:[]};
  return {context,elements,calls,queue,data};
}
test('HTML replacement freshly loads and deletes all selected list rows before adding; progress stays until done',()=>{
 const s=setup();s.context.runImport(s.data);
 assert.equal(s.elements['save-progress-close'].style.display,'none');
 while(s.queue.length)s.queue.shift().ok();
 assert.deepEqual(s.calls.slice(0,6).map(c=>c[0]),Array(6).fill('delete'));
 assert.deepEqual(s.calls.slice(6).map(c=>c[0]),['add','add']);
 assert.equal(s.calls[7][2].KokokuID,'2007');
 assert.match(s.elements['save-progress-message'].textContent,/完了しました/);
 assert.equal(s.elements['save-progress-close'].style.display,'inline-block');
});
test('cancel never deletes; failure stops before additions and retry resumes the failed deletion',()=>{
 const cancelled=setup(false);cancelled.context.runImport(cancelled.data);assert.equal(cancelled.calls.length,0);
 const s=setup();s.context.runImport(s.data);s.queue.shift().fail('通信エラー');
 assert.match(s.elements['save-progress-message'].textContent,/エラーで停止/);
 assert.equal(s.elements['save-progress-close'].style.display,'none');
 s.elements['save-progress-retry'].onclick();
 assert.deepEqual(s.calls[1],s.calls[0]);
 while(s.queue.length)s.queue.shift().ok();
 assert.equal(s.calls.filter(c=>c[0]==='add'&&c[1]==='announcements').length,1);
});
