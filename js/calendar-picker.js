(function (global) {
  "use strict";
  function open(value, selected) {
    var doc = global.document, previous = doc.activeElement;
    var year = value.getFullYear(), month = value.getMonth();
    var overlay = doc.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:100002;display:flex;align-items:center;justify-content:center";
    var box = doc.createElement("section");
    box.style.cssText = "box-sizing:border-box;background:white;color:#222;padding:12px;width:300px;max-width:calc(100% - 24px);max-height:90vh;overflow-y:auto;border-radius:6px;font-size:14px";
    box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true"); box.setAttribute("aria-label","入札日を選択");
    function close() { doc.body.removeChild(overlay); if (previous && previous.focus) { previous.focus(); } }
    function button(text, fn, parent) {
      var b=doc.createElement("button"); b.style.cssText="box-sizing:border-box;min-width:0;max-width:100%;height:30px;margin:0;padding:3px 8px;font:inherit;line-height:22px;cursor:pointer"; b.type="button"; b.textContent=text; b.onclick=fn; (parent || box).appendChild(b); return b;
    }
    function render() {
      box.innerHTML="";
      var heading=doc.createElement("h2"); heading.style.cssText="display:block;margin:0 0 8px;font-size:17px;line-height:24px"; heading.textContent=year+"年 "+(month+1)+"月"; box.appendChild(heading);
      button("前月",function(){month-=1;if(month<0){month=11;year-=1;}render();});
      button("翌月",function(){month+=1;if(month>11){month=0;year+=1;}render();});
      var table=doc.createElement("table"); table.style.cssText="width:100%;min-width:0;max-width:100%;table-layout:fixed;border-collapse:collapse;margin:8px 0;text-align:center";
      var header=doc.createElement("tr");
      ["日","月","火","水","木","金","土"].forEach(function(day){var th=doc.createElement("th");th.style.cssText="box-sizing:border-box;width:14.2857%;padding:4px 0;text-align:center;vertical-align:middle;font-size:13px;line-height:20px";th.textContent=day;header.appendChild(th);});
      table.appendChild(header);
      var first=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate(), row;
      for(var cell=0;cell<Math.ceil((first+days)/7)*7;cell+=1){
        if(cell%7===0){row=doc.createElement("tr");table.appendChild(row);}
        var td=doc.createElement("td"),day=cell-first+1;td.style.cssText="box-sizing:border-box;width:14.2857%;height:34px;padding:2px;text-align:center;vertical-align:middle";row.appendChild(td);
        if(day>0 && day<=days){(function(d){button(String(d),function(){var date=new Date(year,month,d,12);close();selected(date);},td);}(day));}
      }
      box.appendChild(table);button("キャンセル",close);
      box.getElementsByTagName("button")[0].focus();
    }
    overlay.onkeydown=function(event){
      if(event.keyCode===27){event.preventDefault();close();}
      if(event.keyCode===9){
        var buttons=box.getElementsByTagName("button"), first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    overlay.appendChild(box);doc.body.appendChild(overlay);render();
  }
  global.CalendarPicker={open:open};
}(this));
