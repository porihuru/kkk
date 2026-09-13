const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function appContext() {
  const elements = {};
  const context = { document: { getElementById: id => elements[id] || (elements[id] = {}) } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8').replace('global.onload = start;', 'global.testing = { run: runSave, retry: function () { pendingSave(); }, busy: function () { return workflowBusy; }, dirty: function () { return unsaved; } };'), context);
  return { api: context.testing, elements };
}

test('Partial save retries the failed step without repeating successful writes', () => {
  const { api, elements } = appContext();
  const calls = []; let attempt = 0, complete = false;
  api.run([
    ok => { calls.push('announcement'); ok(); },
    (ok, fail) => { calls.push('link'); if (attempt++ === 0) fail(); else ok(); },
    ok => { calls.push('delete'); ok(); }
  ], () => { complete = true; });
  assert.equal(complete, false); assert.equal(api.dirty(), true); assert.equal(api.busy(), false);
  assert.match(elements['form-message'].textContent, /未保存/);
  api.retry();
  assert.deepEqual(calls, ['announcement', 'link', 'link', 'delete']);
  assert.equal(complete, true); assert.equal(api.dirty(), false);
});

test('ZIP keeps PDF binary bytes and UTF-8 HTML intact', async () => {
  const context = { Blob, Uint8Array, FileReader: class {
    readAsArrayBuffer(file) { file.arrayBuffer().then(result => { this.result = result; this.onload(); }); }
  } };
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/zip-export.js', 'utf8'), context);
  const pdf = Buffer.from([37,80,68,70,45,0,128,255,10]);
  const zip = await new Promise((resolve, reject) => context.ZipExport.create([{name:'nafin/R8open.html',content:'公告'}, {name:'nafin/R8/op/test.pdf',file:new Blob([pdf])}],resolve,reject));
  const bytes = Buffer.from(await zip.arrayBuffer()); let offset = 0; const restored = {};
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset+30,offset+30+nameLength).toString();
    const start = offset+30+nameLength+extra;
    restored[name] = bytes.subarray(start,start+size); offset = start+size;
  }
  assert.deepEqual(restored['nafin/R8/op/test.pdf'],pdf);
  assert.equal(restored['nafin/R8open.html'].toString('utf8'),'公告');
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);
});

test('ZIP read failure reports failure once and never reports success', () => {
  let failures = 0, successes = 0;
  const context = { Blob, Uint8Array, FileReader: class { readAsArrayBuffer() { this.onerror(); } } };
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/zip-export.js', 'utf8'), context);
  context.ZipExport.create([{name:'a.pdf',file:{}},{name:'b.pdf',file:{}}],()=>successes++,()=>failures++);
  assert.equal(successes,0); assert.equal(failures,1);
});

test('SharePoint update and delete use loaded ETag and reject missing versions', () => {
  const calls = [];
  const context = { window: {location:{pathname:'/sites/test/doclib/index.html'}} };
  context.XMLHttpRequest = function () {
    this.headers = {};
    this.open = (method,url) => {this.method=method;this.url=url;};
    this.setRequestHeader = (key,value) => {this.headers[key]=value;};
    this.getResponseHeader = () => '"4"';
    this.send = () => {
      calls.push({url:this.url,headers:this.headers}); this.status=200;
      let data;
      if(this.url.includes('/fields?')) data={results:[]};
      else if(this.url.includes('contextinfo')) data={GetContextWebInformation:{FormDigestValue:'test',FormDigestTimeoutSeconds:1800}};
      else if(this.url.includes('ListItemEntityTypeFullName')) data={ListItemEntityTypeFullName:'SP.Data.TestListItem'};
      else if(this.method==='GET') data={results:[{Id:1,__metadata:{etag:'"3"'}}]};
      else { this.status=412; data={}; }
      this.responseText=JSON.stringify({d:data});this.readyState=4;this.onreadystatechange();
    };
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/sp.js','utf8'),context);
  context.SP.init('/sites/test'); context.SP.load('test',['Id'],()=>{},assert.fail);
  let conflicts=0;
  context.SP.update('test',1,{Sort:'2'},assert.fail,()=>conflicts++);
  context.SP.remove('test',1,assert.fail,()=>conflicts++);
  context.SP.update('test',2,{Sort:'2'},assert.fail,()=>conflicts++);
  const mutations=calls.filter(c=>c.headers['X-HTTP-Method']);
  assert.equal(mutations.length,2); mutations.forEach(c=>assert.equal(c.headers['IF-MATCH'],'"3"'));
  assert.equal(conflicts,3);
});

test('Moving a new announcement waits for ZIP success before publication; ZIP failure preserves state', () => {
  const elements = {};
  let zipSuccess, zipFailure;
  const context = { Blob, navigator:{msSaveBlob:()=>{}}, document:{getElementById:id=>elements[id]||(elements[id]={})},
    DataService:{isSharePoint:()=>false,getPublicHtmlPath:()=> 'nafin/R8open.html',getPublicHtmlFileName:()=> 'R8open.html',getPublicationConfig:()=>({endedUrl:'R8/4/end.pdf'})},
    HtmlExport:{create:()=>'<html></html>'}, ZipExport:{create:(files,ok,fail)=>{assert.equal(files[0].name,'nafin/R8open.html');zipSuccess=ok;zipFailure=fail;}} };
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `global.testFlow = { move: moveAnnouncement, zip: exportZip, setup: function(item) { adminActive=true; filterAnnouncements=function(){}; plannedAnnouncements=[item]; plannedLinks=[{ID:'1',KokokuID:item.ID,Text:'PDF',URL:'R8/op/a.pdf'}]; }, items:function(){return allAnnouncements;} };`),context);
  const item={ID:'1',Category:'NEW',Status:'公告登録'};
  context.testFlow.setup(item);
  context.testFlow.move.call({getAttribute:key=>key==='data-id'?'1':'planned'});
  assert.equal(item.Status,'公開待ち');assert.equal(item.ListKind,'published');
  context.testFlow.zip(false);zipFailure();assert.equal(item.Status,'公開待ち');
  context.testFlow.zip(false);zipSuccess(new Blob(['zip']));
  assert.equal(item.Status,'公告反映済');assert.equal(item.PublicState,'公告掲載中');
});

test('Announcement save uploads PDF first and uses returned parent ID before saving links', () => {
  const elements={}, calls=[];let attempt=0;
  const context={document:{getElementById:id=>elements[id]||(elements[id]={})},DataService:{
    isSharePoint:()=>true,
    uploadPdf:(file,name,ok)=>{calls.push('pdf');ok();},
    add:(kind,payload,ok,fail)=>{
      calls.push(kind);
      if(kind==='announcements')ok({Id:42,Created:'2026-09-13T00:00:00Z'});
      else {assert.equal(payload.KokokuID,'42');if(attempt++===0)fail();else ok({Id:80});}
    }
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', 'filterAnnouncements=function(){}; global.testSave={save:persistAnnouncement,retry:function(){pendingSave();}};'),context);
  const item={ID:'1'},link={ID:'3',KokokuID:'1',Text:'PDF',URL:'R8/op/a.pdf',FileName:'a.pdf',Sort:'1'};
  context.testSave.save('planned',item,[link],true,{'planned:3':{}},[]);
  assert.equal(item.ID,'42');assert.equal(link.KokokuID,'42');assert.match(elements['form-message'].textContent,/未保存/);
  context.testSave.retry();
  assert.deepEqual(calls,['pdf','announcements','links','links']);assert.equal(link.Id,80);
  assert.match(elements['form-message'].textContent,/保存しました/);
});
