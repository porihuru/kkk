const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const nodes={},queue=[],callbacks=[];
 const c={document:{getElementById:id=>nodes[id]||(nodes[id]={value:'',style:{},setAttribute(){}})},setTimeout:fn=>queue.push(fn),FilenameGenerator:{generate:(o,ok,fail)=>callbacks.push({ok,fail})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', 'global.testApi={unique:uniquePdfUrl,generate:generatePdfName,setupDate:setupDateInput,busy:function(){return workflowBusy;},seed:function(){allLinks=[{URL:"/site/Documents/nafin/R8/be/a_kk.pdf"},{URL:"R8/be/a_kk_2.pdf"}];}};'),c);
 return {c,nodes,queue,callbacks,api:c.testApi};
}
test('duplicate result names skip existing and current form filenames',()=>{
 const s=setup();s.api.seed();s.nodes['link-url-input-2']={value:'R8/be/a_kk_3.pdf'};
 assert.equal(s.api.unique('R8/be/a_kk.pdf',0),'R8/be/a_kk_4.pdf');
 assert.equal(s.api.unique('R8/be/b.pdf',0),'R8/be/b.pdf');
});
test('name generation blocks until all asynchronous jobs settle, including failure',()=>{
 const s=setup();let ok=0,fail=0;
 s.api.generate({},()=>ok++,()=>fail++);s.api.generate({},()=>ok++,()=>fail++);
 assert.equal(s.api.busy(),true);assert.equal(s.nodes['save-progress'].style.display,'block');
 while(s.queue.length)s.queue.shift()();
 s.callbacks[0].ok({fileName:'a.pdf'});assert.equal(s.api.busy(),true);
 s.callbacks[1].fail();assert.equal(s.api.busy(),false);
 assert.equal(s.nodes['save-progress'].style.display,'none');assert.equal(ok,1);assert.equal(fail,1);
});
test('date entry is read-only and never falls back to manual typing',()=>{
 const s=setup();s.api.setupDate();
 assert.equal(s.nodes['date-input'].readOnly,true);
 assert.equal(s.nodes['date-picker-input'].style.display,'none');
 assert.equal(s.nodes['date-picker-button'].textContent,'カレンダー');
});
