(function (global) {
  "use strict";

  var DataService = {};
  var currentConfig = null;

  function listName(kind) {
    var names = {
      settings: "SETTINGS_LIST",
      announcements: "ANNOUNCEMENT_LIST",
      links: "LINK_LIST"
    };
    return currentConfig[names[kind]];
  }

  function readConfig(success, error) {
    var request = new XMLHttpRequest();
    request.open("GET", "config/config.txt", true);
    request.onreadystatechange = function () {
      var config;
      var lines;
      var i;
      var separator;
      if (request.readyState !== 4) {
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        if (global.Diagnostics) {
          global.Diagnostics.httpError("CONFIG", "GET", "config/config.txt", request);
        }
        error(request);
        return;
      }
      config = {};
      lines = request.responseText.split(/\r?\n/);
      for (i = 0; i < lines.length; i += 1) {
        separator = lines[i].indexOf("=");
        if (separator > 0 && lines[i].charAt(0) !== "#") {
          config[lines[i].substring(0, separator).replace(/^\s+|\s+$/g, "")] = lines[i].substring(separator + 1).replace(/^\s+|\s+$/g, "");
        }
      }
      currentConfig = config;
      if (global.Diagnostics) {
        global.Diagnostics.log("CONFIG", "設定ファイルを読み込みました。", "DATA_MODE=" + String(config.DATA_MODE || "CSV") + " / WEB_ROOT=" + String(config.WEB_ROOT || ""));
      }
      success(config);
    };
    request.send(null);
  }

  function loadSharePoint(config, success, error) {
    var result = {};
    var remaining = 3;
    var failed = false;
    var lists = [
      { key: "settings", name: config.SETTINGS_LIST, columns: ["Id", "Type", "Text", "URL", "Sort"] },
      { key: "announcements", name: config.ANNOUNCEMENT_LIST, columns: ["Id", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"] },
      { key: "links", name: config.LINK_LIST, columns: ["Id", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"] }
    ];
    var i;
    function fail(request) {
      if (!failed) {
        failed = true;
        if (global.Diagnostics) {
          global.Diagnostics.error("SHAREPOINT", "SharePointデータの読み込みに失敗しました。", "設定したリスト名、WEB_ROOT、アクセス権を確認してください。");
        }
        error(request);
      }
    }
    function loaded(key, items) {
      result[key] = items;
      remaining -= 1;
      if (remaining === 0 && !failed) {
        if (global.Diagnostics) {
          global.Diagnostics.log("SHAREPOINT", "SharePointデータの読み込みが完了しました。", "settings=" + result.settings.length + " / announcements=" + result.announcements.length + " / links=" + result.links.length);
        }
        success(result);
      }
    }
    SP.init(config.WEB_ROOT);
    if (global.Diagnostics) {
      global.Diagnostics.log("SHAREPOINT", "SharePoint接続を開始しました。", "WEB_ROOT=" + String(config.WEB_ROOT || "AUTO"));
    }
    for (i = 0; i < lists.length; i += 1) {
      SP.load(lists[i].name, lists[i].columns, (function (list) {
        return function (items) { loaded(list.key, items); };
      }(lists[i])), fail);
    }
  }

  DataService.load = function (success, error) {
    readConfig(function (config) {
      if (String(config.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
        loadSharePoint(config, function (data) {
          data.mode = "SHAREPOINT";
          success(data);
        }, error);
      } else {
        CsvData.load(function (data) {
          data.mode = "CSV";
          success(data);
        }, error);
      }
    }, error);
  };

  DataService.add = function (kind, data, success, error) {
    if (String(currentConfig.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
      SP.add(listName(kind), data, success, error);
      return;
    }
    if (success) { success(data); }
  };

  DataService.update = function (kind, itemId, data, success, error) {
    if (String(currentConfig.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
      SP.update(listName(kind), itemId, data, success, error);
      return;
    }
    if (success) { success(data); }
  };

  DataService.remove = function (kind, itemId, success, error) {
    if (String(currentConfig.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
      SP.remove(listName(kind), itemId, success, error);
      return;
    }
    if (success) { success(); }
  };

  DataService.isSharePoint = function () {
    return currentConfig && String(currentConfig.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT";
  };

  DataService.uploadPdf = function (file, fileName, success, error) {
    if (!DataService.isSharePoint()) {
      if (success) { success(); }
      return;
    }
    SP.uploadFile(currentConfig.PDF_LIBRARY, fileName, file, success, error);
  };

  global.DataService = DataService;
}(this));