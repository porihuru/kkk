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

test('PDF confirmation opens the registered URL and prefers a selected local PDF', () => {
  const elements={},opened=[],saved=[];
  const context={document:{getElementById:id=>elements[id]||(elements[id]={})},navigator:{msSaveOrOpenBlob:(file,name)=>saved.push({file,name})},DataService:{
    isSharePoint:()=>true,getPdfPreviewUrl:(url,name)=>'https://sharepoint.test/library/'+name,getPublicLinkUrl:url=>'https://public.test/'+url
  }};
  context.open=url=>{opened.push(url);return {};};context.setTimeout=fn=>fn();context.URL={createObjectURL:()=>'',revokeObjectURL:()=>{}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `global.testPdf={setup:function(link,file){plannedLinks=[link];selectedPdfFiles={};if(file){selectedPdfFiles[pdfKey("planned",link.ID)]=file;}},preview:previewPdf};`),context);
  const link={ID:'7',KokokuID:'1',Text:'確認用',FileName:'registered.pdf',URL:'R8/be/registered.pdf',Type:'公告'};
  const button={getAttribute:name=>({"data-list":'planned',"data-link-id":'7',"data-preview-url":link.URL,"data-preview-type":link.Type}[name]||'')};
  context.testPdf.setup(link,null);context.testPdf.preview.call(button);
  assert.deepEqual(opened,['https://sharepoint.test/library/registered.pdf']);
  const file={name:'selected.pdf'};context.testPdf.setup(link,file);context.testPdf.preview.call(button);
  assert.equal(saved.length,1);assert.equal(saved[0].file,file);assert.equal(saved[0].name,'registered.pdf');
  assert.match(elements['form-message'].textContent,/選択中のPDF/);
});

test('Administrator end button sets the ended state and configured end PDF without overwriting the stored link', () => {
  const elements={};
  const context={document:{getElementById:id=>elements[id]||(elements[id]={})},DataService:{isSharePoint:()=>false}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `global.testEnd={setup:function(item,link){adminActive=true;allAnnouncements=[item];allLinks=[link];filterAnnouncements=function(){};},end:endPublication,data:function(){return {announcements:allAnnouncements,links:allLinks};}};`),context);
  const item={ID:'10',Category:'NEW',Status:'公告反映済',PublicState:'公告掲載中'};
  const link={ID:'20',KokokuID:'10',Text:'公告PDF',FileName:'original.pdf',URL:'R8/be/original.pdf',Type:'公告'};
  context.testEnd.setup(item,link);context.testEnd.end.call({getAttribute:()=> '10'});
  assert.equal(item.PublicState,'掲載終了');assert.equal(item.Category,'');assert.equal(item.Status,'公開待ち');
  assert.equal(link.URL,'R8/be/original.pdf');
  const output=context.PublicationWorkflow.candidate(context.testEnd.data().announcements,context.testEnd.data().links,'R8/4/keisai-syuuryou.pdf');
  assert.equal(output.links[0].URL,'R8/4/keisai-syuuryou.pdf');assert.equal(output.links[0].Type,'掲載終了');
  assert.match(elements['form-message'].textContent,/掲載終了に変更/);
});

test('Ended announcements create one virtual result task and completed results do not create another', () => {
  const context={DataService:{getPublicationConfig:()=>({endedUrl:'R8/4/end.pdf'})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `global.testVirtual={setup:function(source,link){plannedAnnouncements=[];plannedLinks=[];allAnnouncements=[source];allLinks=[link];},sync:syncVirtualResultWork,items:function(){return plannedAnnouncements;},links:function(){return plannedLinks;}};`),context);
  const source={ID:'10',Garrison:'札幌',BidDate:'R8.10.6',Remarks:'備考',PublicState:'掲載終了'};
  const link={ID:'20',KokokuID:'10',Text:'米購入',URL:'R8/be/original.pdf',Type:'公告'};
  context.testVirtual.setup(source,link);context.testVirtual.sync();context.testVirtual.sync();
  assert.equal(context.testVirtual.items().length,1);assert.equal(context.testVirtual.items()[0].WorkType,'RESULT');assert.equal(context.testVirtual.items()[0].SourceAnnouncementID,'10');
  assert.equal(context.testVirtual.links()[0].URL,'R8/4/end.pdf');
  link.Type='結果';context.testVirtual.sync();assert.equal(context.testVirtual.items().length,0);
});

