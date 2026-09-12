const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/publication-workflow.js','utf8'),ctx);
const W=ctx.PublicationWorkflow;
const csvSource=fs.readFileSync('js/csv-data.js','utf8');vm.runInContext(csvSource.slice(csvSource.indexOf('/* CSVデータ')),ctx);
function samples(){return {announcements:ctx.CsvData.parse(fs.readFileSync('csv/kokoku_public.csv','utf8')),links:ctx.CsvData.parse(fs.readFileSync('csv/links_public.csv','utf8')),requests:ctx.CsvData.parse(fs.readFileSync('csv/kokoku.csv','utf8'))};}
const ended='R8/4/keisai-syuuryou.pdf';
test('Due boundary is Japan midnight; invalid dates and results are not due',()=>{
 const row={BidDate:'R8.9.13',PublicState:'公告掲載中'};
 assert(!W.due(row,new Date('2026-09-12T14:59:59Z')));assert(W.due(row,new Date('2026-09-12T15:00:00Z')));
 assert(!W.due({BidDate:'R8.2.31'}));assert(!W.due({...row,PublicState:'結果掲載中'}));
});
test('Only approved requests affect export; source announcements and original PDF links stay unchanged',()=>{
 const s=samples(),before=JSON.stringify(s);const candidate=W.candidate(s.announcements,s.links,s.requests,ended);
 assert.equal(candidate.announcements.find(r=>r.ID==='3').PublicState,'公告掲載中');
 assert.equal(candidate.announcements.find(r=>r.ID==='5').PublicState,'掲載終了');
 assert.equal(candidate.announcements.find(r=>r.ID==='6').PublicState,'結果掲載中');
 assert.equal(candidate.links.find(r=>r.KokokuID==='6').URL,'R8/be/demo-result-6.pdf');
 assert.equal(JSON.stringify(s),before);
});
test('Approved end request uses common end PDF without destroying original links',()=>{
 const s=samples();s.requests[0].RequestStatus='公開待ち';
 const candidate=W.candidate(s.announcements,s.links,s.requests,ended);
 assert.equal(candidate.links.find(r=>r.KokokuID==='3').URL,ended);
 assert.equal(s.links.find(r=>r.KokokuID==='3').URL,'R8/be/demo-announcement-3.pdf');
});
test('Results can replace either an original announcement or an ended announcement',()=>{
 const s=samples();s.requests[1].RequestStatus='公開待ち';const candidate=W.candidate(s.announcements,s.links,s.requests,ended);
 for(const id of ['5','6'])assert.equal(candidate.announcements.find(r=>r.ID===id).PublicState,'結果掲載中');
});
test('Invalid targets, missing result PDF and duplicate approved requests are rejected',()=>{
 const s=samples();assert.throws(()=>W.validate({TargetID:'no',RequestType:'結果登録'},s.announcements));
 assert.throws(()=>W.validate({TargetID:'1',RequestType:'結果登録',ResultURL:''},s.announcements));
 const r={...s.requests[2]};s.requests.push(r);assert.throws(()=>W.candidate(s.announcements,s.links,s.requests,ended));
});
test('HTML comparison ignores database IDs but detects text, link, date and order differences',()=>{
 const data={announcements:[{ID:'1',Category:'NEW',Garrison:'札幌',BidDate:'R8.9.13',Remarks:''}],links:[{KokokuID:'1',Text:'公告',URL:'R8/be/a.pdf',Sort:1}]};
 const same=JSON.parse(JSON.stringify(data));same.announcements[0].ID='99';same.links[0].KokokuID='99';
 const resolve=value=>'https://example.test/'+value;
 assert.equal(W.signature(data,resolve),W.signature(same,resolve));
 same.links[0].URL='R8/be/b.pdf';assert.notEqual(W.signature(data,resolve),W.signature(same,resolve));
});
test('Every database contains all workflow sample states and request targets',()=>{
 for(const base of ['kokoku','kouji','op','kobo']){
  const pub=ctx.CsvData.parse(fs.readFileSync('csv/'+base+'_public.csv','utf8')),req=ctx.CsvData.parse(fs.readFileSync('csv/'+base+'.csv','utf8'));
  assert.equal(pub.length,8);assert.equal(req.length,4);
  for(const r of req)assert(pub.some(p=>p.ID===r.TargetID));
  assert(req.some(r=>r.RequestStatus==='公開待ち'));assert(req.some(r=>r.RequestStatus==='反映確認済み'));
  assert(pub.some(r=>r.AuthorId==='csv-user-2'));
 }
});
