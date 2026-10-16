(function (global) {
  "use strict";

  var FIELD_MAP = {
    "Id": "Id",
    "ID": "Id",
    "AuthorId": "AuthorId",
    "Created": "Created",
    "EditorId": "EditorId",
    "Editor/Title": "Editor/Title",
    "Modified": "Modified",
    "ListKind": "listkind",
    "PublicState": "publicstate",
    "VerifiedAt": "verifiedat",
    "FiscalYear": "fiscalyear",
    "WorkType": "worktype",
    "SourceAnnouncementID": "sourceannouncementid",
    "WorkflowKey": "workflowkey",
    "ResultSubmittedById": "resultsubmittedbyid",
    "ResultSubmittedByName": "resultsubmittedbyname",
    "ResultSubmittedAt": "resultsubmittedat",
    "Author/Title": "Author/Title",
    "Title": "key",
    "Type": "type",
    "Text": "text",
    "URL": "url",
    "Sort": "sortorder",
    "Status": "status",
    "OperationDate": "operationdate",
    "Category": "category",
    "Garrison": "garrison",
    "BidDate": "biddate",
    "HideBidDate": "hidebiddate",
    "Remarks": "remarks",
    "KokokuID": "kokokuid",
    "FileName": "filename"
  };
  var etags = {};
  var SP = { webRoot: "", api: "", digest: "", digestExpire: 0, entityTypes: {}, fieldSchemas: {} };

  function escapeTitle(value) {
    return String(value).replace(/'/g, "''");
  }

  function request(method, url, headers, body, success, error, allowNotFound) {
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
        if (global.Diagnostics && !(allowNotFound && xhr.status === 404)) {
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
    etags = {};
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

  SP.getCurrentUser = function (success, error) {
    request("GET", SP.api + "/web/currentuser?$select=Id,Title,IsSiteAdmin", { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
      var user;
      try { user = JSON.parse(xhr.responseText).d; } catch (exception) { error(xhr); return; }
      if (!user || !user.Id) { error(xhr); return; }
      success({ id: String(user.Id), name: user.Title || "", isAdmin: user.IsSiteAdmin === true });
    }, error);
  };

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
      if (columns[i] === "HideBidDate" && !currentSchema.byName.hidebiddate) { continue; }
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
    if (item.Author && item.Author.Title) { item.AuthorName = item.Author.Title; }
    if (item.Editor && item.Editor.Title) { item.EditorName = item.Editor.Title; }
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
      var items = [];
      if (selected.length) {
        url += "&$select=" + encodeURIComponent(selected.join(","));
      }
      var expanded = [];
      if (selected.indexOf("Author/Title") >= 0) { expanded.push("Author"); }
      if (selected.indexOf("Editor/Title") >= 0) { expanded.push("Editor"); }
      if (expanded.length) { url += "&$expand=" + expanded.join(","); }
      function loadPage(pageUrl) {
        request("GET", pageUrl, { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
        var page;
        var i;
        try {
          page = JSON.parse(xhr.responseText).d;
          for (i = 0; i < (page.results || []).length; i += 1) { items.push(normalize(page.results[i], currentSchema)); if (page.results[i].__metadata) { etags[listName + ":" + page.results[i].Id] = page.results[i].__metadata.etag; } }
        } catch (exception) {
          if (global.Diagnostics) {
            global.Diagnostics.error("SHAREPOINT", "リストデータの応答を解析できませんでした。", "List=" + listName + " / " + (exception && exception.message ? exception.message : exception));
          }
          error(xhr);
          return;
        }
        if (page.__next) { loadPage(page.__next); } else { success(items); }
        }, error);
      }
      loadPage(url);
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
          for (key in data) {
            if (!data.hasOwnProperty(key)) { continue; }
            if (key === "HideBidDate" && !currentSchema.byName.hidebiddate) {
              if (/^(1|true)$/i.test(String(data[key] || ""))) {
                if (error) { error({status:400, responseText:"リスト " + listName + " に hidebiddate（1行テキスト）列を追加して再読み込みしてください。入札日の非表示設定を保存できません。"}); }
                return;
              }
              continue;
            }
            body[fieldName(key, currentSchema)] = data[key];
          }
          request("POST", SP.api + "/web/lists/getbytitle('" + title + "')/items", { "Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest }, JSON.stringify(body), function (xhr) {
            var result;
            try {
              result = JSON.parse(xhr.responseText).d;
              normalize(result, currentSchema);
              if (result.__metadata) { etags[listName + ":" + result.Id] = result.__metadata.etag; }
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

  function guardedWrite(listName, itemId, url, headers, body, success, error) {
    var key = listName + ":" + itemId, tag = etags[key];
    if (!tag) { if (error) { error({ status: 409, responseText: "競合確認情報がありません。再読込してください。" }); } return; }
    headers["IF-MATCH"] = tag;
    request("POST", url, headers, body, function (xhr) {
      // Never fetch a newer version after writing: that could silently accept another user's edit.
      var nextTag = xhr.getResponseHeader ? xhr.getResponseHeader("ETag") : null;
      if (nextTag) { etags[key] = nextTag; }
      else { delete etags[key]; }
      if (success) { success(xhr); }
    }, error);
  }

  SP.update = function (listName, itemId, data, success, error) {
    schema(listName, function (currentSchema) {
      entityType(listName, function (type) {
        getDigest(function (digest) {
          var body = { "__metadata": { "type": type } };
          var key;
          var title = escapeTitle(listName);
          for (key in data) {
            if (!data.hasOwnProperty(key)) { continue; }
            if (key === "HideBidDate" && !currentSchema.byName.hidebiddate) {
              if (/^(1|true)$/i.test(String(data[key] || ""))) {
                if (error) { error({status:400, responseText:"リスト " + listName + " に hidebiddate（1行テキスト）列を追加して再読み込みしてください。入札日の非表示設定を保存できません。"}); }
                return;
              }
              continue;
            }
            body[fieldName(key, currentSchema)] = data[key];
          }
          guardedWrite(listName, itemId, SP.api + "/web/lists/getbytitle('" + title + "')/items(" + itemId + ")", { "Accept": "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest, "X-HTTP-Method": "MERGE", "IF-MATCH": "*" }, JSON.stringify(body), success, error);
        }, error);
      }, error);
    }, error);
  };

  SP.remove = function (listName, itemId, success, error) {
    getDigest(function (digest) {
      var title = escapeTitle(listName);
      guardedWrite(listName, itemId, SP.api + "/web/lists/getbytitle('" + title + "')/items(" + itemId + ")", { "Accept": "application/json;odata=verbose", "X-RequestDigest": digest, "X-HTTP-Method": "DELETE", "IF-MATCH": "*" }, null, success, error);
    }, error);
  };

  SP.checkFolder = function (folderPath, success, error) {
    var folder = String(folderPath || "").replace(/^\s+|\s+$/g, "").replace(/'/g, "''");
    if (!folder) {
      if (error) { error({ status: 400, statusText: "PDF保存先が未設定です。" }); }
      return;
    }
    request("GET", SP.api + "/web/GetFolderByServerRelativeUrl('" + folder + "')?$select=ServerRelativeUrl,Exists", { "Accept": "application/json;odata=verbose" }, null, function (xhr) {
      var result = {};
      try { result = JSON.parse(xhr.responseText).d || {}; } catch (ignore) {}
      if (result.Exists === false) {
        if (error) { error({ status: 404, statusText: "PDF保存フォルダーが存在しません。", responseText: xhr.responseText }); }
        return;
      }
      if (success) { success(result, xhr); }
    }, error);
  };

  // Additional notices must never overwrite a PDF already in the library.
  SP.uploadNewFile = function (folderPath, fileName, file, success, error) {
    var base = String(fileName || ""), number = 1;
    function attempt() {
      var name = number === 1 ? base : base.replace(/\.pdf$/i, "_" + number + ".pdf");
      var url = SP.api + "/web/GetFolderByServerRelativeUrl('" + escapeTitle(folderPath) + "')/Files/getbyurl('" + escapeTitle(name) + "')?$select=Name";
      function next() {
        number += 1;
        if (number > 100) { if (error) { error({status:409, statusText:"同名PDFが多いため保存できません。品名を変更してください。"}); } return; }
        attempt();
      }
      request("GET", url, {"Accept":"application/json;odata=verbose", "Cache-Control":"no-cache"}, null, next, function (response) {
        if (response.status !== 404) { if (error) { error(response); } return; }
        SP.uploadFile(folderPath, name, file, function (result) {
          result.savedFileName = name;
          if (success) { success(result); }
        }, function (failure) {
          // Another user may have created the name after the existence check.
          if (!failure.uploaded && (failure.status === 409 || failure.status === 423 || /-2130575257/.test(failure.responseText || ""))) { next(); return; }
          if (error) { error(failure); }
        }, false);
      }, true);
    }
    attempt();
  };

  SP.uploadFile = function (folderPath, fileName, file, success, error, overwrite) {
    var rawFolder = String(folderPath || "").replace(/^\s+|\s+$/g, "");
    var rawName = String(fileName || (file && file.name) || "").replace(/^\s+|\s+$/g, "");
    if (!rawFolder) {
      if (error) { error({ status: 400, statusText: "PDF保存先が未設定です。" }); }
      return;
    }
    if (!file || !rawName) {
      if (error) { error({ status: 400, statusText: "PDFファイルまたはファイル名がありません。" }); }
      return;
    }
    if (!global.FileReader || !global.FileReader.prototype || !global.FileReader.prototype.readAsArrayBuffer) {
      if (error) { error({ status: 0, statusText: "このブラウザーではPDFを読み込めません。" }); }
      return;
    }
    getDigest(function (digest) {
      var folder = rawFolder.replace(/'/g, "''");
      var name = rawName.replace(/'/g, "''");
      var reader = new FileReader();
      reader.onload = function () {
        var fileApi = SP.api + "/web/GetFolderByServerRelativeUrl('" + folder + "')/Files/getbyurl('" + name + "')";
        var stateSequence = 0;
        function failed(stage, xhr, detail) {
          var message = "PDFはアップロード済みですが、" + stage + "に失敗しました。ファイル：" + rawName;
          if (global.Diagnostics) { global.Diagnostics.error("PDF-CHECKIN", message, rawFolder + "/" + rawName); }
          if (error) { error({uploaded: true, stage: "checkin", status: xhr ? xhr.status : undefined, statusText: message + " / " + (detail || (xhr && xhr.statusText) || "状態を確認できません"), responseText: xhr && xhr.responseText || ""}); }
        }
        function readJson(xhr) { var data = JSON.parse(xhr.responseText); return data.d || data; }
        function state(ready) {
          request("GET", fileApi + "?$select=CheckOutType&_=" + new Date().getTime() + "-" + (++stateSequence), {"Accept":"application/json;odata=verbose", "Cache-Control":"no-cache"}, null, function (xhr) {
            var value;
            try { value = readJson(xhr).CheckOutType; } catch (ignore) { failed("チェックアウト状態の確認", xhr); return; }
            if (value !== 0 && value !== 1 && value !== 2) { failed("チェックアウト状態の確認", xhr); return; }
            ready(value, xhr);
          }, function (xhr) { failed("チェックアウト状態の確認", xhr); });
        }
        request("POST", SP.api + "/web/GetFolderByServerRelativeUrl('" + folder + "')/Files/add(url='" + name + "',overwrite=" + (overwrite === false ? "false" : "true") + ")", { "Accept": "application/json;odata=verbose", "X-RequestDigest": digest, "Content-Type": "application/octet-stream" }, reader.result, function (uploaded) {
          state(function (checkout) {
            if (checkout === 2) { if (success) { success(uploaded); } return; }
            request("GET", fileApi + "/ListItemAllFields/ParentList?$select=EnableMinorVersions", {"Accept":"application/json;odata=verbose"}, null, function (xhr) {
              var minor;
              try { minor = readJson(xhr).EnableMinorVersions; } catch (ignore) { failed("バージョン設定の確認", xhr); return; }
              if (typeof minor !== "boolean") { failed("バージョン設定の確認", xhr); return; }
              request("POST", fileApi + "/CheckIn(comment='PDF upload',checkintype=" + (minor ? "0" : "1") + ")", {"Accept":"application/json;odata=verbose", "X-RequestDigest":digest}, null, function () {
                function verify(attempt) {
                  state(function (after, response) {
                    if (after !== 2) {
                      if (attempt < 4) { global.setTimeout(function () { verify(attempt + 1); }, attempt * 500); return; }
                      failed("チェックイン完了の確認", response, "CheckOutType=" + after + "（4回確認してもチェックアウト状態です）");
                      return;
                    }
                    if (global.Diagnostics) { global.Diagnostics.log("PDF-CHECKIN", "PDFをチェックインしました。", rawName); }
                    if (success) { success(uploaded); }
                  });
                }
                verify(1);
              }, function (failure) { failed("自動チェックイン", failure); });
            }, function (failure) { failed("バージョン設定の確認", failure); });
          });
        }, error);
      };
      reader.onerror = function () {
        if (global.Diagnostics) {
          global.Diagnostics.error("PDF", "PDFファイルを読み込めませんでした。", fileName || (file && file.name) || "");
        }
        if (error) { error({ status: 0, statusText: "PDFファイルを読み込めませんでした。" }); }
      };
      try {
        reader.readAsArrayBuffer(file);
      } catch (exception) {
        if (error) { error({ status: 0, statusText: exception && exception.message ? exception.message : "PDFファイルを読み込めませんでした。" }); }
      }
    }, error);
  };

  global.SP = SP;
}(this));


