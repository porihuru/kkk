(function (global) {
  "use strict";

  var plannedAnnouncements = [];
  var plannedLinks = [];
  var allAnnouncements = [];
  var allLinks = [];
  var allSettings = [];
  var deletedAnnouncements = [];
  var dateSortDescending = false;
  var preserveAnnouncementOrder = false;
  var editingList = "planned";
  var selectedPdfFiles = {};
  var filenameGenerationSequence = 0;
  var adminActive = false;
  var ADMIN_PASSWORD = "snk";
  var ALLOWED_CATEGORIES = ["NEW", "", "結果"];
  var ALLOWED_GARRISONS = ["札幌", "真駒内", "丘珠", "北千歳", "南恵庭", "北恵庭", "東千歳", "静内", "幌別", "函館", "倶知安", "美唄", "岩見沢", "滝川", "上富良野", "留萌", "旭川", "名寄", "稚内", "遠軽", "美幌", "帯広", "鹿追", "釧路", "別海"];
  var REGISTRANT_STATUSES = ["公告登録", "内容修正", "入札終了登録", "結果登録"];
  var ALLOWED_STATUSES = REGISTRANT_STATUSES.concat(["公告反映済", "結果反映済"]);

  function byId(id) {
    return document.getElementById(id);
  }

  function padDatePart(value) {
    return String(value).length < 2 ? "0" + value : String(value);
  }

  function toReiwaDate(date) {
    return "R" + (date.getFullYear() - 2018) + "." + (date.getMonth() + 1) + "." + date.getDate();
  }

  function toDatePickerValue(date) {
    return date.getFullYear() + "-" + padDatePart(date.getMonth() + 1) + "-" + padDatePart(date.getDate());
  }

  function operationDateText() {
    var date = new Date();
    return date.getFullYear() + "/" + padDatePart(date.getMonth() + 1) + "/" + padDatePart(date.getDate()) + " " + padDatePart(date.getHours()) + ":" + padDatePart(date.getMinutes());
  }

  function setDefaultBidDate() {
    var date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + 14);
    byId("date-input").value = toReiwaDate(date);
    byId("date-picker-input").value = toDatePickerValue(date);
  }

  function syncDatePicker() {
    var match = /^R(\d+)\.(\d+)\.(\d+)$/.exec(byId("date-input").value);
    if (!match) {
      byId("date-picker-input").value = "";
      return;
    }
    byId("date-picker-input").value = (2018 + parseInt(match[1], 10)) + "-" + padDatePart(match[2]) + "-" + padDatePart(match[3]);
  }

  function bidDateAsDate() {
    var match = /^R(\d+)\.(\d+)\.(\d+)$/.exec(byId("date-input").value);
    if (!match) {
      return null;
    }
    return new Date(2018 + parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  }

  function setupDateInput() {
    var picker = byId("date-picker-input");
    byId("date-input").onchange = function () {
      syncDatePicker();
      updatePdfLink();
    };
    byId("date-picker-button").onclick = function () {
      if (picker.showPicker) {
        picker.showPicker();
      } else {
        picker.focus();
        picker.click();
      }
    };
    picker.onchange = function () {
      var parts;
      if (!picker.value) {
        return;
      }
      parts = picker.value.split("-");
      byId("date-input").value = toReiwaDate(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
      updatePdfLink();
    };
  }

  function fileNameFromUrl(url) {
    var parts = String(url || "").split("/");
    return parts[parts.length - 1] || "";
  }

  function updatePdfLink() {
    var title = byId("link-text-input").value.trim();
    var garrison = byId("garrison-input").value;
    var sequence = ++filenameGenerationSequence;
    if (!global.FilenameGenerator) {
      byId("link-url-input").value = "";
      return;
    }
    global.FilenameGenerator.generate({
      title: title,
      garrison: garrison,
      category: byId("category-input").value,
      date: bidDateAsDate() || new Date()
    }, function (result) {
      if (sequence !== filenameGenerationSequence) {
        return;
      }
      byId("link-url-input").value = result.url;
    }, function () {
      if (sequence !== filenameGenerationSequence) {
        return;
      }
      byId("link-url-input").value = "";
      byId("form-message").innerHTML = "PDF表示名からPDFリンクを作成できません。読みやすい日本語で入力してください。";
    });
  }

  function setupPdfFilename() {
    byId("category-input").onchange = updatePdfLink;
    byId("garrison-input").onchange = updatePdfLink;
    byId("link-text-input").oninput = updatePdfLink;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAllowed(value, allowedValues) {
    return allowedValues.indexOf(value) >= 0;
  }

  function normalizeCategory(value) {
    value = String(value || "");
    if (value === "") {
      return "";
    }
    if (value === "変更" || value === "削除") {
      return "";
    }
    return value === "結果" ? "結果" : "NEW";
  }

  function normalizeStatus(value) {
    value = String(value || "");
    if (value === "公開" || value === "公開済み") {
      return "公告反映済";
    }
    if (value === "公開待ち" || value === "下書き") {
      return "公告登録";
    }
    return value === "内容修正" || value === "入札終了登録" || value === "結果登録" || value === "公告反映済" || value === "結果反映済" ? value : "公告登録";
  }

  function normalizeAnnouncements(items) {
    var result = [];
    var i;
    var item;
    for (i = 0; i < items.length; i += 1) {
      item = items[i];
      item.Category = normalizeCategory(item.Category);
      item.Status = normalizeStatus(item.Status);
      result.push(item);
    }
    return result;
  }

  function listState(kind) {
    return kind === "planned" ? { announcements: plannedAnnouncements, links: plannedLinks } : { announcements: allAnnouncements, links: allLinks };
  }

  function pdfKey(kind, linkId) {
    return kind + ":" + linkId;
  }

  function linksFor(announcementId, sourceLinks) {
    var result = [];
    var i;
    sourceLinks = sourceLinks || allLinks;
    for (i = 0; i < sourceLinks.length; i += 1) {
      if (String(sourceLinks[i].KokokuID) === String(announcementId)) {
        result.push(sourceLinks[i]);
      }
    }
    result.sort(function (left, right) {
      return parseInt(left.Sort, 10) - parseInt(right.Sort, 10);
    });
    return result;
  }

  function announcementById(announcementId, sourceAnnouncements) {
    var i;
    sourceAnnouncements = sourceAnnouncements || allAnnouncements;
    for (i = 0; i < sourceAnnouncements.length; i += 1) {
      if (String(sourceAnnouncements[i].ID) === String(announcementId)) {
        return sourceAnnouncements[i];
      }
    }
    return null;
  }

  function compareAnnouncements(left, right) {
    var leftDate = String(left.BidDate || "");
    var rightDate = String(right.BidDate || "");
    if (leftDate === rightDate) {
      return (parseInt(left.Sort, 10) || 0) - (parseInt(right.Sort, 10) || 0);
    }
    return dateSortDescending ? (leftDate < rightDate ? 1 : -1) : (leftDate > rightDate ? 1 : -1);
  }

  function renderList(kind, announcements) {
    var state = listState(kind);
    var listElement = byId(kind === "planned" ? "planned-announcement-list" : "announcement-list");
    var countElement = byId(kind === "planned" ? "planned-record-count" : "record-count");
    var canOperate = kind === "planned" || adminActive;
    var html = [];
    var i;
    var links;
    var j;
    var categoryClass;

    if (!(kind === "published" && preserveAnnouncementOrder)) {
      if (kind === "published") {
        state.announcements.sort(compareAnnouncements);
      }
      announcements.sort(compareAnnouncements);
    }
    countElement.innerHTML = announcements.length + "件";
    if (!announcements.length) {
      listElement.innerHTML = '<tr><td colspan="9" class="empty-row">該当する公告はありません。</td></tr>';
      return;
    }

    for (i = 0; i < announcements.length; i += 1) {
      links = linksFor(announcements[i].ID, state.links);
      categoryClass = announcements[i].Category === "NEW" ? "category" : "category category-change";
      html.push("<tr>");
      html.push("<td class=\"id-cell\">" + escapeHtml(announcements[i].ID) + "</td>");
      html.push("<td class=\"actions\">");
      if (canOperate) {
        html.push("<button type=\"button\" class=\"button button-small edit-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">修正</button> <button type=\"button\" class=\"button button-small button-danger delete-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">削除</button>");
      }
      if (kind === "planned" && adminActive) {
        html.push(" <button type=\"button\" class=\"button button-small move-button publish-button\" data-list=\"planned\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">本リストへ登録</button>");
      }
      if (kind === "published" && adminActive) {
        html.push(" <button type=\"button\" class=\"button button-small move-button return-button\" data-list=\"published\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">予定へ差し戻し</button>");
      }
      if (!canOperate && !adminActive) {
        html.push("—");
      }
      html.push("</td>");
      html.push("<td class=\"operation-date-cell\">" + escapeHtml(announcements[i].OperationDate || "—") + "</td>");
      html.push("<td class=\"status-cell\">" + escapeHtml(announcements[i].Status) + "</td>");
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
      html.push("</tr>");
    }
    listElement.innerHTML = html.join("");
    bindRowActions();
  }

  function render(announcements) {
    renderList("published", announcements || allAnnouncements);
  }

  function bindRowActions() {
    var editButtons = document.getElementsByClassName("edit-button");
    var deleteButtons = document.getElementsByClassName("delete-button");
    var publishButtons = document.getElementsByClassName("publish-button");
    var returnButtons = document.getElementsByClassName("return-button");
    var i;
    for (i = 0; i < editButtons.length; i += 1) {
      editButtons[i].onclick = beginEdit;
    }
    for (i = 0; i < deleteButtons.length; i += 1) {
      deleteButtons[i].onclick = deleteAnnouncement;
    }
    for (i = 0; i < publishButtons.length; i += 1) {
      publishButtons[i].onclick = moveAnnouncement;
    }
    for (i = 0; i < returnButtons.length; i += 1) {
      returnButtons[i].onclick = moveAnnouncement;
    }
  }

  function beginEdit() {
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var announcement = announcementById(this.getAttribute("data-id"), state.announcements);
    var links;
    if (kind === "published" && !adminActive) {
      return;
    }
    if (!announcement) {
      return;
    }
    editingList = kind;
    links = linksFor(announcement.ID, state.links);
    byId("announcement-id").value = announcement.ID;
    byId("category-input").value = announcement.Category;
    byId("garrison-input").value = announcement.Garrison;
    byId("date-input").value = announcement.BidDate;
    syncDatePicker();
    byId("status-input").value = announcement.Status || "公告登録";
    byId("remarks-input").value = announcement.Remarks;
    byId("link-text-input").value = links.length ? links[0].Text : "";
    byId("link-url-input").value = links.length ? links[0].URL : "";
    byId("editor-title").innerHTML = "公告を修正";
    byId("cancel-edit").className = "button button-secondary";
    byId("form-message").innerHTML = "修正内容を入力して保存してください。";
    if (byId("announcement-form").scrollIntoView) {
      byId("announcement-form").scrollIntoView();
    }
  }

  function clearForm() {
    byId("announcement-form").reset();
    setDefaultBidDate();
    byId("announcement-id").value = "";
    byId("editor-title").innerHTML = "公告を新規登録";
    byId("cancel-edit").className = "button button-secondary hidden";
    byId("form-message").innerHTML = "";
    editingList = "planned";
  }

  function nextId(sourceAnnouncements) {
    var max = 0;
    var i;
    sourceAnnouncements = sourceAnnouncements || allAnnouncements;
    for (i = 0; i < sourceAnnouncements.length; i += 1) {
      max = Math.max(max, parseInt(sourceAnnouncements[i].ID, 10) || 0);
    }
    return String(max + 1);
  }

  function nextLinkId(sourceLinks) {
    var max = 0;
    var i;
    sourceLinks = sourceLinks || allLinks;
    for (i = 0; i < sourceLinks.length; i += 1) {
      max = Math.max(max, parseInt(sourceLinks[i].ID, 10) || 0);
    }
    return String(max + 1);
  }

  function persistAnnouncement(announcement, link, isNew, selectedFile) {
    var payload = { Category: announcement.Category, Garrison: announcement.Garrison, BidDate: announcement.BidDate, Remarks: announcement.Remarks, Sort: announcement.Sort, Status: announcement.Status, OperationDate: announcement.OperationDate };
    var itemId = announcement.Id || announcement.ID;
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
      DataService.uploadPdf(selectedFile, link.FileName || fileNameFromUrl(link.URL) || selectedFile.name, function () {}, function () {
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
    var targetKind = id ? editingList : "planned";
    var state = listState(targetKind);
    var announcement = announcementById(id, state.announcements);
    var links;
    var selectedFile;
    var isNew = !announcement;
    if (event) {
      event.preventDefault();
    }
    if (!isAllowed(byId("category-input").value, ALLOWED_CATEGORIES)) {
      byId("form-message").innerHTML = "区分はNEW、空白、結果のいずれかを選択してください。";
      return false;
    }
    if (!isAllowed(byId("garrison-input").value, ALLOWED_GARRISONS)) {
      byId("form-message").innerHTML = "駐屯地は一覧から選択してください。";
      return false;
    }
    if (!isAllowed(byId("status-input").value, adminActive ? ALLOWED_STATUSES : REGISTRANT_STATUSES)) {
      byId("form-message").innerHTML = adminActive ? "状態は一覧から選択してください。" : "登録者は公告登録、内容修正、入札終了登録、結果登録から選択してください。";
      return false;
    }
    if (!byId("link-url-input").value) {
      updatePdfLink();
      byId("form-message").innerHTML = "PDFリンクを作成中です。少し待ってから保存してください。";
      return false;
    }
    if (!byId("date-input").value || !byId("link-text-input").value || !byId("link-url-input").value) {
      byId("form-message").innerHTML = "駐屯地、入札日、PDF表示名、PDFリンクを入力してください。";
      return false;
    }
    if (!/^R[1-9][0-9]*\.(?:[1-9]|1[0-2])\.(?:[1-9]|[12][0-9]|3[01])$/.test(byId("date-input").value)) {
      byId("form-message").innerHTML = "入札日はR8.8.10形式で入力してください。";
      return false;
    }
    if (!announcement) {
      id = nextId(state.announcements);
      announcement = { ID: id, Sort: String(state.announcements.length + 1), Status: "公告登録", OperationDate: "" };
      state.announcements.push(announcement);
    }
    announcement.Category = byId("category-input").value;
    announcement.Garrison = byId("garrison-input").value;
    announcement.BidDate = byId("date-input").value;
    announcement.Status = byId("status-input").value;
    announcement.Remarks = byId("remarks-input").value;
    announcement.OperationDate = operationDateText();
    selectedFile = byId("pdf-file-input").files.length ? byId("pdf-file-input").files[0] : null;
    links = linksFor(id, state.links);
    if (links.length) {
      links[0].Text = byId("link-text-input").value;
      links[0].URL = byId("link-url-input").value;
      links[0].FileName = fileNameFromUrl(links[0].URL);
      if (byId("pdf-file-input").files.length) {
        selectedPdfFiles[pdfKey(targetKind, links[0].ID)] = byId("pdf-file-input").files[0];
      }
    } else {
      state.links.push({ ID: nextLinkId(state.links), KokokuID: id, Text: byId("link-text-input").value, FileName: fileNameFromUrl(byId("link-url-input").value), URL: byId("link-url-input").value, Type: "公告", Sort: "1" });
      if (byId("pdf-file-input").files.length) {
        selectedPdfFiles[pdfKey(targetKind, state.links[state.links.length - 1].ID)] = byId("pdf-file-input").files[0];
      }
    }
    clearForm();
    filterAnnouncements();
    byId("form-message").innerHTML = DataService.isSharePoint() ? "SharePointへ保存しています..." : "公告を保存しました（CSVモードのメモリ上）。";
    persistAnnouncement(announcement, linksFor(id, state.links)[0], isNew, selectedFile);
    return false;
  }

  function copyObject(value) {
    var result = {};
    var key;
    for (key in value) {
      if (value.hasOwnProperty(key)) {
        result[key] = value[key];
      }
    }
    return result;
  }

  function renderDeletedAnnouncements() {
    var html = [];
    var i;
    var j;
    var record;
    if (!deletedAnnouncements.length) {
      byId("deleted-list").innerHTML = '<tr><td colspan="6" class="empty-row">削除された公告はありません。</td></tr>';
      return;
    }
    for (i = 0; i < deletedAnnouncements.length; i += 1) {
      record = deletedAnnouncements[i];
      html.push("<tr>");
      html.push("<td>" + escapeHtml(record.deletedAt) + "</td>");
      html.push("<td>" + escapeHtml(record.announcement.Category) + "</td>");
      html.push("<td>" + escapeHtml(record.announcement.Garrison) + "</td>");
      html.push("<td><ul class=\"link-list\">");
      for (j = 0; j < record.links.length; j += 1) {
        html.push("<li>" + escapeHtml(record.links[j].Text) + "</li>");
      }
      html.push("</ul></td>");
      html.push("<td>" + escapeHtml(record.announcement.BidDate) + "</td>");
      html.push("<td>" + escapeHtml(record.announcement.Remarks) + "</td>");
      html.push("</tr>");
    }
    byId("deleted-list").innerHTML = html.join("");
  }

  function deleteAnnouncement() {
    var id = this.getAttribute("data-id");
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var i;
    var announcement = announcementById(id, state.announcements);
    var deletedLinks;
    if (kind === "published" && !adminActive) {
      return;
    }
    if (!window.confirm("この公告を削除しますか？")) {
      return;
    }
    deletedLinks = linksFor(id, state.links).map(copyObject);
    if (announcement) {
      deletedAnnouncements.unshift({ deletedAt: new Date().toLocaleString(), announcement: copyObject(announcement), links: deletedLinks });
    }
    for (i = state.announcements.length - 1; i >= 0; i -= 1) {
      if (String(state.announcements[i].ID) === String(id)) {
        state.announcements.splice(i, 1);
      }
    }
    for (i = state.links.length - 1; i >= 0; i -= 1) {
      if (String(state.links[i].KokokuID) === String(id)) {
        if (DataService.isSharePoint()) {
          DataService.remove("links", state.links[i].Id || state.links[i].ID, function () {}, function () {});
        }
        delete selectedPdfFiles[pdfKey(kind, state.links[i].ID)];
        state.links.splice(i, 1);
      }
    }
    if (DataService.isSharePoint() && announcement) {
      DataService.remove("announcements", announcement.Id || announcement.ID, function () {}, function () {
        byId("form-message").innerHTML = "画面から削除しましたが、SharePointの削除に失敗しました。";
      });
    }
    renderDeletedAnnouncements();
    filterAnnouncements();
  }

  function moveAnnouncement() {
    var fromKind = this.getAttribute("data-list") || "planned";
    var toKind = fromKind === "planned" ? "published" : "planned";
    var from = listState(fromKind);
    var to = listState(toKind);
    var id = this.getAttribute("data-id");
    var announcement = announcementById(id, from.announcements);
    var links;
    var i;
    var announcementIndex;
    var selectedFile;
    var movedAnnouncement;
    var movedLinks = [];
    var movedLink;
    if (!adminActive || !announcement) {
      return;
    }
    links = linksFor(id, from.links).map(copyObject);
    movedAnnouncement = copyObject(announcement);
    movedAnnouncement.ID = nextId(to.announcements);
    delete movedAnnouncement.Id;
    for (i = 0; i < links.length; i += 1) {
      selectedFile = selectedPdfFiles[pdfKey(fromKind, links[i].ID)];
      if (selectedFile) {
        selectedPdfFiles[pdfKey(toKind, nextLinkId(to.links) + i)] = selectedFile;
      }
      movedLink = links[i];
      movedLink.ID = nextLinkId(to.links) + i;
      movedLink.KokokuID = movedAnnouncement.ID;
      delete movedLink.Id;
      movedLinks.push(movedLink);
    }
    announcementIndex = from.announcements.indexOf(announcement);
    if (announcementIndex >= 0) {
      from.announcements.splice(announcementIndex, 1);
    }
    for (i = from.links.length - 1; i >= 0; i -= 1) {
      if (String(from.links[i].KokokuID) === String(id)) {
        delete selectedPdfFiles[pdfKey(fromKind, from.links[i].ID)];
        from.links.splice(i, 1);
      }
    }
    movedAnnouncement.Status = toKind === "published" ? (movedAnnouncement.Category === "結果" ? "結果反映済" : "公告反映済") : (movedAnnouncement.Category === "結果" ? "結果登録" : "内容修正");
    movedAnnouncement.OperationDate = operationDateText();
    to.announcements.unshift(movedAnnouncement);
    for (i = 0; i < movedLinks.length; i += 1) {
      to.links.push(movedLinks[i]);
    }
    if (toKind === "published") {
      preserveAnnouncementOrder = true;
    }
    filterAnnouncements();
    byId("form-message").innerHTML = toKind === "published" ? "公告リストへ移動しました。" : "公告予定リストへ差し戻しました。";
  }

  function filterAnnouncements() {
    var keyword = byId("search-input").value.toLowerCase();
    function filteredItems(kind) {
      var state = listState(kind);
      var filtered = [];
      var i;
      var text;
      var links;
      var linkIndex;
      for (i = 0; i < state.announcements.length; i += 1) {
        text = [state.announcements[i].Category, state.announcements[i].Garrison, state.announcements[i].BidDate, state.announcements[i].Remarks].join(" ").toLowerCase();
        links = linksFor(state.announcements[i].ID, state.links);
        for (linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
          text += " " + String(links[linkIndex].Text || "").toLowerCase();
        }
        if (text.indexOf(keyword) >= 0) {
          filtered.push(state.announcements[i]);
        }
      }
      return filtered;
    }
    renderList("planned", filteredItems("planned"));
    renderList("published", filteredItems("published"));
  }

  function showError() {
    byId("data-status").innerHTML = "接続失敗。データを表示できませんが、アプリは継続しています。";
    byId("planned-announcement-list").innerHTML = '<tr><td colspan="9" class="empty-row">データを表示できません。</td></tr>';
    byId("announcement-list").innerHTML = '<tr><td colspan="9" class="empty-row">データを表示できません。</td></tr>';
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
    var statusOptions = byId("status-input").options;
    var i;
    for (i = 0; i < adminOnly.length; i += 1) {
      setHidden(adminOnly[i], !active);
    }
    for (i = 0; i < controls.length; i += 1) {
      setHidden(controls[i], !active);
    }
    for (i = 0; i < statusOptions.length; i += 1) {
      if (statusOptions[i].getAttribute("data-admin-only-status") === "true") {
        statusOptions[i].hidden = !active;
        statusOptions[i].disabled = !active;
      }
    }
    byId("status-input").disabled = false;
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
    setHidden(byId("deleted-list-panel"), true);
    setAdminVisibility(false);
    filterAnnouncements();
  }

  function toggleDeletedList() {
    var panel = byId("deleted-list-panel");
    var isHidden;
    if (!adminActive) {
      return;
    }
    isHidden = (" " + panel.className + " ").indexOf(" hidden ") >= 0;
    setHidden(panel, !isHidden);
    if (isHidden) {
      renderDeletedAnnouncements();
    }
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
    downloadCsv("kokoku.csv", CsvData.toCsv(allAnnouncements, ["ID", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"]));
    byId("form-message").innerHTML = "公告CSVを出力しました。";
  }

  function exportPlannedAnnouncements() {
    downloadCsv("kokoku_planned.csv", CsvData.toCsv(plannedAnnouncements, ["ID", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"]));
    byId("form-message").innerHTML = "公告予定CSVを出力しました。";
  }

  function exportLinks() {
    downloadCsv("links.csv", CsvData.toCsv(allLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "リンクCSVを出力しました。";
  }

  function exportPlannedLinks() {
    downloadCsv("links_planned.csv", CsvData.toCsv(plannedLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "公告予定リンクCSVを出力しました。";
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
    var fileName;
    var zipPath;
    for (i = 0; i < allLinks.length; i += 1) {
      link = allLinks[i];
      file = selectedPdfFiles[pdfKey("published", link.ID)];
      if (file) {
        fileName = link.FileName || fileNameFromUrl(link.URL) || file.name;
        zipPath = link.URL ? (link.URL.indexOf("nafin/") === 0 ? link.URL : "nafin/" + link.URL) : "nafin/R8/be/" + fileName;
        files.push({ name: zipPath.replace(/\\/g, "/"), file: file });
      }
    }
    ZipExport.create(files, function (blob) {
      downloadBlob(fullData ? "R8kokoku_full.zip" : "R8kokoku_update.zip", blob);
      byId("form-message").innerHTML = "ZIPを出力しました。選択済みPDF" + (files.length - 1) + "件。";
    });
  }

  function toggleDateSort() {
    if (preserveAnnouncementOrder) {
      return;
    }
    dateSortDescending = !dateSortDescending;
    byId("sort-date").innerHTML = dateSortDescending ? "入札日 ▼" : "入札日 ▲";
    byId("sort-planned-date").innerHTML = dateSortDescending ? "入札日 ▼" : "入札日 ▲";
    filterAnnouncements();
  }

  function replaceImportedData(data) {
    preserveAnnouncementOrder = true;
    allAnnouncements = normalizeAnnouncements(data.announcements);
    allLinks = data.links;
    allSettings = dateOnlySettings(data.settings || []);
    byId("data-status").innerHTML = "CSVモード / HTML取り込みデータ";
    clearForm();
    filterAnnouncements();
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
    setupDateInput();
    setupPdfFilename();
    setDefaultBidDate();
    updatePdfLink();
    byId("data-status").innerHTML = "テンプレート / SharePoint / CSV確認中...";
    DataService.load(function (data) {
      preserveAnnouncementOrder = false;
      plannedAnnouncements = normalizeAnnouncements(data.announcements);
      plannedLinks = data.links;
      allAnnouncements = normalizeAnnouncements(data.publishedAnnouncements || []);
      allLinks = data.publishedLinks || [];
      allSettings = dateOnlySettings(data.settings || []);
      byId("data-status").innerHTML = data.mode === "SHAREPOINT" ? "接続完了" : "CSVモード / 読み込み完了";
      filterAnnouncements();
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
    byId("export-planned-kokoku").onclick = exportPlannedAnnouncements;
    byId("export-planned-links").onclick = exportPlannedLinks;
    byId("export-settings").onclick = exportSettings;
    byId("export-html").onclick = exportHtml;
    byId("export-update-zip").onclick = function () { exportZip(false); };
    byId("export-full-zip").onclick = function () { exportZip(true); };
    byId("preview-page").onclick = previewPage;
    byId("import-source").onclick = importSource;
    byId("import-file").onclick = importFile;
    byId("setting-add").onclick = addSetting;
    byId("sort-date").onclick = toggleDateSort;
    byId("sort-planned-date").onclick = toggleDateSort;
    byId("admin-logout").onclick = deactivateAdmin;
    byId("show-deleted").onclick = toggleDeletedList;
    byId("close-deleted").onclick = function () { setHidden(byId("deleted-list-panel"), true); };
    byId("admin-access-form").onsubmit = function (event) {
      event = event || window.event;
      if (event.preventDefault) {
        event.preventDefault();
      }
      activateAdmin();
      return false;
    };
  }

  global.onload = start;
}(this));
