(function (global) {
  "use strict";
  var panel, message, lastMessage = "";

  function notify(text) {
    if (!panel || text === lastMessage && !panel.hidden) { return; }
    lastMessage = text;
    message.textContent = text;
    panel.hidden = false;
    panel.style.display = "block";
  }

  function checkCapabilities() {
    var missing = [];
    if (!global.XMLHttpRequest) { missing.push("データの読込・SharePoint接続"); }
    if (!global.JSON || !global.JSON.parse || !global.JSON.stringify) { missing.push("データ処理"); }
    if (!global.FileReader || !global.FileReader.prototype.readAsArrayBuffer) { missing.push("PDF読込・ZIP作成"); }
    if (!global.Blob || !global.Uint8Array) { missing.push("CSV・HTML・ZIP出力"); }
    if (!global.DOMParser || !document.implementation || !document.implementation.createHTMLDocument) { missing.push("HTML取込・公開リンク処理"); }
    var anchor = document.createElement("a");
    if (!global.navigator.msSaveBlob && (!("download" in anchor) || !global.URL || !global.URL.createObjectURL)) { missing.push("ファイルのダウンロード"); }
    if (missing.length) {
      notify("このブラウザー環境では、次の機能を利用できません：" + missing.join("、") + "。担当者へこの表示内容とブラウザーのバージョンをお知らせください。");
    }
    // date input and showPicker are optional: the app supplies a text-input fallback.
    return missing;
  }

  panel = document.createElement("div");
  panel.id = "error-notice";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-live", "assertive");
  panel.hidden = true;
  panel.style.cssText = "display:none;position:fixed;top:8px;left:2%;width:96%;box-sizing:border-box;z-index:10000;background:#fff2f2;color:#801b1b;border:2px solid #b42318;padding:12px 16px;font-size:16px;max-height:45%;overflow:auto;";
  var title = document.createElement("strong");
  title.textContent = "エラー通知";
  panel.appendChild(title);
  message = document.createElement("p");
  panel.appendChild(message);
  var close = document.createElement("button");
  close.type = "button";
  close.textContent = "通知を閉じる";
  close.onclick = function () { panel.hidden = true; panel.style.display = "none"; };
  panel.appendChild(close);
  document.body.appendChild(panel);

  global.addEventListener("error", function (event) {
    if (event.target && event.target !== global) {
      if (String(event.target.tagName).toUpperCase() === "SCRIPT") {
        notify("必要なプログラムを読み込めませんでした。通信状態を確認し、再読込してください。解消しない場合は担当者へお知らせください。");
      }
      return;
    }
    notify("画面の処理中にエラーが発生しました。操作が完了していない可能性があります。未保存の内容を確認し、担当者へ操作内容とブラウザーのバージョンをお知らせください。");
  }, true);
  global.addEventListener("unhandledrejection", function () {
    notify("操作中の処理に失敗しました。保存状態を確認し、担当者へ操作内容とブラウザーのバージョンをお知らせください。");
  });
  global.ErrorNotice = { notify: notify, checkCapabilities: checkCapabilities };
  checkCapabilities();
}(this));
