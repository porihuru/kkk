const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
test('ordinary save blocks background pointer and keyboard until completion; retry remains available', () => {
 const elements={}, handlers={};
 const document={activeElement:null,addEventListener:(type,fn)=>handlers[type]=fn,getElementById:id=>elements[id]||(elements[id]={id,style:{},setAttribute(){},focus(){document.activeElement=this;},contains(target){return target===this || target && /^save-progress/.test(target.id);}})};
 const context={document};vm.createContext(context);
 vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;','global.run = runSave;'),context);
 let fail,ok,done=0;
 const task=(yes,no)=>{ok=yes;fail=no;};task.phase='PDFアップロード・チェックイン確認中';
 context.run([task],()=>done++);
 assert.equal(elements['save-progress'].style.display,'block');
 assert.match(elements['save-progress-message'].textContent,/PDFアップロード/);
 assert.equal(elements['save-progress-close'].style.display,'none');
 for(const type of ['click','keydown','focusin']){
  let blocked=false;handlers[type]({type,target:{id:'save'},preventDefault(){blocked=true;},stopImmediatePropagation(){}});
  assert.equal(blocked,true);
 }
 fail('失敗');assert.equal(elements['save-progress-retry'].style.display,'inline-block');
 elements['save-progress-retry'].onclick();assert.equal(elements['save-progress-close'].style.display,'none');
 ok();assert.equal(done,1);assert.match(elements['save-progress-message'].textContent,/完了しました/);
 assert.equal(elements['save-progress'].style.display,'none');
 assert.equal(elements['save-progress-close'].style.display,'none');
 let blocked=false;handlers.click({type:'click',target:{id:'save'},preventDefault(){blocked=true;}});assert.equal(blocked,false);
});
