const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),ctx);
const W=ctx.PublicationWorkflow;
const csvSource=fs.readFileSync('js/csv-data.js','utf8');vm.runInContext(csvSource.slice(csvSource.indexOf('/* CSVデータ')),ctx);
function samples(){return {announcements:ctx.CsvData.parse(fs.readFileSync('csv/kokoku_public.csv','utf8')),links:ctx.CsvData.parse(fs.readFileSync('csv/links_public.csv','utf8'))};}
const ended='R8/4/keisai-syuuryou.pdf';

test('Fiscal year is derived from the bid date at the April boundary',()=>{
 assert.equal(W.fiscalYear('R9.3.31'),'R8');
 assert.equal(W.fiscalYear('R9.4.1'),'R9');
 assert.equal(W.fiscalYear('R8.12.1'),'R8');
 assert.equal(W.fiscalYear('R9.2.29'),'');
});

test('Due boundary is Japan midnight; invalid dates and results are not due',()=>{
 const row={BidDate:'R8.9.13',PublicState:'公告掲載中'};
 assert(!W.due(row,new Date('2026-09-12T14:59:59Z')));assert(W.due(row,new Date('2026-09-12T15:00:00Z')));
 assert(!W.due({BidDate:'R8.2.31'}));assert(!W.due({...row,PublicState:'結果掲載中'}));
});

test('Publication copy substitutes the common end PDF without changing stored links',()=>{
 const s=samples();const before=JSON.stringify(s);const candidate=W.candidate(s.announcements,s.links,ended);
 assert.equal(candidate.links.find(r=>r.KokokuID==='4').URL,ended);
 assert.equal(candidate.links.find(r=>r.KokokuID==='4').Type,'掲載終了');
 assert.equal(candidate.announcements.find(r=>r.ID==='4').Category,'');
 assert.equal(JSON.stringify(s),before);
});

test('Result publication keeps the PDF selected by the administrator',()=>{
 const s=samples();const candidate=W.candidate(s.announcements,s.links,ended);
 assert.equal(candidate.links.find(r=>r.KokokuID==='7').URL,'R8/be/demo-result-7.pdf');
 assert.equal(candidate.links.find(r=>r.KokokuID==='7').Type,'結果');
 assert.equal(candidate.announcements.find(r=>r.ID==='7').Status,'結果反映済');
});

test('HTML comparison ignores database IDs but detects text and link differences',()=>{
 const data={announcements:[{ID:'1',Category:'NEW',Garrison:'札幌',BidDate:'R8.9.13',Remarks:''}],links:[{KokokuID:'1',Text:'公告',URL:'R8/be/a.pdf',Sort:1}]};
 const same=JSON.parse(JSON.stringify(data));same.announcements[0].ID='99';same.links[0].KokokuID='99';
 const resolve=value=>'https://example.test/'+value;
 assert.equal(W.signature(data,resolve),W.signature(same,resolve));
 same.links[0].URL='R8/be/b.pdf';assert.notEqual(W.signature(data,resolve),W.signature(same,resolve));
});

test('Every database has three ordinary planned samples and eight public scenarios',()=>{
 const removed=['TargetID','RequestType','RequestStatus','ResultURL','ResultName'];
 const workflow=['WorkType','SourceAnnouncementID','WorkflowKey','ResultSubmittedById','ResultSubmittedByName','ResultSubmittedAt'];
 for(const base of ['kokoku','kouji','op','kobo']){
  const pub=ctx.CsvData.parse(fs.readFileSync('csv/'+base+'_public.csv','utf8'));
  const planned=ctx.CsvData.parse(fs.readFileSync('csv/'+base+'.csv','utf8'));
  assert.equal(pub.length,8);assert.equal(planned.length,3);
  assert(planned.some(row=>row.Status==='公告登録'));
  assert(planned.some(row=>row.Status==='内容修正'));
  assert(planned.some(row=>row.AuthorId==='csv-user-2'));
  assert(pub.some(row=>row.PublicState==='掲載終了'));
  assert(pub.some(row=>row.PublicState==='結果掲載中'));
  planned.concat(pub).forEach(row=>removed.forEach(key=>assert.equal(Object.hasOwn(row,key),false)));
  planned.concat(pub).forEach(row=>workflow.forEach(key=>assert.equal(Object.hasOwn(row,key),true)));
  planned.concat(pub).forEach(row=>assert.equal(row.FiscalYear,W.fiscalYear(row.BidDate)));
 }
});

test('Year-specific HTML updates the file-era heading and keeps only supplied rows',()=>{
 const template='<html><head><title>R8年度入札公告一覧</title></head><body><h1>令和8年度入札公告一覧</h1><table id="myTable"><tbody><tr><td>old</td></tr></tbody></table></body></html>';
 const htmlContext={XMLHttpRequest:function(){this.open=()=>{};this.send=()=>{this.status=200;this.readyState=4;this.responseText=template;this.onreadystatechange();};}};
 vm.createContext(htmlContext);vm.runInContext(fs.readFileSync('js/html-export.js','utf8'),htmlContext);
 htmlContext.HtmlExport.loadTemplate(()=>{},assert.fail);
 const output=htmlContext.HtmlExport.create([{ID:'1',Category:'NEW',Garrison:'札幌',BidDate:'R9.4.1',Remarks:'R9',Status:'公告反映済'}],[{KokokuID:'1',Text:'公告',URL:'R9/be/a.pdf',Sort:'1'}],[],'R9');
 assert.match(output,/R9年度入札公告一覧/);assert.match(output,/令和9年度入札公告一覧/);assert.match(output,/R9\/be\/a\.pdf/);assert.doesNotMatch(output,/>old</);
});

test('Update request controls and fields are absent from the application',()=>{
 const source=['index.html','js/app.js','js/data-service.js','js/sp.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
 ['更新依頼','publication-request','request-button','RequestType','RequestStatus','TargetID','ResultURL','ResultName'].forEach(term=>assert.equal(source.includes(term),false,term));
});
