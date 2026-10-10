(function (global) {
  "use strict";
  function tree(name, files) {
    var root = {children:[]};
    files.forEach(function (file) {
      var path = String(file.name || "");
      if (!path || /[\\\x00-\x1f:]/.test(path) || path.charAt(0) === "/") { throw new Error("不正なパス：" + path); }
      var parts = path.split("/");
      var node = root;
      parts.forEach(function (part, i) {
        if (!part || part === "." || part === "..") { throw new Error("不正なパス：" + path); }
        var last = i === parts.length - 1;
        var found = node.children.filter(function (child) { return child.name.toLowerCase() === part.toLowerCase(); })[0];
        if (found && (last || found.file)) { throw new Error("ファイル名の重複またはフォルダーとの衝突：" + path); }
        if (!found) { found = {name:part, file:last, children:[]}; node.children.push(found); }
        node = found;
      });
    });
    var lines = [name];
    function walk(node, prefix) {
      node.children.forEach(function (child, i) {
        var last = i === node.children.length - 1;
        lines.push(prefix + (last ? "└─ " : "├─ ") + child.name + (child.file ? "" : "/"));
        if (!child.file) { walk(child, prefix + (last ? "   " : "│  ")); }
      });
    }
    walk(root, ""); return lines.join("\n");
  }
  function open(name, files, full, yes, no) {
    var doc = global.document, previous = doc.activeElement;
    var overlay = doc.createElement("div");
    overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:100001;display:flex;align-items:center;justify-content:center;";
    var box = doc.createElement("section");
    box.style.cssText = "background:white;color:#17212b;padding:24px;width:90%;max-width:850px;max-height:90vh;overflow:auto;";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "ZIPの構造確認");
    var title = doc.createElement("h2"); title.textContent = "ZIPの構造確認"; box.appendChild(title);
    var summary = doc.createElement("p");
    summary.textContent = (full ? "全データZIP" : "更新分ZIP") + "：HTML 1件 ／ PDF " + (files.length - 1) + "件。HTMLは一覧全体、PDFは" + (full ? "出力対象全件" : "公開待ちの公告分") + "です。";
    box.appendChild(summary);
    var area = doc.createElement("textarea"); area.readOnly = true; area.setAttribute("aria-label", "ZIP内のディレクトリ構造");
    area.style.cssText = "width:100%;height:45vh;white-space:pre;overflow:auto;font-family:Consolas,Meiryo,monospace;";
    var valid = true;
    try { area.value = tree(name, files); } catch (error) { valid = false; area.value = error.message; }
    box.appendChild(area);
    var status = doc.createElement("p"); status.setAttribute("role", "status"); box.appendChild(status);
    var settled = false;
    function finish(callback) { if (settled) { return; } settled = true; doc.body.removeChild(overlay); if (previous && previous.focus) { previous.focus(); } callback(); }
    function button(text, callback) { var b = doc.createElement("button"); b.type = "button"; b.textContent = text; b.style.marginRight = "12px"; b.onclick = callback; box.appendChild(b); return b; }
    var ok = button("OK・ZIP作成", function () { if (valid) { finish(yes); } }); ok.disabled = !valid;
    var cancel = button("キャンセル", function () { finish(no); });
    var copy = button("構造図をコピー", function () {
      area.focus(); area.select();
      var copied = false;
      try { copied = global.clipboardData ? global.clipboardData.setData("Text", area.value) : doc.execCommand("copy"); } catch (ignore) {}
      status.textContent = copied ? "構造図をコピーしました。" : "選択した構造図をCtrl+Cでコピーしてください。";
    });
    overlay.onkeydown = function (event) {
      if (event.keyCode === 27) { event.preventDefault(); finish(no); }
      if (event.keyCode === 9) {
        if (event.shiftKey && doc.activeElement === area) { event.preventDefault(); copy.focus(); }
        else if (!event.shiftKey && doc.activeElement === copy) { event.preventDefault(); area.focus(); }
      }
    };
    overlay.appendChild(box); doc.body.appendChild(overlay); cancel.focus();
  }
  global.ZipPreview = {tree:tree, open:open};
}(this));