test('Result work button is visible to an ordinary user who did not post the source announcement', () => {
  const elements={};
  const context={document:{getElementById:id=>elements[id]||(elements[id]={}),getElementsByClassName:()=>[]},DataService:{canManageAnnouncement:()=>false,getPublicLinkUrl:value=>value,getPublicationConfig:()=>({endedUrl:'R8/4/end.pdf'})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `global.testResultButton={setup:function(item,link){adminActive=false;plannedAnnouncements=[item];plannedLinks=[link];},render:function(item){renderList("planned",[item]);}};`),context);
  const task={ID:'result-10',WorkType:'RESULT',SourceAnnouncementID:'10',Category:'結果',Garrison:'札幌',BidDate:'R8.10.6',Status:'結果作業',AuthorName:'未担当',_virtualResult:true};
  const link={ID:'result-link-10-0',KokokuID:'result-10',Text:'米購入',URL:'R8/4/end.pdf',Type:'掲載終了'};
  context.testResultButton.setup(task,link);context.testResultButton.render(task);
  assert.match(elements['planned-announcement-list'].innerHTML,/result-work-button/);assert.match(elements['planned-announcement-list'].innerHTML,/結果作業/);
});

test('An ordinary user can save a virtual result task as the recorded result submitter', () => {
  const elements={
    'announcement-id':{value:'result-10'},'remarks-input':{value:'結果備考'},
    'link-text-input-1':{value:'米購入'},'link-url-input-1':{value:'R8/be/081006-sap-n-bei_kk.pdf'},'pdf-file-input-1':{files:[{name:'result.pdf'}]}
  };
  const context={document:{getElementById:id=>elements[id]||(elements[id]={value:'',files:[]})},DataService:{getCurrentUser:()=>({id:'user-b',name:'利用者B'}),canManageAnnouncement:()=>false,isSharePoint:()=>false}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `clearForm=function(){resultWorkMode=false;};filterAnnouncements=function(){};global.testSaveResult={setup:function(source,task,link){allAnnouncements=[source];allLinks=[];plannedAnnouncements=[task];plannedLinks=[link];resultWorkMode=true;editingResultSourceId=source.ID;},save:saveResultWork,data:function(){return {items:plannedAnnouncements,links:plannedLinks,files:selectedPdfFiles};}};`),context);
  const source={ID:'10',Garrison:'札幌',BidDate:'R8.10.6',Remarks:'元備考',PublicState:'掲載終了'};
  const task={ID:'result-10',WorkType:'RESULT',SourceAnnouncementID:'10',WorkflowKey:'RESULT:10',_virtualResult:true};
  const link={ID:'result-link-10-0',KokokuID:'result-10',Text:'米購入',URL:'R8/4/end.pdf',Type:'掲載終了',_virtualResult:true};
  context.testSaveResult.setup(source,task,link);assert.equal(context.testSaveResult.save(),false);
  const data=context.testSaveResult.data();assert.equal(data.items.length,1);assert.equal(data.items[0].AuthorId,'user-b');assert.equal(data.items[0].ResultSubmittedById,'user-b');assert.equal(data.items[0].Status,'結果登録');
  assert.equal(data.links[0].URL,'R8/be/081006-sap-n-bei_kk.pdf');assert.equal(data.links[0].Type,'結果');assert.equal(Object.keys(data.files).length,1);
});

test('Publishing a saved result overwrites its source announcement and removes the planned task', () => {
  const elements={};
  const context={document:{getElementById:id=>elements[id]||(elements[id]={})},DataService:{isSharePoint:()=>false}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `filterAnnouncements=function(){};clearForm=function(){};global.testPublishResult={setup:function(source,sourceLink,task,resultLink){adminActive=true;allAnnouncements=[source];allLinks=[sourceLink];plannedAnnouncements=[task];plannedLinks=[resultLink];},publish:publishResultWork,data:function(){return {published:allAnnouncements,publishedLinks:allLinks,planned:plannedAnnouncements,plannedLinks:plannedLinks};}};`),context);
  const source={ID:'10',Category:'',PublicState:'掲載終了',Status:'公告反映済'};
  const sourceLink={ID:'20',KokokuID:'10',Text:'米購入',URL:'R8/be/original.pdf',Type:'公告'};
  const task={ID:'30',WorkType:'RESULT',SourceAnnouncementID:'10',Garrison:'札幌',BidDate:'R8.10.6',Remarks:'結果',ResultSubmittedById:'user-b',ResultSubmittedByName:'利用者B',ResultSubmittedAt:'2026-09-22T00:00:00Z'};
  const resultLink={ID:'40',KokokuID:'30',Text:'米購入',FileName:'081006-sap-n-bei_kk.pdf',URL:'R8/be/081006-sap-n-bei_kk.pdf',Type:'結果',Sort:'1'};
  context.testPublishResult.setup(source,sourceLink,task,resultLink);context.testPublishResult.publish(task);
  const data=context.testPublishResult.data();
  assert.equal(source.Category,'結果');assert.equal(source.PublicState,'結果掲載中');assert.equal(source.Status,'公開待ち');assert.equal(source.ResultSubmittedById,'user-b');
  assert.equal(data.publishedLinks[0].URL,resultLink.URL);assert.equal(data.publishedLinks[0].Type,'結果');assert.equal(data.planned.length,0);assert.equal(data.plannedLinks.length,0);
});
