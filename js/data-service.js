(function (global) {
  "use strict";

  var DataService = {};
  var currentConfig = null;
  var currentDatabase = null;
  var selectedMode = "";
  var selectedDatabase = "";

  var DATABASE_KEYS = ["KOKOKU", "KOUJI", "OP", "KOBO"];

  function hasDatabaseKey(key) {
    var i;
    for (i = 0; i < DATABASE_KEYS.length; i += 1) {
      if (DATABASE_KEYS[i] === key) {
        return true;
      }
    }
    return false;
  }

  function databaseConfig(config) {
    var key = selectedDatabase || String(config.DEFAULT_DATABASE || "KOKOKU").toUpperCase();
    var prefix;
    if (!hasDatabaseKey(key)) {
      key = "KOKOKU";
    }
    prefix = "DB_" + key + "_";
    return {
      key: key,
      name: config[prefix + "NAME"] || key,
      announcements: config[prefix + "CSV"] || "csv/kokoku.csv",
      publishedAnnouncements: config[prefix + "PUBLIC_CSV"] || "csv/kokoku_public.csv",
      links: config[prefix + "LINKS_CSV"] || "csv/links.csv",
      publishedLinks: config[prefix + "PUBLIC_LINKS_CSV"] || "csv/links_public.csv",
      settings: config[prefix + "SETTINGS_CSV"] || "csv/settings.csv",
      settingsList: config[prefix + "SETTINGS_LIST"] || config.SETTINGS_LIST,
      announcementList: config[prefix + "ANNOUNCEMENT_LIST"] || config.ANNOUNCEMENT_LIST,
      linkList: config[prefix + "LINK_LIST"] || config.LINK_LIST,
      pdfLibrary: config[prefix + "PDF_LIBRARY"] || config.PDF_LIBRARY
    };
  }

  function listName(kind) {
    var names = {
      settings: "SETTINGS_LIST",
      announcements: "ANNOUNCEMENT_LIST",
      links: "LINK_LIST"
    };
    if (currentDatabase) {
      if (kind === "settings") { return currentDatabase.settingsList; }
      if (kind === "announcements") { return currentDatabase.announcementList; }
      if (kind === "links") { return currentDatabase.linkList; }
    }
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
      if (selectedMode) {
        config.DATA_MODE = selectedMode;
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
      currentDatabase = databaseConfig(config);
      config.SETTINGS_LIST = currentDatabase.settingsList;
      config.ANNOUNCEMENT_LIST = currentDatabase.announcementList;
      config.LINK_LIST = currentDatabase.linkList;
      config.PDF_LIBRARY = currentDatabase.pdfLibrary;
      if (String(config.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
        loadSharePoint(config, function (data) {
          data.mode = "SHAREPOINT";
          data.database = currentDatabase.key;
          data.databaseName = currentDatabase.name;
          success(data);
        }, error);
      } else {
        CsvData.load(function (data) {
          data.mode = "CSV";
          data.database = currentDatabase.key;
          data.databaseName = currentDatabase.name;
          success(data);
        }, error, currentDatabase);
      }
    }, error);
  };

  DataService.setMode = function (mode) {
    mode = String(mode || "").toUpperCase();
    if (mode !== "CSV" && mode !== "SHAREPOINT") {
      return false;
    }
    selectedMode = mode;
    if (currentConfig) {
      currentConfig.DATA_MODE = mode;
    }
    return true;
  };

  DataService.getMode = function () {
    if (currentConfig && currentConfig.DATA_MODE) {
      return String(currentConfig.DATA_MODE).toUpperCase();
    }
    return selectedMode || "CSV";
  };

  DataService.setDatabase = function (database) {
    database = String(database || "").toUpperCase();
    if (!hasDatabaseKey(database)) {
      return false;
    }
    selectedDatabase = database;
    return true;
  };

  DataService.getDatabase = function () {
    if (currentDatabase && currentDatabase.key) {
      return currentDatabase.key;
    }
    return selectedDatabase || "KOKOKU";
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
    SP.uploadFile((currentDatabase && currentDatabase.pdfLibrary) || currentConfig.PDF_LIBRARY, fileName, file, success, error);
  };

  global.DataService = DataService;
}(this));
