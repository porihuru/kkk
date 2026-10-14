const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const calls=[], context={Blob,location:{href:'https://intranet.example/na/na/site/app/index.html'},
 document:{implementation:{createHTMLDocument(){throw Error('detached document must not be used');}}},
 SP:{webRoot:'/na/na/site'},CsvData:{load:ok=>ok({})}};
 context.XMLHttpRequest=function(){this.open=(m,u)=>this.url=u;this.send=()=>{
 if(this.url==='config/config.txt'){this.status=200;this.readyState=4;this.responseText='DATA_MODE=CSV\nWEB_ROOT=/na/na/site\nPDF_LIBRARY=/na/na/site/Documents/nafin/R8/be\nDB_KOUJI_PDF_LIBRARY=/na/na/site/Documents/nafin/R8/kouji';}
 else {calls.push(this.url);this.status=200;this.readyState=4;this.response=new Uint8Array([37,80,68,70]).buffer;}
 this.onreadystatechange();};};
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/data-service.js','utf8'),context);
 context.DataService.load(()=>{},assert.fail);context.DataService.isSharePoint=()=>true;
 return {api:context.DataService,calls};
}
test('PDF preview resolves storage path without detached DOM or URL constructor',()=>{
 const {api}=setup();
 assert.equal(api.getPdfPreviewUrl('R8/be/081028-sap-n-takog.pdf',''),'https://intranet.example/na/na/site/Documents/nafin/R8/be/081028-sap-n-takog.pdf');
 assert.equal(api.getPdfPreviewUrl('R9/kouji/a.pdf','a.pdf','KOUJI'),'https://intranet.example/na/na/site/Documents/nafin/R9/kouji/a.pdf');
 assert.match(api.getPdfPreviewUrl('R8/be/a.pdf','日本 語.pdf'),/%E6%97%A5%E6%9C%AC%20%E8%AA%9E.pdf$/);
});
test('ZIP requests the same storage URL as preview and receives PDF bytes',()=>{
 const {api,calls}=setup();let blob;
 const link={URL:'R8/be/081028-sap-n-takog.pdf',FileName:'081028-sap-n-takog.pdf'};
 api.readPdf(link,b=>blob=b,assert.fail,'KOKOKU');
 assert.equal(calls[0],api.getPdfPreviewUrl(link.URL,link.FileName,'KOKOKU'));assert.equal(blob.size,4);
});
