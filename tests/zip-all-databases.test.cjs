const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(options = {}) {
  const keys = ['KOKOKU', 'KOUJI', 'OP', 'KOBO'];
  const folders = {KOKOKU:'be', KOUJI:'kouji', OP:'op', KOBO:'kobo'};
  const elements = {}, loads = [], reads = [], updates = [], archives = [], versions = new Set();
  let initializations = 0, downloadCount = 0, saveFailed = false;
  const config = fs.readFileSync('config/config.txt', 'utf8').replace(/^DATA_MODE=.*$/m, 'DATA_MODE=SHAREPOINT');
  const c = {document:{getElementById:id=>elements[id]||(elements[id]={style:{}})},
    SP:{init:()=>{initializations++;versions.clear();}, getCurrentUser:ok=>ok({id:'7',name:'User'}),
      load:(list,columns,ok,fail)=>{
        loads.push(list);
        if (options.loadFail && list === 'op') { fail(); return; }
        if (list.endsWith('_settings') || list === 'settings') { ok([{Type:'date',Text:list}]); return; }
        if (list.endsWith('_links') || list === 'links') {
          const key = list === 'links' ? 'KOKOKU' : list.replace('_links','').toUpperCase();
          ok(['1','2','3','4'].map(id=>({ID:id,KokokuID:id,URL:(id==='3'?'R9':'R8')+'/'+folders[key]+'/'+id+'.pdf',FileName:id+'.pdf'}))); return;
        }
        versions.add(list+':1'); versions.add(list+':2');
        ok([
          {ID:'1',ListKind:'published',BidDate:'R8.10.1',Status:'公開待ち',Sort:'2'},
          {ID:'2',ListKind:'published',BidDate:'R8.10.1',Status:'公告反映済',PublicState:'公告掲載中',Sort:'1'},
          {ID:'3',ListKind:'published',BidDate:'R9.10.1',Status:'公開待ち'},
          {ID:'4',ListKind:'planned',BidDate:'R8.10.1',Status:'公告登録'}
        ]);
      },
      update:(list,id,patch,ok,fail)=>{
        assert(versions.has(list+':'+id), 'ETag must survive loading other DBs');
        if (options.saveFail && list==='op' && !saveFailed) { saveFailed=true; fail(); return; }
        updates.push(list+':'+id); ok();
      }},
    HtmlExport:{create:(rows,links,settings,year)=>{
      assert.equal(year,'R8'); assert.deepEqual(Array.from(rows,r=>r.ID),['2','1']);
      assert.equal(links.length,2); assert.equal(settings.length,1);
      return JSON.stringify(links);
    }},
    ZipPreview:{open:(name,files,full,yes,no)=>{assert.equal(reads.length,0); options.cancel ? no() : yes();}},
    ZipExport:{create:(files,ok,fail)=>{archives.push(files); options.zipFail ? fail() : ok({});}}
  };
  c.XMLHttpRequest=function(){this.open=()=>{};this.send=()=>{this.status=200;this.readyState=4;this.responseText=config;this.onreadystatechange();};};
  vm.createContext(c);
  for (const file of ['data-service','publication-workflow']) vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),c);
  c.DataService.setDatabase('KOUJI'); c.DataService.setFiscalYear('R8');
  let active;
  c.DataService.load(data=>active=data,assert.fail);
  c.DataService.readPdf=(link,ok,fail,database)=>{
    reads.push(database+':'+link.ID);
    assert.equal(c.DataService.getPublicationConfig('R8',database).pdfRoot,'R8/'+folders[database]);
    assert.match(c.DataService.getPublicationConfig('R8',database).pdfLibrary,new RegExp('/R8/'+folders[database]+'$'));
    options.pdfFail && database==='OP' ? fail() : ok({});
  };
  c.download=()=>{downloadCount++;if(options.downloadFail)throw Error('download failed');};
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `
    downloadBlob=global.download;filterAnnouncements=function(){};
    global.startZip=function(data,full){activeFiscalYear='R8';allAnnouncements=data.publishedAnnouncements;allLinks=data.publishedLinks;allSettings=data.settings;exportZip(full);};
  `),c);
  c.startZip(active,!!options.full);
  assert.equal(c.DataService.getDatabase(),'KOUJI');
  assert.equal(c.DataService.getFiscalYear(),'R8');
  assert.equal(c.DataService.getCurrentUser().id,'7');
  assert.equal(initializations,1);
  return {c,active,keys,elements,loads,reads,updates,archives,downloadCount};
}

