const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(full, failId) {
  const elements = {}, reads = [], archives = [], patches = [];
  const rows = [
    {ID:'1',Status:'結果反映済',Category:'結果'},
    {ID:'2',Status:'公開待ち',Category:'NEW'},
    {ID:'3',Status:'公開待ち',Category:'結果'},
    {ID:'4',Status:'公開待ち',PublicState:'掲載終了'}
  ].map(x=>Object.assign({FiscalYear:'R8',BidDate:'R8.10.1'},x));
  const links = rows.map(x=>({ID:x.ID,KokokuID:x.ID,URL:'R8/be/'+x.ID+'.pdf',FileName:x.ID+'.pdf',Type:x.Category==='結果'?'結果':'公告'}));
  const context = {document:{getElementById:id=>elements[id]||(elements[id]={})},
    DataService:{isSharePoint:()=>true,getPublicationConfig:()=>({endedUrl:'R8/4/end.pdf'}),getPublicHtmlPath:()=> 'nafin/R8.html',getPublicHtmlFileName:()=> 'R8.html',
      readPdf:(link,ok,fail)=>{reads.push(link.ID);if(link.ID===failId)fail();else ok({});}},
    HtmlExport:{create:(items)=>{assert.equal(items.length,4);return 'all announcements';}},
    ZipExport:{create:(files,ok)=>{archives.push(files);ok({});}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `downloadBlob=function(){};filterAnnouncements=function(){};saveWorkflowItem=function(item,patch,ok){global.patches.push(item.ID);ok();};global.testZip=function(rows,links,full){activeFiscalYear="R8";allAnnouncements=rows;allLinks=links;exportZip(full);};`),context);
  context.patches=patches;
  context.testZip(rows,links,full);
  return {reads,archives,patches,elements};
}
test('update ZIP skips historical result PDFs, reads pending announcement and result PDFs, and creates once',()=>{
  const s=fixture(false,'1');
  assert.deepEqual(s.reads,['2','3']);
  assert.equal(s.archives.length,1);
  assert.deepEqual(Array.from(s.archives[0],x=>x.name),['nafin/R8.html','nafin/R8/be/2.pdf','nafin/R8/be/3.pdf']);
});
test('full ZIP reads all non-ended PDFs',()=>{
  const s=fixture(true);
  assert.deepEqual(s.reads,['2','1','3']);
  assert.equal(s.archives.length,1);
});
test('missing pending PDF blocks ZIP and publication status and identifies failing file',()=>{
  const s=fixture(false,'3');
  assert.equal(s.archives.length,0);
  assert.equal(s.patches.length,0);
  assert.match(s.elements['zip-message'].textContent,/公告ID=3.*3.pdf/);
});
