/* 画面右上の診断コンソール。通常は閉じたまま、クリック時だけ表示する。 */
(function (global) {
  "use strict";

  var entries = [];
  var panel = null;
  var output = null;
  var toggleButton = null;
  var initialized = false;
  var previousOnError = global.onerror;
  var MAX_ENTRIES = 200;

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function timeText() {
    var date = new Date();
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function valueText(value) {
    if (value === undefined || value === null || value === "") {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (ignore) {
      return String(value);
    }
  }

  function lineText(entry) {
    var text = "[" + entry.time + "] " + entry.level + " / " + entry.source + "\r\n" + entry.message;
    if (entry.detail) {
      text += "\r\n" + entry.detail;
    }
    return text;
  }

  function render() {
    var errorCount = 0;
    var i;
    var row;
    if (!output) {
      return;
    }
    output.textContent = "";
    for (i = 0; i < entries.length; i += 1) {
      row = document.createElement("div");
      row.textContent = lineText(entries[i]);
      row.style.marginBottom = "16px";
      if (entries[i].level === "ERROR") {
        row.style.color = "#b42318";
        errorCount += 1;
      }
      output.appendChild(row);
    }
    if (!entries.length) { output.textContent = "現在、記録されたエラーはありません。"; }
    if (toggleButton) {
      toggleButton.innerHTML = errorCount ? "診断 " + errorCount : "診断";
      toggleButton.style.borderColor = errorCount ? "#a84b3d" : "#819096";
      toggleButton.style.color = errorCount ? "#a84b3d" : "#44545a";
    }
  }

  function add(level, source, message, detail) {
    entries.push({
      time: timeText(),
      level: level || "INFO",
      source: source || "APP",
      message: valueText(message) || "(メッセージなし)",
      detail: valueText(detail)
    });
    if (entries.length > MAX_ENTRIES) {
      entries.shift();
    }
    render();
  }

  function buttonStyle(button) {
    button.style.marginLeft = "5px";
    button.style.padding = "4px 8px";
    button.style.border = "1px solid #819096";
    button.style.borderRadius = "2px";
    button.style.background = "#ffffff";
    button.style.color = "#44545a";
    button.style.cursor = "pointer";
    button.style.font = "12px Meiryo, sans-serif";
  }

  function fileSizeText(size) {
    var value = Number(size);
    if (!isFinite(value) || value < 0) {
      return "不明";
    }
    if (value >= 1024 * 1024) {
      return (value / (1024 * 1024)).toFixed(2) + " MB";
    }
    if (value >= 1024) {
      return (value / 1024).toFixed(1) + " KB";
    }
    return value + " bytes";
  }

  function checkPdfFile(file, purpose) {
    var label = purpose || "PDF";
    var name;
    var valid = true;
    if (!global.FileReader || !global.FileReader.prototype || !global.FileReader.prototype.readAsArrayBuffer) {
      add("ERROR", "PDF-UPLOAD", label + "を読み込めないブラウザーです。", "FileReader.readAsArrayBuffer がありません。");
      valid = false;
    }
    if (!file) {
      add("ERROR", "PDF-UPLOAD", label + "が選択されていません。", "");
      return false;
    }
    name = String(file.name || "");
    if (!/\.pdf$/i.test(name)) {
      add("ERROR", "PDF-UPLOAD", label + "のファイル形式がPDFではありません。", name || "ファイル名なし");
      valid = false;
    }
    if (typeof file.size === "number" && file.size === 0) {
      add("ERROR", "PDF-UPLOAD", label + "のファイル容量が0 bytesです。", name);
      valid = false;
    }
    if (file.type && String(file.type).toLowerCase() !== "application/pdf") {
      add("WARN", "PDF-UPLOAD", label + "の種類情報がPDFと一致しません。拡張子と内容を確認してください。", "File=" + name + " / Type=" + file.type);
    }
    add(valid ? "INFO" : "ERROR", "PDF-UPLOAD", valid ? label + "の事前確認に合格しました。" : label + "は保存できません。", "File=" + (name || "不明") + " / Size=" + fileSizeText(file.size));
    return valid;
  }

  function createUi() {
    var header;
    var title;
    var copyButton;
    var clearButton;
    var pdfButton;
    var closeButton;
    if (initialized || !document.body) {
      return;
    }
    initialized = true;

    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.id = "diagnostics-toggle";
    toggleButton.innerHTML = "診断";
    toggleButton.title = "エラー診断を表示";
    buttonStyle(toggleButton);
    toggleButton.style.position = "fixed";
    toggleButton.style.top = "8px";
    toggleButton.style.right = "48px";
    toggleButton.style.zIndex = "2147483647";
    toggleButton.style.opacity = "0.72";
    toggleButton.style.fontSize = "10px";
    toggleButton.style.padding = "3px 6px";

    panel = document.createElement("div");
    panel.id = "diagnostics-panel";
    panel.style.display = "none";
    panel.style.position = "fixed";
    panel.style.top = "48px";
    panel.style.right = "8px";
    panel.style.zIndex = "2147483646";
    panel.style.width = "560px";
    panel.style.maxWidth = "92%";
    panel.style.height = "390px";
    panel.style.padding = "10px";
    panel.style.border = "1px solid #819096";
    panel.style.background = "#ffffff";
    panel.style.boxShadow = "0 4px 18px rgba(0,0,0,0.25)";
    panel.style.font = "12px Meiryo, sans-serif";
    panel.style.color = "#17212b";

    header = document.createElement("div");
    header.style.height = "32px";
    header.style.whiteSpace = "nowrap";

    title = document.createElement("strong");
    title.innerHTML = "エラー診断";
    title.style.display = "inline-block";
    title.style.marginRight = "8px";
    header.appendChild(title);

    copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.innerHTML = "コピー";
    buttonStyle(copyButton);
    copyButton.onclick = function () {
      var copyText = document.createElement("textarea");
      var lines = [];
      var i;
      for (i = 0; i < entries.length; i += 1) { lines.push(lineText(entries[i])); }
      copyText.value = lines.length ? lines.join("\r\n\r\n") : "現在、記録されたエラーはありません。";
      copyText.style.position = "fixed";
      copyText.style.opacity = "0";
      copyText.readOnly = true;
      panel.appendChild(copyText);
      copyText.focus();
      copyText.select();
      try {
        document.execCommand("copy");
      } catch (ignore) {}
      panel.removeChild(copyText);
      copyButton.focus();
    };
    header.appendChild(copyButton);

    clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.innerHTML = "クリア";
    buttonStyle(clearButton);
    clearButton.onclick = function () {
      entries = [];
      render();
    };
    header.appendChild(clearButton);

    pdfButton = document.createElement("button");
    pdfButton.type = "button";
    pdfButton.innerHTML = "PDF保存診断";
    pdfButton.title = "公告・結果PDFの保存環境を確認";
    buttonStyle(pdfButton);
    pdfButton.onclick = function () {
      add("INFO", "PDF-UPLOAD", "PDF保存診断を開始しました。", "");
      if (!global.FileReader || !global.FileReader.prototype || !global.FileReader.prototype.readAsArrayBuffer) {
        add("ERROR", "PDF-UPLOAD", "このブラウザーではPDFを読み込めません。", "FileReader.readAsArrayBuffer がありません。");
      } else {
        add("INFO", "PDF-UPLOAD", "ブラウザーのPDF読込機能を確認しました。", "FileReader.readAsArrayBuffer");
      }
      if (global.DataService && global.DataService.runPdfUploadDiagnostics) {
        global.DataService.runPdfUploadDiagnostics();
      } else {
        add("ERROR", "PDF-UPLOAD", "PDF保存設定を確認できません。", "DataService が読み込まれていません。");
      }
    };
    header.appendChild(pdfButton);

    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.innerHTML = "閉じる";
    buttonStyle(closeButton);
    closeButton.onclick = function () {
      panel.style.display = "none";
    };
    header.appendChild(closeButton);

    output = document.createElement("div");
    output.tabIndex = 0;
    output.setAttribute("role", "region");
    output.setAttribute("aria-label", "エラー診断内容");
    output.style.display = "block";
    output.style.width = "100%";
    output.style.height = "340px";
    output.style.padding = "8px";
    output.style.boxSizing = "border-box";
    output.style.border = "1px solid #c6d0d2";
    output.style.background = "#f7f9f9";
    output.style.color = "#17212b";
    output.style.font = "12px Consolas, Meiryo, monospace";
    output.style.whiteSpace = "pre-wrap";
    output.style.overflowWrap = "break-word";
    output.style.overflow = "auto";

    panel.appendChild(header);
    panel.appendChild(output);
    document.body.appendChild(toggleButton);
    document.body.appendChild(panel);

    toggleButton.onclick = function () {
      panel.style.display = panel.style.display === "none" ? "block" : "none";
      if (panel.style.display === "block") {
        render();
      }
    };
    render();
  }

  function resourceError(event) {
    var target = event && (event.target || event.srcElement);
    var url;
    var tag;
    if (!target || target === global) {
      return;
    }
    tag = String(target.tagName || "RESOURCE").toUpperCase();
    url = target.src || target.href || "";
    if (url) {
      add("ERROR", "RESOURCE", tag + " の読み込みに失敗しました。", url);
    }
  }

  function checkDependencies() {
    var required = ["CsvData", "SP", "DataService", "HtmlExport", "HtmlImport", "ZipExport", "FilenameGenerator"];
    var optional = ["kuromoji"];
    var missing = [];
    var i;
    for (i = 0; i < required.length; i += 1) {
      if (!global[required[i]]) {
        missing.push(required[i]);
      }
    }
    if (missing.length) {
      add("ERROR", "STARTUP", "必要なJavaScriptが読み込まれていません。", missing.join(", "));
    } else {
      add("INFO", "STARTUP", "主要JavaScriptの読み込みを確認しました。", global.location ? global.location.href : "");
    }
    for (i = 0; i < optional.length; i += 1) {
      if (!global[optional[i]]) {
        add("WARN", "STARTUP", optional[i] + " が見つかりません。PDF名自動生成に影響する可能性があります。", "");
      }
    }
  }

  global.Diagnostics = {
    log: function (source, message, detail) { add("INFO", source, message, detail); },
    warn: function (source, message, detail) { add("WARN", source, message, detail); },
    error: function (source, message, detail) { add("ERROR", source, message, detail); },
    checkPdfFile: checkPdfFile,
    httpError: function (source, method, url, request) {
      var status = request && typeof request.status !== "undefined" ? request.status : "?";
      var statusText = request && request.statusText ? request.statusText : "";
      var detail = method + " " + url + "\r\nHTTP " + status + (statusText ? " " + statusText : "");
      if (String(status) === "0") {
        detail += "\r\n状態0: URL、Webサーバ設定、アクセス権、CORS、file://起動を確認してください。";
      }
      add("ERROR", source, "通信またはファイル読み込みに失敗しました。", detail);
    }
  };

  global.onerror = function (message, source, line, column, error) {
    var detail = (source || "") + (line ? ":" + line : "") + (column ? ":" + column : "");
    if (error && error.stack) {
      detail += "\r\n" + error.stack;
    }
    add("ERROR", "JAVASCRIPT", message || "JavaScriptエラー", detail);
    if (typeof previousOnError === "function") {
      return previousOnError.apply(global, arguments);
    }
    return false;
  };

  if (global.addEventListener) {
    global.addEventListener("error", resourceError, true);
    global.addEventListener("load", checkDependencies, false);
    global.addEventListener("unhandledrejection", function (event) {
      var reason = event && event.reason;
      add("ERROR", "PROMISE", "未処理のPromiseエラー", reason && (reason.stack || reason.message) ? (reason.stack || reason.message) : reason);
    }, false);
  } else if (global.attachEvent) {
    global.attachEvent("onload", checkDependencies);
  }

  if (document.readyState === "loading") {
    if (document.addEventListener) {
      document.addEventListener("DOMContentLoaded", createUi, false);
    } else {
      global.attachEvent("onload", createUi);
    }
  } else {
    createUi();
  }

  add("INFO", "DIAGNOSTICS", "診断機能を開始しました。", global.location ? global.location.href : "");
}(this));

/* CSVデータを読み込むデータアクセス層。SharePoint対応時も画面側のAPIを維持する。 */
(function (global) {
  "use strict";

  var CsvData = {};

  CsvData.load = function (success, error, paths) {
    paths = paths || {};
    var requests = {
      announcements: paths.announcements || "csv/kokoku.csv",
      links: paths.links || "csv/links.csv",
      publishedAnnouncements: paths.publishedAnnouncements || "csv/kokoku_public.csv",
      publishedLinks: paths.publishedLinks || "csv/links_public.csv",
      settings: paths.settings || "csv/settings.csv"
    };
    var result = {};
    var remaining = Object.keys(requests).length;
    var failed = false;
    var key;

    if (global.Diagnostics) {
      global.Diagnostics.log("CSV", "CSVデータの読み込みを開始しました。", "");
    }

    function loaded(name, rows) {
      result[name] = rows;
      remaining -= 1;
      if (remaining === 0 && !failed) {
        if (global.Diagnostics) {
          global.Diagnostics.log("CSV", "CSVデータの読み込みが完了しました。", "5ファイル");
        }
        success(result);
      }
    }

    function failedLoad(request) {
      if (!failed) {
        failed = true;
        error(request);
      }
    }

    for (key in requests) {
      if (requests.hasOwnProperty(key)) {
        CsvData.loadFile(requests[key], loaded.bind(null, key), failedLoad);
      }
    }
  };

  CsvData.loadFile = function (path, success, error) {
    var request = new XMLHttpRequest();
    request.open("GET", path, true);
    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        success(CsvData.parse(request.responseText));
      } else {
        if (global.Diagnostics) {
          global.Diagnostics.httpError("CSV", "GET", path, request);
        }
        error(request);
      }
    };
    request.send(null);
  };

  CsvData.parse = function (text) {
    text = String(text || "").replace(/^\ufeff/, "");
    var rows = [];
    var row = [];
    var value = "";
    var quoted = false;
    var i;
    var character;
    var next;

    for (i = 0; i < text.length; i += 1) {
      character = text.charAt(i);
      next = text.charAt(i + 1);
      if (character === '"' && quoted && next === '"') {
        value += '"';
        i += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((character === "\r" || character === "\n") && !quoted) {
        if (character === "\r" && next === "\n") {
          i += 1;
        }
        row.push(value);
        if (row.length > 1 || row[0] !== "") {
          rows.push(row);
        }
        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    if (value !== "" || row.length > 0) {
      row.push(value);
      rows.push(row);
    }

    return CsvData.toObjects(rows);
  };

  CsvData.toObjects = function (rows) {
    var objects = [];
    var headers = rows.length ? rows[0] : [];
    var i;
    var j;
    var object;

    for (i = 1; i < rows.length; i += 1) {
      object = {};
      for (j = 0; j < headers.length; j += 1) {
        object[headers[j]] = rows[i][j] || "";
      }
      objects.push(object);
    }
    return objects;
  };

  CsvData.toCsv = function (objects, columns) {
    var lines = [columns.join(",")];
    var i;
    var j;
    var values;
    for (i = 0; i < objects.length; i += 1) {
      values = [];
      for (j = 0; j < columns.length; j += 1) {
        values.push(CsvData.escapeValue(objects[i][columns[j]]));
      }
      lines.push(values.join(","));
    }
    return "\ufeff" + lines.join("\r\n") + "\r\n";
  };

  CsvData.escapeValue = function (value) {
    var text = String(value === undefined || value === null ? "" : value);
    if (text.indexOf(",") >= 0 || text.indexOf('"') >= 0 || text.indexOf("\r") >= 0 || text.indexOf("\n") >= 0) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  };

  global.CsvData = CsvData;
}(this));
