(function (global) {
  "use strict";
  var doc = global.document;
  var entries = [];
  var key = "kkk-operation-history:" + global.location.pathname;
  var latest = doc.getElementById("operation-latest");
  var list = doc.getElementById("operation-history-list");
  var panel = doc.getElementById("operation-history");
  var toggle = doc.getElementById("operation-history-toggle");
  var header = doc.getElementById("fixed-menu");
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function stamp(date) {
    var d = new Date(date.getTime() + 9 * 3600000);
    return d.getUTCFullYear() + "/" + pad(d.getUTCMonth() + 1) + "/" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
  }
  function resize() { doc.getElementById("menu-spacer").style.height = header.offsetHeight + "px"; }
  function render() {
    list.textContent = "";
    entries.forEach(function (entry) { var li = doc.createElement("li"); li.textContent = entry; list.appendChild(li); });
    latest.textContent = entries[0] || "操作結果はここに表示されます。";
    resize();
  }
  function record(text) {
    text = String(text || "").replace(/^\s+|\s+$/g, "");
    if (!text) { return; }
    var state = /失敗|エラー|できません|未保存|中止/.test(text) ? "要確認" : /完了|しました|出力しました/.test(text) ? "成功" : "状況";
    var db = doc.getElementById("database-input");
    var year = doc.getElementById("fiscal-year-input");
    entries.unshift(stamp(new Date()) + " [" + state + "] [" + (db ? db.value : "") + " " + (year ? year.value : "") + "] " + text);
    entries = entries.slice(0, 200);
    try { global.sessionStorage.setItem(key, JSON.stringify(entries)); } catch (ignore) {}
    render();
  }
  try {
    var saved = JSON.parse(global.sessionStorage.getItem(key) || "[]");
    if (Array.isArray(saved)) { entries = saved.filter(function (item) { return typeof item === "string"; }).slice(0, 200); }
  } catch (ignore) {}
  function close() { panel.style.display = "none"; toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
  toggle.onclick = function () { var opened = panel.style.display === "none"; panel.style.display = opened ? "block" : "none"; toggle.setAttribute("aria-expanded", String(opened)); if (opened) { doc.getElementById("operation-history-close").focus(); } };
  doc.getElementById("operation-history-close").onclick = close;
  doc.getElementById("operation-history-clear").onclick = function () { entries = []; try { global.sessionStorage.removeItem(key); } catch (ignore) {} render(); };
  if (global.MutationObserver) {
    ["form-message", "import-message", "zip-message", "admin-message", "data-status", "save-progress-message", "error-notice"].forEach(function (id) {
      var node = doc.getElementById(id);
      if (node) { new global.MutationObserver(function () { record(node.textContent); }).observe(node, {childList:true, characterData:true, subtree:true}); }
    });
    new global.MutationObserver(resize).observe(header, {childList:true, subtree:true, attributes:true, attributeFilter:["class"]});
  }
  global.addEventListener("resize", resize);
  global.addEventListener("load", resize);
  global.OperationHistory = {record:record, stamp:stamp};
  render();
}(this));
