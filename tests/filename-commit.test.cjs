const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('typing does not convert; Enter and blur commit once; IME Enter is ignored; stale callback is ignored',()=>{
 const nodes={},jobs=[];
 const c={document:{getElementById:id=>nodes[id]||(nodes[id]={value:''})},FilenameGenerator:{generate:(input,ok)=>jobs.push(ok)},DataService:{getPublicationConfig:()=>({pdfRoot:'R8/be'})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),c);
 vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;','setupPdfFilename();'),c);
 const input=nodes['link-text-input-1'];input.value='米';input.oninput();input.oninput();assert.equal(jobs.length,0);
 let prevented=0;input.onkeydown({keyCode:13,preventDefault(){prevented++;}});assert.equal(jobs.length,1);assert.equal(prevented,1);
 input.onblur();assert.equal(jobs.length,1);
 input.oncompositionstart();input.value='米購入';input.oninput();input.onkeydown({keyCode:13,preventDefault(){assert.fail('IME');}});assert.equal(jobs.length,1);
 input.oncompositionend();assert.equal(jobs.length,1);
 jobs[0]({fileName:'old.pdf'});assert.equal(nodes['link-url-input-1'],undefined);
 input.onblur();assert.equal(jobs.length,2);jobs[1]({fileName:'new.pdf'});assert.equal(nodes['link-url-input-1'].value,'R8/be/new.pdf');
});
