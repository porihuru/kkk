const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
function setup(){
 const elements={}, source={ID:'50',Garrison:'札幌',BidDate:'R8.10.26',Remarks:'元の備考',PublicState:'公告掲載中'}, original={ID:'100',KokokuID:'50',Text:'元公告',URL:'R8/be/original.pdf',Sort:'1'};
 const c={adminActive:true,workflowBusy:false,pendingSave:null,plannedAnnouncements:[],plannedLinks:[],allAnnouncements:[source],allLinks:[original],selectedPdfFiles:{},PDF_ROW_COUNT:5,filenameComposing:[],filenameDirty:[],filenamePending:[],
 DataService:{getCurrentUser:()=>({id:'7',name:'担当者'}),isSharePoint:()=>false},
 PublicationWorkflow:{state:x=>x.PublicState||'公告掲載中',fields:[]},
 announcementById:(id,rows)=>rows.find(x=>String(x.ID)===String(id)),
 linksFor:(id,rows)=>rows.filter(x=>String(x.KokokuID)===String(id)),
 itemFiscalYear:()=> 'R8',requireActiveFiscalYear:()=>true,
 nextId:rows=>String(Math.max(0,...rows.map(x=>Number(x.ID)))+1),
 nextLinkId:rows=>String(Math.max(0,...rows.map(x=>Number(x.ID)))+1),
 operationDateText:()=> 'now',byId:id=>elements[id]||(elements[id]={value:'',textContent:''}),
 pdfKey:(kind,id)=>kind+':'+id,clearForm(){},filterAnnouncements(){},
 fileNameFromUrl:url=>url.split('/').pop(),validPdfFile:()=>true,
 pdfInput:(id,i)=>elements[id+i]||(elements[id+i]={value:'',files:[]}),
 persistAnnouncement(...args){c.persisted=args;}};
 vm.createContext(c);
 ['normalizeStatus','isAdditionWork','canEditAddition','createAdditionWork','saveAdditionWork','publishAdditionWork'].forEach(name=>{
 const start=src.indexOf('  function '+name+'('),end=src.indexOf('\n  function ',start+1);
 vm.runInContext(src.slice(start,end),c);});
 c.create=()=>c.createAdditionWork.call({getAttribute:()=> '50'});
 return {c,source,original};
}
test('admin-only task creation and duplicate prevention',()=>{
 const {c}=setup();c.adminActive=false;c.create();assert.equal(c.plannedAnnouncements.length,0);
 c.adminActive=true;c.create();c.create();assert.equal(c.plannedAnnouncements.length,1);
 assert.equal(c.plannedAnnouncements[0].SourceAnnouncementID,'50');assert.equal(c.allLinks.length,1);
});
test('unclaimed task available to user; submitted task restricted to submitter',()=>{
 const {c}=setup();c.adminActive=false;
 assert.equal(c.canEditAddition({}),true);assert.equal(c.canEditAddition({ResultSubmittedById:'7'}),true);
 assert.equal(c.canEditAddition({ResultSubmittedById:'8'}),false);
});
test('user saves additional PDF without changing source details',()=>{
 const {c,source,original}=setup();c.create();const task=c.plannedAnnouncements[0];c.adminActive=false;
 c.byId('announcement-id').value=task.ID;c.byId('garrison-input').value='変更';c.byId('remarks-input').value='変更';
 c.pdfInput('link-text-input',0).value='追加公告';c.pdfInput('link-url-input',0).value='R8/be/add.pdf';
 c.pdfInput('pdf-file-input',0).files=[{name:'add.pdf'}];c.saveAdditionWork();
 assert.equal(task.Status,'公告追加登録');assert.equal(task.ResultSubmittedById,'7');
 assert.equal(task.Garrison,source.Garrison);assert.equal(task.Remarks,'元の備考');
 assert.equal(c.allLinks.length,1);assert.equal(c.allLinks[0],original);assert.equal(c.persisted[0],'planned');
});
test('publication appends and preserves original links',()=>{
 const {c,source,original}=setup();c.create();const task=c.plannedAnnouncements[0];task.Status='公告追加登録';
 c.plannedLinks.push({ID:'100',KokokuID:task.ID,Text:'追加',URL:'R8/be/add.pdf'});c.publishAdditionWork(task);
 assert.equal(c.allLinks.length,2);assert.equal(c.allLinks[0],original);assert.equal(original.URL,'R8/be/original.pdf');
 assert.equal(c.allLinks[1].Sort,'2');assert.notEqual(c.allLinks[1].ID,original.ID);assert.equal(source.Status,'公開待ち');
 assert.equal(c.plannedAnnouncements.length,0);assert.equal(c.plannedLinks.length,0);
});
test('reject incomplete publication and user publication',()=>{
 const {c}=setup();c.create();const task=c.plannedAnnouncements[0];c.publishAdditionWork(task);
 assert.equal(c.plannedAnnouncements.length,1);task.Status='公告追加登録';c.plannedLinks.push({ID:'101',KokokuID:task.ID});
 c.adminActive=false;c.publishAdditionWork(task);assert.equal(c.allLinks.length,1);assert.equal(c.plannedAnnouncements.length,1);
});
test('ended source cannot receive additions',()=>{
 const {c,source}=setup();source.PublicState='掲載終了';c.create();assert.equal(c.plannedAnnouncements.length,0);
});

test('addition statuses survive reload normalization',()=>{const {c}=setup();assert.equal(c.normalizeStatus('公告追加作業'),'公告追加作業');assert.equal(c.normalizeStatus('公告追加登録'),'公告追加登録');});

test('SharePoint publication reassigns only added links and leaves original link untouched',()=>{
 const {c,source,original}=setup();c.create();const task=c.plannedAnnouncements[0];task.Status='公告追加登録';
 c.plannedLinks.push({ID:'101',Id:101,KokokuID:task.ID,Text:'追加',URL:'R8/be/add.pdf'});
 const calls=[];c.DataService.isSharePoint=()=>true;
 c.DataService.update=(kind,id,data,ok)=>{calls.push({kind,id,data});ok();};
 c.DataService.remove=(kind,id,ok)=>{calls.push({kind,id,remove:true});ok();};
 c.runSave=(tasks,done)=>{let i=0;function next(){if(i===tasks.length){done();return;}tasks[i++](next,e=>{throw Error(e);});}next();};
 c.publishAdditionWork(task);
 assert.equal(calls.length,3);assert.equal(calls[0].id,101);assert.equal(calls[0].data.KokokuID,'50');
 assert.ok(!calls.some(x=>x.kind==='links'&&(x.remove||String(x.id)===original.ID)));
 assert.equal(c.allLinks.length,2);assert.equal(source.Status,'公開待ち');
});
