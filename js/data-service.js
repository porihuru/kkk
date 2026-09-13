(function (global) {
  "use strict";

  var DataService = {};
  var currentConfig = null;
  var currentDatabase = null;
  var selectedMode = "";
  var selectedDatabase = "";
  var currentUser = null;

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
    var remaining = 4;
    var failed = false;
    var lists = [
      { key: "settings", name: config.SETTINGS_LIST, columns: ["Id", "Type", "Text", "URL", "Sort"] },
      { key: "announcements", name: config.ANNOUNCEMENT_LIST, columns: ["Id", "AuthorId", "Author/Title", "Created", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate", "ListKind", "PublicState", "TargetID", "RequestType", "RequestStatus", "ResultURL", "ResultName", "VerifiedAt"] },
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
    SP.getCurrentUser(function (user) { loaded("currentUser", user); }, fail);
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
    currentUser = null;
    readConfig(function (config) {
      currentDatabase = databaseConfig(config);
      config.SETTINGS_LIST = currentDatabase.settingsList;
      config.ANNOUNCEMENT_LIST = currentDatabase.announcementList;
      config.LINK_LIST = currentDatabase.linkList;
      config.PDF_LIBRARY = currentDatabase.pdfLibrary;
      if (String(config.DATA_MODE || "CSV").toUpperCase() === "SHAREPOINT") {
        loadSharePoint(config, function (data) {
          currentUser = data.currentUser;
          data.publishedAnnouncements = data.announcements.filter(function (item) { return item.ListKind === "published"; });
          data.announcements = data.announcements.filter(function (item) { return item.ListKind !== "published"; });
          var publicIds = data.publishedAnnouncements.map(function (item) { return String(item.ID); });
          data.publishedLinks = data.links.filter(function (link) { return publicIds.indexOf(String(link.KokokuID)) >= 0; });
          data.links = data.links.filter(function (link) { return publicIds.indexOf(String(link.KokokuID)) < 0; });
          data.mode = "SHAREPOINT";
          data.database = currentDatabase.key;
          data.databaseName = currentDatabase.name;
          success(data);
        }, error);
      } else {
        CsvData.load(function (data) {
          currentUser = { id: String(config.CSV_USER_ID || "csv-user-1"), name: config.CSV_USER_NAME || "CSV開発ユーザー", isAdmin: false };
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

  DataService.getCurrentUser = function () {
    return currentUser ? { id: currentUser.id, name: currentUser.name, isAdmin: currentUser.isAdmin } : null;
  };

  DataService.canManageAnnouncement = function (item, kind, adminActive) {
    if (!currentUser || !item) { return false; }
    if (item.RequestStatus === "公開待ち" || item.RequestStatus === "反映確認済み" || item.RequestStatus === "公開済") { return false; }
    if (adminActive && (!DataService.isSharePoint() || currentUser.isAdmin)) { return true; }
    return kind === "planned" && String(item.AuthorId || "") !== "" && String(item.AuthorId) === currentUser.id;
  };

  DataService.getPublicationConfig = function () {
    return { endedUrl: (currentConfig || {}).ENDED_PDF_URL || "R8/4/keisai-syuuryou.pdf", pdfRoot: String((currentDatabase || {}).pdfLibrary || "nafin/R8/be").replace(/^nafin\//, "") };
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

  DataService.getCsvFileName = function (kind) {
    var paths = currentDatabase || databaseConfig(currentConfig || {});
    return String(paths[kind] || "").split(/[\\/]/).pop();
  };

  // IE11 has URL.createObjectURL, but does not support the URL constructor.
  function resolvePublicUrl(value, baseUrl) {
    var resolver = document.implementation.createHTMLDocument("");
    var base = resolver.createElement("base");
    var anchor = resolver.createElement("a");
    base.href = baseUrl;
    resolver.head.appendChild(base);
    anchor.href = value;
    resolver.body.appendChild(anchor);
    return /^https?:$/.test(anchor.protocol) ? anchor.href : "";
  }

  DataService.getPublicHtmlPath = function () {
    var config = currentConfig || {};
    var pages = { KOKOKU: "R8kokoku.html", KOUJI: "R8koukoku_kouji.html", OP: "R8open.html", KOBO: "R8koubo.html" };
    var key = DataService.getDatabase();
    return config["DB_" + key + "_PUBLIC_HTML"] || "nafin/" + pages[key];
  };

  DataService.getPublicHtmlFileName = function () {
    return DataService.getPublicHtmlPath().split("/").pop();
  };

  DataService.getPublicHtmlUrl = function () {
    var config = currentConfig || {};
    var site = config.PUBLIC_SITE_URL || "https://www.mod.go.jp/gsdf/nae/fin/";
    var page = DataService.getPublicHtmlPath();
    return resolvePublicUrl(page, site);
  };

  DataService.getPublicLinkUrl = function (value) {
    var link = String(value || "");
    var page = DataService.getPublicHtmlUrl();
    var site = (currentConfig || {}).PUBLIC_SITE_URL || "https://www.mod.go.jp/gsdf/nae/fin/";
    if (!link) { return ""; }
    try {
      // R8/... is relative to the published HTML; nafin/... is relative to the site.
      return resolvePublicUrl(link, link.indexOf("nafin/") === 0 ? site : page);
    } catch (error) {
      return "";
    }
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
