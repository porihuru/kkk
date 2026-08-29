(function (global) {
  "use strict";

  var allAnnouncements = [];
  var allLinks = [];
  var allSettings = [];
  var dateSortDescending = false;
  var selectedPdfFiles = {};
  var adminActive = false;
  var ADMIN_PASSWORD = "snk";

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function linksFor(announcementId) {
    var result = [];
    var i;
    for (i = 0; i < allLinks.length; i += 1) {
      if (allLinks[i].KokokuID === announcementId) {
        result.push(allLinks[i]);
      }
    }
    result.sort(function (left, right) {
      return parseInt(left.Sort, 10) - parseInt(right.Sort, 10);
    });
    return result;
  }

  function announcementById(announcementId) {
    var i;
    for (i = 0; i < allAnnouncements.length; i += 1) {
      if (allAnnouncements[i].ID === announcementId) {
        return allAnnouncements[i];
      }
    }
    return null;
  }

  function render(announcements) {
    var html = [];
    var i;
    var links;
    var j;
    var categoryClass;

    announcements.sort(function (left, right) {
      var leftDate = String(left.BidDate || "");
      var rightDate = String(right.BidDate || "");
      if (leftDate === rightDate) {
        return (parseInt(left.Sort, 10) || 0) - (parseInt(right.Sort, 10) || 0);
      }
      return dateSortDescending ? (leftDate < rightDate ? 1 : -1) : (leftDate > rightDate ? 1 : -1);
    });
    byId("record-count").innerHTML = announcements.length + "件";
    if (!announcements.length) {
      byId("announcement-list").innerHTML = '<tr><td colspan="6" class="empty-row">該当する公告はありません。</td></tr>';
      return;
    }

    for (i = 0; i < announcements.length; i += 1) {
      links = linksFor(announcements[i].ID);
      categoryClass = announcements[i].Category === "NEW" ? "category" : "category category-change";
      html.push("<tr>");
      html.push("<td><span class=\"" + categoryClass + "\">" + escapeHtml(announcements[i].Category) + "</span></td>");
      html.push("<td>" + escapeHtml(announcements[i].Garrison) + "</td>");
      html.push("<td><ul class=\"link-list\">");
      for (j = 0; j < links.length; j += 1) {
        html.push("<li><a href=\"" + escapeHtml(links[j].URL) + "\">" + escapeHtml(links[j].Text) + "</a></li>");
      }
      if (!links.length) {
        html.push("<li>（PDF未登録）</li>");
      }
      html.push("</ul></td>");
      html.push("<td>" + escapeHtml(announcements[i].BidDate) + "</td>");
      html.push("<td>" + escapeHtml(announcements[i].Remarks) + "</td>");
      html.push("<td class=\"actions\">");
      if (adminActive) {
        html.push("<button type=\"button\" class=\"button button-small edit-button\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">修正</button> <button type=\"button\" class=\"button button-small button-danger delete-button\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">削除</button>");
      } else {
        html.push("登録内容を確認中");
      }
      html.push("</td>");
      html.push("</tr>");
    }
    byId("announcement-list").innerHTML = html.join("");
    bindRowActions();
  }

  function bindRowActions() {
    var editButtons = document.getElementsByClassName("edit-button");
    var deleteButtons = document.getElementsByClassName("delete-button");
    var i;
    for (i = 0; i < editButtons.length; i += 1) {
      editButtons[i].onclick = beginEdit;
    }
    for (i = 0; i < deleteButtons.length; i += 1) {
      deleteButtons[i].onclick = deleteAnnouncement;
    }
  }

  function beginEdit() {
    var announcement = announcementById(this.getAttribute("data-id"));
    var links;
    if (!adminActive) {
      return;
    }
    if (!announcement) {
      return;
    }
    links = linksFor(announcement.ID);
    byId("announcement-id").value = announcement.ID;
    byId("category-input").value = announcement.Category;
    byId("garrison-input").value = announcement.Garrison;
    byId("date-input").value = announcement.BidDate;
    byId("status-input").value = announcement.Status || "下書き";
    byId("remarks-input").value = announcement.Remarks;
    byId("link-text-input").value = links.length ? links[0].Text : "";
    byId("link-url-input").value = links.length ? links[0].URL : "";
    byId("editor-title").innerHTML = "公告を修正";
    byId("cancel-edit").className = "button button-secondary";
    byId("form-message").innerHTML = "修正内容を入力して保存してください。";
    window.scrollTo(0, 0);
  }

  function clearForm() {
    byId("announcement-form").reset();
    byId("announcement-id").value = "";
    byId("editor-title").innerHTML = "公告を新規登録";
    byId("cancel-edit").className = "button button-secondary hidden";
    byId("form-message").innerHTML = "";
  }

  function nextId() {
    var max = 0;
    var i;
    for (i = 0; i < allAnnouncements.length; i += 1) {
      max = Math.max(max, parseInt(allAnnouncements[i].ID, 10) || 0);
    }
    return String(max + 1);
  }

  function nextLinkId() {
    var max = 0;
    var i;
    for (i = 0; i < allLinks.length; i += 1) {
      max = Math.max(max, parseInt(allLinks[i].ID, 10) || 0);
    }
    return String(max + 1);
  }

  function persistAnnouncement(announcement, link, isNew) {
    var payload = { Category: announcement.Category, Garrison: announcement.Garrison, BidDate: announcement.BidDate, Remarks: announcement.Remarks, Sort: announcement.Sort, Status: announcement.Status };
    var itemId = announcement.Id || announcement.ID;
    var selectedFile = byId("pdf-file-input").files.length ? byId("pdf-file-input").files[0] : null;
    if (!DataService.isSharePoint()) {
      return;
    }
    function saveLink(savedAnnouncement) {
      var savedId = savedAnnouncement && (savedAnnouncement.Id || savedAnnouncement.ID);
      var linkPayload = { KokokuID: savedId || announcement.ID, Text: link.Text, FileName: link.FileName, URL: link.URL, Type: link.Type, Sort: link.Sort };
      DataService.add("links", linkPayload, function () {
        byId("form-message").innerHTML = "SharePointへ公告とリンクを保存しました。";
      }, function () {
        byId("form-message").innerHTML = "公告は保存しましたが、リンクの保存に失敗しました。";
      });
    }
    if (selectedFile) {
      DataService.uploadPdf(selectedFile, selectedFile.name, function () {}, function () {
        byId("form-message").innerHTML = "公告は保存しましたが、PDFのアップロードに失敗しました。";
      });
    }
    if (isNew) {
      DataService.add("announcements", payload, saveLink, function () {
        byId("form-message").innerHTML = "SharePointへの公告保存に失敗しました。";
      });
    } else {
      DataService.update("announcements", itemId, payload, function () { saveLink(announcement); }, function () {
        byId("form-message").innerHTML = "SharePointへの公告更新に失敗しました。";
      });
    }
  }

  function saveAnnouncement(event) {
    var id = byId("announcement-id").value;
    var announcement = announcementById(id);
    var links;
    var isNew = !announcement;
    if (event) {
      event.preventDefault();
    }
    if (id && !adminActive) {
      byId("form-message").innerHTML = "登録者画面では既存公告を修正できません。";
      return false;
    }
    if (!byId("garrison-input").value || !byId("date-input").value || !byId("link-text-input").value || !byId("link-url-input").value) {
      byId("form-message").innerHTML = "駐屯地、入札日、PDF表示名、PDFリンクを入力してください。";
      return false;
    }
    if (!announcement) {
      id = nextId();
      announcement = { ID: id, Sort: String(allAnnouncements.length + 1), Status: "下書き" };
      allAnnouncements.push(announcement);
    }
    announcement.Category = byId("category-input").value;
    announcement.Garrison = byId("garrison-input").value;
    announcement.BidDate = byId("date-input").value;
    announcement.Status = adminActive ? byId("status-input").value : "公開待ち";
    announcement.Remarks = byId("remarks-input").value;
    links = linksFor(id);
    if (links.length) {
      links[0].Text = byId("link-text-input").value;
      links[0].URL = byId("link-url-input").value;
      if (byId("pdf-file-input").files.length) {
        selectedPdfFiles[links[0].ID] = byId("pdf-file-input").files[0];
      }
    } else {
      allLinks.push({ ID: nextLinkId(), KokokuID: id, Text: byId("link-text-input").value, FileName: "", URL: byId("link-url-input").value, Type: "公告", Sort: "1" });
      if (byId("pdf-file-input").files.length) {
        selectedPdfFiles[allLinks[allLinks.length - 1].ID] = byId("pdf-file-input").files[0];
      }
    }
    clearForm();
    filterAnnouncements();
    byId("form-message").innerHTML = DataService.isSharePoint() ? "SharePointへ保存しています..." : "公告を保存しました（CSVモードのメモリ上）。";
    persistAnnouncement(announcement, linksFor(id)[0], isNew);
    return false;
  }

  function deleteAnnouncement() {
    var id = this.getAttribute("data-id");
    var i;
    var announcement = announcementById(id);
    if (!adminActive) {
      return;
    }
    if (!window.confirm("この公告を削除しますか？")) {
      return;
    }
    for (i = allAnnouncements.length - 1; i >= 0; i -= 1) {
      if (allAnnouncements[i].ID === id) {
        allAnnouncements.splice(i, 1);
      }
    }
    for (i = allLinks.length - 1; i >= 0; i -= 1) {
      if (allLinks[i].KokokuID === id) {
        if (DataService.isSharePoint()) {
          DataService.remove("links", allLinks[i].Id || allLinks[i].ID, function () {}, function () {});
        }
        allLinks.splice(i, 1);
      }
    }
    if (DataService.isSharePoint() && announcement) {
      DataService.remove("announcements", announcement.Id || announcement.ID, function () {}, function () {
        byId("form-message").innerHTML = "画面から削除しましたが、SharePointの削除に失敗しました。";
      });
    }
    filterAnnouncements();
  }

  function filterAnnouncements() {
    var keyword = byId("search-input").value.toLowerCase();
    var filtered = [];
    var i;
    var text;
    for (i = 0; i < allAnnouncements.length; i += 1) {
      text = [allAnnouncements[i].Category, allAnnouncements[i].Garrison, allAnnouncements[i].BidDate, allAnnouncements[i].Remarks].join(" ").toLowerCase();
      if (text.indexOf(keyword) >= 0) {
        filtered.push(allAnnouncements[i]);
      }
    }
    render(filtered);
  }

  function showError() {
    byId("data-status").innerHTML = "接続失敗。データを表示できませんが、アプリは継続しています。";
    byId("announcement-list").innerHTML = '<tr><td colspan="6" class="empty-row">データを表示できません。</td></tr>';
  }

  function setHidden(element, hidden) {
    var classes = String(element.className || "").replace(/^\s+|\s+$/g, "");
    var hasHidden = (" " + classes + " ").indexOf(" hidden ") >= 0;
    if (hidden && !hasHidden) {
      element.className = classes + " hidden";
    } else if (!hidden && hasHidden) {
      element.className = (" " + classes + " ").replace(/ hidden /g, " ").replace(/^\s+|\s+$/g, "");
    }
  }

  function setAdminVisibility(active) {
    var adminOnly = document.getElementsByClassName("admin-only");
    var controls = document.getElementsByClassName("admin-only-control");
    var i;
    for (i = 0; i < adminOnly.length; i += 1) {
      setHidden(adminOnly[i], !active);
    }
    for (i = 0; i < controls.length; i += 1) {
      setHidden(controls[i], !active);
    }
  }

  function activateAdmin() {
    if (byId("admin-password").value !== ADMIN_PASSWORD) {
      byId("admin-message").innerHTML = "パスワードが正しくありません。";
      return;
    }
    adminActive = true;
    byId("admin-password").value = "";
    byId("admin-message").innerHTML = "管理者機能を有効化しました。";
    byId("admin-login").className = "button hidden";
    byId("admin-logout").className = "button button-secondary";
    setAdminVisibility(true);
    filterAnnouncements();
  }

  function deactivateAdmin() {
    adminActive = false;
    clearForm();
    byId("admin-message").innerHTML = "管理者機能を無効化しました。";
    byId("admin-login").className = "button";
    byId("admin-logout").className = "button button-secondary hidden";
    setAdminVisibility(false);
    filterAnnouncements();
  }

  function downloadCsv(fileName, content) {
    var blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    var link;
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, fileName);
      return;
    }
    link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      window.URL.revokeObjectURL(link.href);
    }, 100);
  }

  function exportAnnouncements() {
    downloadCsv("kokoku.csv", CsvData.toCsv(allAnnouncements, ["ID", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status"]));
    byId("form-message").innerHTML = "公告CSVを出力しました。";
  }

  function exportLinks() {
    downloadCsv("links.csv", CsvData.toCsv(allLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "リンクCSVを出力しました。";
  }

  function exportSettings() {
    downloadCsv("settings.csv", CsvData.toCsv(allSettings, ["ID", "Type", "Text", "URL", "Sort"]));
    byId("form-message").innerHTML = "設定CSVを出力しました。";
  }

  function previewPage() {
    if (HtmlExport.openPreview(allAnnouncements, allLinks, allSettings)) {
      byId("form-message").innerHTML = "公開ページプレビューを開きました。";
    }
  }

  function exportHtml() {
    var html = HtmlExport.create(allAnnouncements, allLinks, allSettings);
    downloadBlob("R8kokoku.html", new Blob([html], { type: "text/html;charset=utf-8" }));
    byId("form-message").innerHTML = "R8kokoku.htmlを出力しました。";
  }

  function downloadBlob(fileName, blob) {
    var link;
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(blob, fileName);
      return;
    }
    link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function exportZip(fullData) {
    var files = [{ name: "nafin/R8kokoku.html", content: HtmlExport.create(allAnnouncements, allLinks, allSettings) }];
    var i;
    var link;
    var file;
    for (i = 0; i < allLinks.length; i += 1) {
      link = allLinks[i];
      file = selectedPdfFiles[link.ID];
      if (file) {
        files.push({ name: link.URL || "nafin/R8/be/" + file.name, file: file });
      }
    }
    ZipExport.create(files, function (blob) {
      downloadBlob(fullData ? "R8kokoku_full.zip" : "R8kokoku_update.zip", blob);
      byId("form-message").innerHTML = "ZIPを出力しました。選択済みPDF" + (files.length - 1) + "件。";
    });
  }

  function toggleDateSort() {
    dateSortDescending = !dateSortDescending;
    byId("sort-date").innerHTML = dateSortDescending ? "入札日 ▼" : "入札日 ▲";
    filterAnnouncements();
  }

  function replaceImportedData(data) {
    allAnnouncements = data.announcements;
    allLinks = data.links;
    allSettings = dateOnlySettings(data.settings || []);
    byId("data-status").innerHTML = "CSVモード / HTML取り込みデータ";
    clearForm();
    render(allAnnouncements);
    byId("import-message").innerHTML = "公告" + allAnnouncements.length + "件、PDFリンク" + allLinks.length + "件を取り込みました。";
    renderSettings();
  }

  function dateOnlySettings(settings) {
    var result = [];
    var i;
    for (i = 0; i < settings.length; i += 1) {
      if (settings[i].Type === "date") {
        result.push(settings[i]);
        break;
      }
    }
    if (result.length) {
      result[0].Sort = "1";
    }
    return result;
  }

  function renderSettings() {
    var html = [];
    if (!allSettings.length) {
      byId("import-settings").innerHTML = "<strong>基準日</strong> 未設定";
      byId("setting-date").value = "";
      return;
    }
    html.push("<strong>基準日</strong> " + escapeHtml(allSettings[0].Text));
    byId("import-settings").innerHTML = html.join("");
    byId("setting-date").value = allSettings[0].Text;
  }

  function addSetting() {
    var text = byId("setting-date").value;
    var editIndex = allSettings.length ? 0 : -1;
    var setting;
    if (!text) {
      byId("import-message").innerHTML = "基準日を入力してください。";
      return;
    }
    if (editIndex >= 0) {
      allSettings[editIndex].Text = text;
      allSettings[editIndex].Type = "date";
      allSettings[editIndex].Sort = "1";
      setting = allSettings[editIndex];
    } else {
      setting = { ID: "1", Type: "date", Text: text, URL: "", Sort: "1" };
      allSettings.push(setting);
    }
    renderSettings();
    byId("import-message").innerHTML = "基準日を保存しました。";
    if (DataService.isSharePoint() && editIndex < 0) {
      DataService.add("settings", { Type: setting.Type, Text: setting.Text, URL: setting.URL, Sort: setting.Sort }, function () {}, function () {
        byId("import-message").innerHTML = "画面には追加しましたが、SharePointへの設定保存に失敗しました。";
      });
    } else if (DataService.isSharePoint() && editIndex >= 0) {
      DataService.update("settings", setting.Id || setting.ID, { Type: setting.Type, Text: setting.Text, URL: setting.URL, Sort: setting.Sort }, function () {}, function () {
        byId("import-message").innerHTML = "画面には反映しましたが、SharePointの設定更新に失敗しました。";
      });
    }
  }

  function importSource() {
    if (!adminActive) {
      return;
    }
    var source = byId("html-source").value;
    if (!source) {
      byId("import-message").innerHTML = "HTMLソースを入力してください。";
      return;
    }
    try {
      replaceImportedData(HtmlImport.parse(source));
    } catch (e) {
      byId("import-message").innerHTML = "HTMLを解析できませんでした。公告一覧表の構造を確認してください。";
    }
  }

  function importFile() {
    if (!adminActive) {
      return;
    }
    var files = byId("html-file").files;
    if (!files || !files.length) {
      byId("import-message").innerHTML = "HTMLファイルを選択してください。";
      return;
    }
    HtmlImport.readFile(files[0], function (source) {
      try {
        replaceImportedData(HtmlImport.parse(source));
      } catch (e) {
        byId("import-message").innerHTML = "HTMLを解析できませんでした。公告一覧表の構造を確認してください。";
      }
    }, function () {
      byId("import-message").innerHTML = "HTMLファイルを読み込めませんでした。";
    });
  }

  function start() {
    setAdminVisibility(false);
    byId("data-status").innerHTML = "テンプレート / SharePoint / CSV確認中...";
    DataService.load(function (data) {
      allAnnouncements = data.announcements;
      allLinks = data.links;
      allSettings = dateOnlySettings(data.settings || []);
      byId("data-status").innerHTML = data.mode === "SHAREPOINT" ? "接続完了" : "CSVモード / 読み込み完了";
      render(allAnnouncements);
      renderSettings();
    }, showError);
    HtmlExport.loadTemplate(function () {}, function () {
      byId("form-message").innerHTML = "テンプレートを読み込めないため、HTML出力とプレビューは利用できません。";
    });
    byId("search-input").onkeyup = filterAnnouncements;
    byId("announcement-form").onsubmit = saveAnnouncement;
    byId("cancel-edit").onclick = clearForm;
    byId("export-kokoku").onclick = exportAnnouncements;
    byId("export-links").onclick = exportLinks;
    byId("export-settings").onclick = exportSettings;
    byId("export-html").onclick = exportHtml;
    byId("export-update-zip").onclick = function () { exportZip(false); };
    byId("export-full-zip").onclick = function () { exportZip(true); };
    byId("preview-page").onclick = previewPage;
    byId("import-source").onclick = importSource;
    byId("import-file").onclick = importFile;
    byId("setting-add").onclick = addSetting;
    byId("sort-date").onclick = toggleDateSort;
    byId("admin-login").onclick = activateAdmin;
    byId("admin-logout").onclick = deactivateAdmin;
    byId("admin-password").onkeydown = function (event) {
      event = event || window.event;
      if (event.keyCode === 13) {
        if (event.preventDefault) {
          event.preventDefault();
        }
        activateAdmin();
        return false;
      }
    };
  }

  global.onload = start;
}(this));
