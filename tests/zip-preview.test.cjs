const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('tree groups actual paths and rejects duplicates, path traversal and file/directory collisions',()=>{
 const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('js/zip-preview.js','utf8'),c);
 const files=['nafin/R8kokoku.html','nafin/R8/be/a.pdf','nafin/R8/be/b.pdf'].map(name=>({name}));
 assert.equal(c.ZipPreview.tree('update.zip',files),'update.zip\n└─ nafin/\n   ├─ R8kokoku.html\n   └─ R8/\n      └─ be/\n         ├─ a.pdf\n         └─ b.pdf');
 for(const paths of [['a.pdf','A.pdf'],['../a.pdf'],['/a.pdf'],['nafin','nafin/a.pdf'],['nafin/a.pdf','nafin']])assert.throws(()=>c.ZipPreview.tree('x.zip',paths.map(name=>({name}))));
});
test('dialog waits for OK, cancel and Escape never approve, and duplicate disables OK',()=>{
 const body={children:[],appendChild(n){this.children.push(n);},removeChild(n){this.children.splice(this.children.indexOf(n),1);}};
 function node(tag){return {tag,children:[],style:{},setAttribute(){},appendChild(n){this.children.push(n);},focus(){doc.activeElement=this;},select(){}};}
 const doc={body,createElement:node,execCommand:()=>true};const c={document:doc};vm.createContext(c);vm.runInContext(fs.readFileSync('js/zip-preview.js','utf8'),c);
 let yes=0,no=0;const open=files=>c.ZipPreview.open('a.zip',files,false,()=>yes++,()=>no++);
 const files=[{name:'nafin/a.html'}];open(files);assert.equal(yes,0);
 let buttons=body.children[0].children[0].children.filter(x=>x.tag==='button');buttons[1].onclick();assert.equal(no,1);assert.equal(yes,0);
 open(files);buttons=body.children[0].children[0].children.filter(x=>x.tag==='button');buttons[0].onclick();buttons[0].onclick();assert.equal(yes,1);
 open(files);body.children[0].onkeydown({keyCode:27,preventDefault(){}});assert.equal(no,2);
 open(files.concat(files));buttons=body.children[0].children[0].children.filter(x=>x.tag==='button');assert.equal(buttons[0].disabled,true);buttons[0].onclick();assert.equal(yes,1);
});
