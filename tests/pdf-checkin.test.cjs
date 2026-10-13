const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function upload(options={}) {
 const calls=[];let success=0,error=null,states=0;
 const context={window:{location:{pathname:'/site/app/index.html'}}};
 context.FileReader=function(){this.result=new ArrayBuffer(2);};context.FileReader.prototype.readAsArrayBuffer=function(){this.onload();};
 context.XMLHttpRequest=function(){
  this.open=(method,url)=>{this.method=method;this.url=url;};this.setRequestHeader=()=>{};
  this.send=()=>{
   calls.push([this.method,this.url]);this.status=200;
   let data={};
   if(this.url.includes('?$select=CheckOutType')){states++;data={CheckOutType:options.none?2:states===1?0:options.stillOut?0:2};if(options.badState)data={};}
   if(this.url.includes('ParentList'))data={EnableMinorVersions:!!options.minor};
   if(this.url.includes('/CheckIn(')&&options.failCheckin)this.status=403;
   if(this.url.includes('/Files/add')&&options.failUpload)this.status=403;
   this.responseText=JSON.stringify({d:data});this.readyState=4;this.onreadystatechange();
  };
 };
 vm.createContext(context);vm.runInContext(fs.readFileSync('js/sp.js','utf8'),context);
 context.SP.init('/site');context.SP.digest='test';context.SP.digestExpire=Date.now()+60000;
 context.SP.uploadFile('/site/Documents','test.pdf',{name:'test.pdf'},()=>success++,e=>error=e);
 return {calls,success,error};
}
test('checked-out upload is checked in and verified before success',()=>{
 const r=upload();assert.equal(r.success,1);assert.equal(r.error,null);assert.equal(r.calls.length,5);
 assert.match(r.calls[3][1],/CheckIn.*checkintype=1/);assert.match(r.calls[4][1],/CheckOutType/);
});
test('minor version libraries use minor checkin without approval or publish',()=>{
 const r=upload({minor:true});assert.match(r.calls[3][1],/checkintype=0/);assert.equal(r.success,1);
 assert(r.calls.every(c=>!c[1].includes('/Publish')&&!c[1].includes('/Approve')));
});
test('already checked-in uploads skip checkin',()=>{const r=upload({none:true});assert.equal(r.success,1);assert.equal(r.calls.length,2);});
test('checkin failure, malformed status and persistent checkout never report success',()=>{
 for(const options of [{failCheckin:true},{badState:true},{stillOut:true}]){const r=upload(options);assert.equal(r.success,0);assert.match(r.error.statusText,/test.pdf/);}
});
test('upload failure does not attempt checkin',()=>{const r=upload({failUpload:true});assert.equal(r.calls.length,1);assert.equal(r.success,0);assert.equal(r.error.status,403);});
