(function (global) {
  "use strict";

  var FIELD_MAP = {
    "Id": "Id",
    "ID": "Id",
    "Title": "key",
    "ID": "Id",
    "Type": "type",
    "Text": "text",
    "URL": "url",
    "Sort": "sort",
    "Status": "status",
    "Category": "category",
    "Garrison": "garrison",
    "BidDate": "biddate",
    "Remarks": "remarks",
    "KokokuID": "kokokuid",
    "FileName": "filename"
  };
  var SP = { webRoot: "", api: "", digest: "", digestExpire: 0, entityTypes: {}, fieldSchemas: {} };

  function escapeTitle(value) {
    return String(value).replace(/'/g, "''");
  }

  function request(method, url, headers, body, success, error) {
    var xhr = new XMLHttpRequest();
    var key;
    xhr.open(method, url, true);
    if (headers) {
      for (key in headers) {
        if (headers.hasOwnProperty(key)) {
          xhr.setRequestHeader(key, headers[key]);
        }
      }
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (success) { success(xhr); }
      } else {
        if (global.Diagnostics) {
          global.Diagnostics.httpError("SHAREPOINT", method, url, xhr);
        }
        if (error) {
          error(xhr);
        }
      }
    };
    xhr.send(body || null);
  }

  function detectRoot() {
    var path = window.location.pathname;
    var marker = path.toLowerCase().indexOf("/doclib/");
    var last;
    if (marker >= 0) {
      return path.substring(0, marker);
    }
    last = path.lastIndexOf("/");
    return last > 0 ? path.substring(0, last) : "";
  }

  SP.init = function (webRoot) {
    var root = String(webRoot || "").replace(/^\s+|\s+$/g, "");
    if (!root || root.toUpperCase() === "AUTO") {
      root = detectRoot();
    }
    if (root.length > 1 && root.charAt(root.length - 1) === "/") {
      root = root.substring(0, root.length - 1);
    }
    SP.webRoot = root;
    SP.api = root + "/_api";
    SP.digest = "";
    SP.digestExpire = 0;
    SP.entityTypes = {};
    SP.fieldSchemas = {};
    if (global.Diagnostics) {
      global.Diagnostics.log("SHAREPOINT", "SharePoint APIルートを設定しました。", SP.api);
    }
    return root;
  };

  function getDigest(success, error) {
    if (SP.digest && SP.digestExpire > new Date().getTime()) {
      success(SP.digest);
      return;
    }
    request("POST", SP.api + "/contextinfo", { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
      var info;
      try {
        info = JSON.parse(xhr.responseText).d.GetContextWebInformation;
        SP.digest = info.FormDigestValue;
        SP.digestExpire = new Date().getTime() + ((info.FormDigestTimeoutSeconds - 30) * 1000);
        success(SP.digest);
      } catch (exception) {
        if (global.Diagnostics) {
          global.Diagnostics.error("SHAREPOINT", "contextinfo の応答を解析できませんでした。", exception && exception.message ? exception.message : exception);
        }
        error(xhr);
      }
    }, error);
  }

  function schema(listName, success, error) {
    var title = escapeTitle(listName);
    if (SP.fieldSchemas[listName]) {
      success(SP.fieldSchemas[listName]);
      return;
    }
    request("GET", SP.api + "/web/lists/getbytitle('" + title + "')/fields?$select=Title,InternalName,TypeAsString", { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
      var fields;
      var result = { byName: {} };
      var i;
      try {
        fields = JSON.parse(xhr.responseText).d.results || [];
        for (i = 0; i < fields.length; i += 1) {
          result.byName[String(fields[i].Title).toLowerCase()] = fields[i].InternalName;
          result.byName[String(fields[i].InternalName).toLowerCase()] = fields[i].InternalName;
        }
        SP.fieldSchemas[listName] = result;
        success(result);
      } catch (exception) {
        if (global.Diagnostics) {
          global.Diagnostics.error("SHAREPOINT", "リスト列情報の応答を解析できませんでした。", "List=" + listName + " / " + (exception && exception.message ? exception.message : exception));
        }
        error(xhr);
      }
    }, error);
  }

  function fieldName(logical, currentSchema) {
    var preferred = FIELD_MAP[logical] || String(logical).toLowerCase();
    return currentSchema.byName[preferred.toLowerCase()] || preferred;
  }

  function mapColumns(columns, currentSchema) {
    var result = [];
    var used = {};
    var i;
    var name;
    for (i = 0; i < columns.length; i += 1) {
      name = fieldName(columns[i], currentSchema);
      if (!used[name]) {
        used[name] = true;
        result.push(name);
      }
    }
    return result;
  }

  function normalize(item, currentSchema) {
    var logical;
    var internal;
    for (logical in FIELD_MAP) {
      if (FIELD_MAP.hasOwnProperty(logical)) {
        internal = fieldName(logical, currentSchema);
        if (typeof item[logical] === "undefined" && typeof item[internal] !== "undefined") {
          item[logical] = item[internal];
        }
      }
    }
    if (typeof item.Id === "undefined" && typeof item.ID !== "undefined") {
      item.Id = item.ID;
    }
    return item;
  }

  SP.load = function (listName, columns, success, error) {
    schema(listName, function (currentSchema) {
      var title = escapeTitle(listName);
      var selected = mapColumns(columns || [], currentSchema);
      var url = SP.api + "/web/lists/getbytitle('" + title + "')/items?$top=5000";
      var items;
      var i;
      if (selected.length) {
        url += "&$select=" + encodeURIComponent(selected.join(","));
      }
      request("GET", url, { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
        try {
          items = JSON.parse(xhr.responseText).d.results || [];
          for (i = 0; i < items.length; i += 1) { normalize(items[i], currentSchema); }
          success(items);
        } catch (exception) {
          if (global.Diagnostics) {
            global.Diagnostics.error("SHAREPOINT", "リストデータの応答を解析できませんでした。", "List=" + listName + " / " + (exception && exception.message ? exception.message : exception));
          }
          error(xhr);
        }
      }, error);
    }, error);
  };

  function entityType(listName, success, error) {
    var title = escapeTitle(listName);
    if (SP.entityTypes[listName]) { success(SP.entityTypes[listName]); return; }
    request("GET", SP.api + "/web/lists/getbytitle('" + title + "')?$select=ListItemEntityTypeFullName", { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
      try {
        SP.entityTypes[listName] = JSON.parse(xhr.responseText).d.ListItemEntityTypeFullName;
        success(SP.entityTypes[listName]);
      } catch (exception) {
        if (global.Diagnostics) {
          global.Diagnostics.error("SHAREPOINT", "リスト型情報の応答を解析できませんでした。", "List=" + listName + " / " + (exception && exception.message ? exception.message : exception));
        }
        error(xhr);
      }
    }, error);
  }

  SP.add = function (listName, data, success, error) {
    schema(listName, function (currentSchema) {
      entityType(listName, function (type) {
        getDigest(function (digest) {
          var body = { "__metadata": { "type": type } };
          var key;
          var title = escapeTitle(listName);
          for (key in data) { if (data.hasOwnProperty(key)) { body[fieldName(key, currentSchema)] = data[key]; } }
          request("POST", SP.api + "/web/lists/getbytitle('" + title + "')/items", { "Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest }, JSON.stringify(body), function (xhr) {
            var result;
            try {
              result = JSON.parse(xhr.responseText).d;
              normalize(result, currentSchema);
              success(result);
            } catch (exception) {
              if (global.Diagnostics) {
                global.Diagnostics.error("SHAREPOINT", "追加結果の応答を解析できませんでした。", "List=" + listName + " / " + (exception && exception.message ? exception.message : exception));
              }
              error(xhr);
            }
          }, error);
        }, error);
      }, error);
    }, error);
  };

  SP.update = function (listName, itemId, data, success, error) {
    schema(listName, function (currentSchema) {
      entityType(listName, function (type) {
        getDigest(function (digest) {
          var body = { "__metadata": { "type": type } };
          var key;
          var title = escapeTitle(listName);
          for (key in data) { if (data.hasOwnProperty(key)) { body[fieldName(key, currentSchema)] = data[key]; } }
          request("POST", SP.api + "/web/lists/getbytitle('" + title + "')/items(" + itemId + ")", { "Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest, "X-HTTP-Method": "MERGE", "IF-MATCH": "*" }, JSON.stringify(body), success, error);
        }, error);
      }, error);
    }, error);
  };

  SP.remove = function (listName, itemId, success, error) {
    getDigest(function (digest) {
      var title = escapeTitle(listName);
      request("POST", SP.api + "/web/lists/getbytitle('" + title + "')/items(" + itemId + ")", { "Accept": "application/json;odata=verbose", "X-RequestDigest": digest, "X-HTTP-Method": "DELETE", "IF-MATCH": "*" }, null, success, error);
    }, error);
  };

  SP.uploadFile = function (folderPath, fileName, file, success, error) {
    getDigest(function (digest) {
      var folder = String(folderPath || "").replace(/^\s+|\s+$/g, "").replace(/'/g, "''");
      var name = String(fileName || file.name || "").replace(/'/g, "''");
      var reader = new FileReader();
      reader.onload = function () {
        request("POST", SP.api + "/web/GetFolderByServerRelativeUrl('" + folder + "')/Files/add(url='" + name + "',overwrite=true)", { "Accept": "application/json;odata=verbose", "X-RequestDigest": digest, "Content-Type": "application/octet-stream" }, reader.result, success, error);
      };
      reader.onerror = function () {
        if (global.Diagnostics) {
          global.Diagnostics.error("PDF", "PDFファイルを読み込めませんでした。", fileName || (file && file.name) || "");
        }
        if (error) { error(); }
      };
      reader.readAsArrayBuffer(file);
    }, error);
  };

  global.SP = SP;
}(this));