test('ZIP from construction includes all four DBs, isolates identical IDs, filters year and planned rows, saves to original lists',()=>{
  const s=fixture();
  assert.equal(s.archives.length,1);
  assert.deepEqual(Array.from(s.archives[0],f=>f.name),[
    'R8kokoku.html','R8/be/1.pdf','R8koukoku_kouji.html','R8/kouji/1.pdf',
    'R8open.html','R8/op/1.pdf','R8koubo.html','R8/kobo/1.pdf'
  ]);
  assert.deepEqual(s.reads,['KOKOKU:1','KOUJI:1','OP:1','KOBO:1']);
  assert.deepEqual(s.updates,['kokoku:1','kouji:1','op:1','kobo:1']);
  assert.equal(s.active.publishedAnnouncements[0].Status,'公告反映済');
});

test('full combined ZIP includes historical PDFs from every database',()=>{
  const s=fixture({full:true});
  assert.equal(s.archives[0].length,12);
  for(const key of s.keys) assert(s.reads.includes(key+':2'));
});

for(const kind of ['loadFail','pdfFail','cancel','zipFail','downloadFail']) {
  test(kind+' never publishes any database',()=>{
    const s=fixture({[kind]:true}); assert.equal(s.updates.length,0);
    assert.equal(s.active.publishedAnnouncements[0].Status,'公開待ち');
    if(['loadFail','pdfFail','cancel'].includes(kind)) assert.equal(s.archives.length,0);
  });
}

test('failed status save retries the correct DB without repeating completed saves or downloading again',()=>{
  const s=fixture({saveFail:true});
  assert.deepEqual(s.updates,['kokoku:1','kouji:1']);
  s.elements['save-progress-retry'].onclick();
  assert.deepEqual(s.updates,['kokoku:1','kouji:1','op:1','kobo:1']);
  assert.equal(s.downloadCount,1);
});

test('CSV edits and selected PDFs survive switching from announcements to construction and back after combined ZIP',()=>{
  const elements={}, archives=[];
  const config=fs.readFileSync('config/config.txt','utf8').replace(/^DATA_MODE=.*$/m,'DATA_MODE=CSV');
  const c={window:{confirm:()=>true},document:{getElementById:id=>elements[id]||(elements[id]={style:{}})},
    CsvData:{load:ok=>ok({announcements:[],links:[],publishedAnnouncements:[],publishedLinks:[],settings:[]})},
    HtmlExport:{create:rows=>JSON.stringify(rows)},
    ZipPreview:{open:(name,files,full,yes)=>yes()},
    ZipExport:{create:(files,ok)=>{archives.push(files);ok({});}}
  };
  c.XMLHttpRequest=function(){this.open=()=>{};this.send=()=>{this.status=200;this.readyState=4;this.responseText=config;this.onreadystatechange();};};
  vm.createContext(c);
  for(const name of ['data-service','publication-workflow'])vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),c);
  vm.runInContext(fs.readFileSync('js/app.js','utf8').replace('global.onload = start;', `
    deactivateAdmin=function(){};filterAnnouncements=function(){};renderSettings=function(){};updateFiscalYearUi=function(){};downloadBlob=function(){};
    global.testCsv={load:loadData,zip:exportZip,rows:function(){return allAnnouncements;},
      edit:function(folder){allAnnouncements=[{ID:'1',BidDate:'R8.10.1',Category:'NEW',Status:'公開待ち'}];allLinks=[{ID:'1',KokokuID:'1',URL:'R8/'+folder+'/1.pdf'}];selectedPdfFiles[pdfKey('published','1')]={name:folder+'.pdf'};unsaved=true;},
      switch:function(key){byId('database-input').value=key;switchDatabase();}};
    activeFiscalYear='R8';
  `),c);
  c.testCsv.load(); c.testCsv.edit('be'); c.testCsv.switch('KOUJI'); c.testCsv.edit('kouji');
  c.testCsv.zip(false);
  assert.equal(archives.length,1);
  const pdfs=Array.from(archives[0]).filter(f=>f.file);
  assert.deepEqual(pdfs.map(f=>[f.name,f.file.name]),[['R8/be/1.pdf','be.pdf'],['R8/kouji/1.pdf','kouji.pdf']]);
  assert.equal(archives[0].filter(f=>f.name.endsWith('.html')).length,4);
  c.testCsv.switch('KOKOKU');
  assert.equal(c.testCsv.rows().length,1);
  assert.equal(c.testCsv.rows()[0].Status,'公告反映済');
});
