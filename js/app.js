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
  var preservePlannedOrder = false;
  var editingList = "planned";
  var selectedPdfFiles = {};
  var filenameGenerationSequences = [];
  var PDF_ROW_COUNT = 5;
  var requestFiles = {};
  var workflowBusy = false;
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

  function postingDateText(value) {
    if (!value) { return "不明"; }
    var date = new Date(value);
    if (isNaN(date.getTime())) { return "不明"; }
    var jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.getUTCFullYear() + "/" + padDatePart(jst.getUTCMonth() + 1) + "/" + padDatePart(jst.getUTCDate()) + " " + padDatePart(jst.getUTCHours()) + ":" + padDatePart(jst.getUTCMinutes());
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
    if (!picker.showPicker && picker.type === "date") {
      picker.className = "date-picker-visible";
      picker.removeAttribute("aria-hidden");
      picker.removeAttribute("tabindex");
      picker.setAttribute("aria-label", "入札日（西暦）");
    } else if (picker.type !== "date") {
      byId("date-picker-button").innerHTML = "入力";
      byId("date-picker-button").setAttribute("aria-label", "入札日を直接入力（例：R8.9.13）");
    }
    byId("date-input").onchange = function () {
      syncDatePicker();
      updatePdfLinks();
    };
    byId("date-picker-button").onclick = function () {
      if (picker.type !== "date") {
        byId("date-input").focus();
      } else if (picker.showPicker) {
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
      updatePdfLinks();
    };
  }

  function fileNameFromUrl(url) {
    var parts = String(url || "").split("/");
    return parts[parts.length - 1] || "";
  }

  function pdfInput(field, rowIndex) {
    return byId(field + "-" + (rowIndex + 1));
  }

  function updatePdfLink(rowIndex) {
    var title = pdfInput("link-text-input", rowIndex).value.trim();
    var garrison = byId("garrison-input").value;
    var sequence = (filenameGenerationSequences[rowIndex] || 0) + 1;
    filenameGenerationSequences[rowIndex] = sequence;
    if (rowIndex > 0 && !title) {
      pdfInput("link-url-input", rowIndex).value = "";
      return;
    }
    if (!global.FilenameGenerator) {
      pdfInput("link-url-input", rowIndex).value = "";
      return;
    }
    global.FilenameGenerator.generate({
      title: title,
      garrison: garrison,
      category: byId("category-input").value,
      date: bidDateAsDate() || new Date()
    }, function (result) {
      if (sequence !== filenameGenerationSequences[rowIndex]) {
        return;
      }
      pdfInput("link-url-input", rowIndex).value = result.url;
    }, function () {
      if (sequence !== filenameGenerationSequences[rowIndex]) {
        return;
      }
      pdfInput("link-url-input", rowIndex).value = "";
      byId("form-message").innerHTML = "PDF表示名からPDFリンクを作成できません。読みやすい日本語で入力してください。";
    });
  }

  function updatePdfLinks() {
    var i;
    for (i = 0; i < PDF_ROW_COUNT; i += 1) {
      updatePdfLink(i);
    }
  }

  function setupPdfFilename() {
    byId("category-input").onchange = updatePdfLinks;
    byId("garrison-input").onchange = updatePdfLinks;
    var i;
    for (i = 0; i < PDF_ROW_COUNT; i += 1) {
      (function (rowIndex) {
        pdfInput("link-text-input", rowIndex).oninput = function () { updatePdfLink(rowIndex); };
      }(i));
    }
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

  function publicationData() {
    return PublicationWorkflow.candidate(allAnnouncements, allLinks, plannedAnnouncements, DataService.getPublicationConfig().endedUrl);
  }

  function saveWorkflowItem(item, patch, success, error) {
    var key;
    if (DataService.isSharePoint()) {
      DataService.update("announcements", item.Id || item.ID, patch, function () {
        for (key in patch) { if (patch.hasOwnProperty(key)) { item[key] = patch[key]; } }
        success();
      }, error);
    } else {
      for (key in patch) { if (patch.hasOwnProperty(key)) { item[key] = patch[key]; } }
      success();
    }
  }

  function openPublicationRequest() {
    if (workflowBusy) { return; }
    var id = this.getAttribute("data-id");
    var request = this.getAttribute("data-list") === "planned" ? announcementById(id, plannedAnnouncements) : null;
    var target = announcementById(request ? request.TargetID : id, allAnnouncements);
    if (!target || !DataService.canManageAnnouncement(request || target, "planned", adminActive)) { return; }
    byId("publication-target-id").value = target.ID;
    byId("publication-request-id").value = request ? request.ID : "";
    byId("publication-request-type").value = request ? request.RequestType : "結果登録";
    byId("publication-result-file").value = "";
    byId("publication-target").textContent = "公告ID " + target.ID + " ／ " + target.Garrison + " ／ 入札日 " + target.BidDate;
    byId("publication-request-message").textContent = "結果登録の場合はPDFを選択してください。元の公告PDFは保持します。";
    setHidden(byId("publication-request-panel"), false);
    byId("publication-request-panel").scrollIntoView();
  }

  function submitPublicationRequest(event) {
    event.preventDefault();
    if (workflowBusy) { return; }
    var target = announcementById(byId("publication-target-id").value, allAnnouncements);
    var old = announcementById(byId("publication-request-id").value, plannedAnnouncements);
    if (!target || !DataService.canManageAnnouncement(old || target, "planned", adminActive)) { return; }
    var user = DataService.getCurrentUser(), request = old ? PublicationWorkflow.copy(old) : PublicationWorkflow.copy(target);
    var type = byId("publication-request-type").value, file = byId("publication-result-file").files[0], i;
    for (i = 0; i < plannedAnnouncements.length; i += 1) {
      if (PublicationWorkflow.active(plannedAnnouncements[i]) && String(plannedAnnouncements[i].TargetID) === String(target.ID) && plannedAnnouncements[i] !== old) {
        byId("publication-request-message").textContent = "この公告には未完了の依頼があります。既存の依頼を修正してください。"; return;
      }
    }
    request.ID = old ? old.ID : nextId(plannedAnnouncements);
    request.ListKind = "planned"; request.TargetID = String(target.ID); request.RequestType = type; request.RequestStatus = type;
    request.Status = type === "掲載終了依頼" ? "入札終了登録" : "結果登録";
    request.VerifiedAt = ""; request.OperationDate = operationDateText();
    if (!old) { delete request.Id; request.AuthorId = user.id; request.AuthorName = user.name; request.Created = new Date().toISOString(); request.ResultURL = ""; request.ResultName = ""; }
    if (type === "結果登録" && file) {
      if (!/\.pdf$/i.test(file.name)) { byId("publication-request-message").textContent = "PDFファイルを選択してください。"; return; }
      request.ResultURL = DataService.getPublicationConfig().pdfRoot + "/result-" + new Date().getTime() + "-" + String(request.ID).replace(/[^A-Za-z0-9_-]/g, "") + ".pdf";
      request.ResultName = file.name;
    }
    if (type === "結果登録" && !file && !old) { byId("publication-request-message").textContent = "結果PDFを選択してください。"; return; }
    if (type === "掲載終了依頼") { request.ResultURL = ""; request.ResultName = ""; }
    try { PublicationWorkflow.validate(request, allAnnouncements); } catch (error) { byId("publication-request-message").textContent = error.message; return; }
    workflowBusy = true;
    function failed() { workflowBusy = false; byId("publication-request-message").textContent = "保存に失敗しました。依頼は完了していません。"; }
    function saved(result) {
      if (result && result.Id) { request.Id = result.Id; request.ID = String(result.Id); }
      if (result && result.Created) { request.Created = result.Created; }
      if (old) { plannedAnnouncements.splice(plannedAnnouncements.indexOf(old), 1, request); } else { plannedAnnouncements.unshift(request); }
      if (file) { requestFiles[request.ID] = file; }
      workflowBusy = false; filterAnnouncements();
      setHidden(byId("publication-request-panel"), true);
      byId("form-message").textContent = "更新依頼を登録しました。公開サイトの内容はまだ変更していません。";
    }
    function storeRequest() {
      if (!DataService.isSharePoint()) { saved(); return; }
      var payload = {}, keys = ["Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields);
      keys.forEach(function (key) { payload[key] = request[key] || ""; });
      if (old) { DataService.update("announcements", old.Id || old.ID, payload, function () { saved(); }, failed); }
      else { DataService.add("announcements", payload, saved, failed); }
    }
    if (file && DataService.isSharePoint()) { DataService.uploadPdf(file, request.ResultURL.split("/").pop(), storeRequest, failed); } else { storeRequest(); }
  }

  function approvePublicationRequest() {
    if (!adminActive || workflowBusy) { return; }
    var request = announcementById(this.getAttribute("data-id"), plannedAnnouncements);
    if (!request || request.RequestStatus === "反映確認済み") { return; }
    var patch = { RequestStatus: request.RequestStatus === "公開待ち" ? request.RequestType : "公開待ち" };
    try {
      var proposed = PublicationWorkflow.copy(request); proposed.RequestStatus = patch.RequestStatus;
      PublicationWorkflow.candidate(allAnnouncements, allLinks, plannedAnnouncements.map(function (item) { return item === request ? proposed : item; }), DataService.getPublicationConfig().endedUrl);
    } catch (error) { byId("form-message").textContent = error.message; return; }
    workflowBusy = true;
    saveWorkflowItem(request, patch, function () { workflowBusy = false; filterAnnouncements(); }, function () { workflowBusy = false; byId("form-message").textContent = "依頼の更新に失敗しました。"; });
  }

  function verifyPublication() {
    if (!adminActive || workflowBusy) { return; }
    var file = byId("published-check-file").files[0];
    if (!file) { byId("published-check-message").textContent = "公開サイトから取得したHTMLを選択してください。"; return; }
    var pending = plannedAnnouncements.filter(function (r) { return r.RequestStatus === "公開待ち"; });
    if (!pending.length) { byId("published-check-message").textContent = "公開待ちの依頼はありません。"; return; }
    workflowBusy = true;
    function fail(message) { workflowBusy = false; byId("published-check-message").textContent = message || "反映記録の保存に失敗しました。再読込して状態を確認してください。"; }
    HtmlImport.readFile(file, function (source) {
      var expected;
      try {
        expected = publicationData();
        if (PublicationWorkflow.signature(expected, DataService.getPublicLinkUrl) !== PublicationWorkflow.signature(HtmlImport.parse(source), DataService.getPublicLinkUrl)) { fail("公開予定とHTMLが一致しません。反映済みにはしていません。"); return; }
      } catch (error) { fail(error.message); return; }
      var index = 0;
      function next() {
        if (index === pending.length) { workflowBusy = false; filterAnnouncements(); byId("published-check-message").textContent = "公開HTMLとの一致を確認し、" + pending.length + "件を反映確認済みにしました。"; return; }
        var request = pending[index++], original = announcementById(request.TargetID, allAnnouncements), candidate = announcementById(request.TargetID, expected.announcements);
        var timestamp = new Date().toISOString();
        saveWorkflowItem(original, { PublicState: candidate.PublicState, Category: candidate.Category, Status: candidate.Status, ResultURL: candidate.ResultURL || "", ResultName: candidate.ResultName || "", VerifiedAt: timestamp }, function () {
          saveWorkflowItem(request, { RequestStatus: "反映確認済み", VerifiedAt: timestamp }, next, function () { fail(); });
        }, function () { fail(); });
      }
      next();
    }, function () { fail("HTMLファイルを読み込めません。"); });
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
    var canOperate;
    var html = [];
    var i;
    var links;
    var j;
    var categoryClass;
    var upDisabled;
    var downDisabled;

    if (!((kind === "published" && preserveAnnouncementOrder) || (kind === "planned" && preservePlannedOrder))) {
      state.announcements.sort(compareAnnouncements);
      announcements.sort(compareAnnouncements);
    }
    countElement.innerHTML = announcements.length + "件";
    if (!announcements.length) {
      listElement.innerHTML = '<tr><td colspan="' + (kind === "planned" ? "11" : "9") + '" class="empty-row">該当する公告はありません。</td></tr>';
      return;
    }

    for (i = 0; i < announcements.length; i += 1) {
      canOperate = DataService.canManageAnnouncement(announcements[i], kind, adminActive);
      links = linksFor(announcements[i].ID, state.links);
      if (kind === "published" && announcements[i].PublicState && announcements[i].PublicState !== "公告掲載中") {
        try { links = PublicationWorkflow.candidate([announcements[i]], links, [], DataService.getPublicationConfig().endedUrl).links; } catch (error) { links = []; }
      }
      if (announcements[i].RequestType && announcements[i].ResultURL) { links = [{ Text: announcements[i].ResultName || "結果PDF", URL: announcements[i].ResultURL }]; }
      if (announcements[i].RequestType === "掲載終了依頼") { links = [{ Text: "掲載終了PDF", URL: DataService.getPublicationConfig().endedUrl }]; }
      categoryClass = announcements[i].Category === "NEW" ? "category" : "category category-change";
      upDisabled = i === 0 ? " disabled" : "";
      downDisabled = i === announcements.length - 1 ? " disabled" : "";
      html.push("<tr>");
      html.push("<td class=\"id-cell\">");
      if (adminActive) {
        html.push("<span class=\"order-controls\"><button type=\"button\" class=\"button order-button order-up-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\" aria-label=\"上へ移動\"" + upDisabled + ">↑</button><button type=\"button\" class=\"button order-button order-down-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\" aria-label=\"下へ移動\"" + downDisabled + ">↓</button></span>");
      }
      html.push(escapeHtml(announcements[i].ID) + "</td>");
      html.push("<td class=\"actions\">");
      if (canOperate) {
        html.push("<button type=\"button\" class=\"button button-small edit-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">修正</button> <button type=\"button\" class=\"button button-small button-danger delete-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">削除</button>");
      }
      if (kind === "planned" && adminActive && !announcements[i].RequestType) {
        html.push(" <button type=\"button\" class=\"button button-small move-button publish-button\" data-list=\"planned\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">本リストへ登録</button>");
      }
      if (kind === "published" && DataService.canManageAnnouncement(announcements[i], "planned", adminActive)) {
        html.push('<button type="button" class="button button-small request-button" data-id="' + escapeHtml(announcements[i].ID) + '">更新依頼</button>');
      }
      if (kind === "planned" && announcements[i].RequestType && adminActive && announcements[i].RequestStatus !== "反映確認済み") {
        html.push('<button type="button" class="button button-small approve-request-button" data-id="' + escapeHtml(announcements[i].ID) + '">' + (announcements[i].RequestStatus === "公開待ち" ? "公開待ちを解除" : "公開待ちにする") + '</button>');
      }
      if (kind === "published" && adminActive && !announcements[i].PublicState) {
        html.push(" <button type=\"button\" class=\"button button-small move-button return-button\" data-list=\"published\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">予定へ差し戻し</button>");
      }
      if (!canOperate && !adminActive && !(kind === "published" && DataService.canManageAnnouncement(announcements[i], "planned", adminActive))) {
        html.push("—");
      }
      html.push("</td>");
      html.push("<td class=\"operation-date-cell\">" + escapeHtml(announcements[i].OperationDate || "—") + "</td>");
      if (kind === "planned") {
        html.push("<td class=\"author-cell\">" + escapeHtml(announcements[i].AuthorName || (announcements[i].AuthorId ? "ID: " + announcements[i].AuthorId : "不明")) + "</td>");
        html.push("<td class=\"operation-date-cell\">" + escapeHtml(postingDateText(announcements[i].Created)) + "</td>");
      }
      html.push('<td class="status-cell">' + escapeHtml(announcements[i].RequestStatus || (kind === "published" ? PublicationWorkflow.state(announcements[i]) : announcements[i].Status)));
      if (announcements[i].RequestType) { html.push('<br><small>' + escapeHtml(announcements[i].RequestType) + ' ／ 元公告 ' + escapeHtml(announcements[i].TargetID) + '</small>'); }
      if (kind === "published" && PublicationWorkflow.due(announcements[i])) { html.push('<br><strong class="due-notice">掲載終了の確認対象</strong>'); }
      html.push('</td>');
      html.push("<td><span class=\"" + categoryClass + "\">" + escapeHtml(announcements[i].Category) + "</span></td>");
      html.push("<td class=\"garrison-cell\">" + escapeHtml(announcements[i].Garrison) + "</td>");
      html.push("<td class=\"subject-cell\"><ul class=\"link-list\">");
      for (j = 0; j < links.length; j += 1) {
        html.push("<li><a href=\"" + escapeHtml(DataService.getPublicLinkUrl(links[j].URL)) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(links[j].Text) + "</a></li>");
      }
      if (!links.length) {
        html.push("<li>（PDF未登録）</li>");
      }
      html.push("</ul></td>");
      html.push("<td>" + escapeHtml(announcements[i].BidDate) + "</td>");
      html.push("<td class=\"remarks-cell\">" + escapeHtml(announcements[i].Remarks) + "</td>");
      html.push("</tr>");
    }
    listElement.innerHTML = html.join("");
    bindRowActions();
  }

  function render(announcements) {
    renderList("published", announcements || allAnnouncements);
  }

  function bindRowActions() {
    var requestButtons = document.getElementsByClassName("request-button"), approveButtons = document.getElementsByClassName("approve-request-button"), n;
    for (n = 0; n < requestButtons.length; n += 1) { requestButtons[n].onclick = openPublicationRequest; }
    for (n = 0; n < approveButtons.length; n += 1) { approveButtons[n].onclick = approvePublicationRequest; }
    var editButtons = document.getElementsByClassName("edit-button");
    var deleteButtons = document.getElementsByClassName("delete-button");
    var publishButtons = document.getElementsByClassName("publish-button");
    var returnButtons = document.getElementsByClassName("return-button");
    var orderUpButtons = document.getElementsByClassName("order-up-button");
    var orderDownButtons = document.getElementsByClassName("order-down-button");
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
    for (i = 0; i < orderUpButtons.length; i += 1) {
      orderUpButtons[i].onclick = moveAnnouncementOrder;
    }
    for (i = 0; i < orderDownButtons.length; i += 1) {
      orderDownButtons[i].onclick = moveAnnouncementOrder;
    }
  }

  function beginEdit() {
    if (workflowBusy) { return; }
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var announcement = announcementById(this.getAttribute("data-id"), state.announcements);
    var links;
    if (!DataService.canManageAnnouncement(announcement, kind, adminActive)) {
      return;
    }
    if (!announcement) {
      return;
    }
    if (announcement.RequestType) { openPublicationRequest.call(this); return; }
    editingList = kind;
    links = linksFor(announcement.ID, state.links);
    byId("announcement-id").value = announcement.ID;
    byId("category-input").value = announcement.Category;
    byId("garrison-input").value = announcement.Garrison;
    byId("date-input").value = announcement.BidDate;
    syncDatePicker();
    byId("status-input").value = announcement.Status || "公告登録";
    byId("remarks-input").value = announcement.Remarks;
    var rowIndex;
    for (rowIndex = 0; rowIndex < PDF_ROW_COUNT; rowIndex += 1) {
      pdfInput("link-text-input", rowIndex).value = links.length > rowIndex ? links[rowIndex].Text : "";
      pdfInput("link-url-input", rowIndex).value = links.length > rowIndex ? links[rowIndex].URL : "";
    }
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
    updatePdfLinks();
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

  function persistAnnouncement(kind, announcement, links, isNew, selectedFiles) {
    var payload = { Category: announcement.Category, Garrison: announcement.Garrison, BidDate: announcement.BidDate, Remarks: announcement.Remarks, Sort: announcement.Sort, Status: announcement.Status, OperationDate: announcement.OperationDate };
    PublicationWorkflow.fields.forEach(function (field) { payload[field] = announcement[field] || ""; });
    payload.ListKind = kind;
    var itemId = announcement.Id || announcement.ID;
    var i;
    if (!DataService.isSharePoint()) {
      return;
    }
    function saveLinks(savedAnnouncement) {
      var savedId = savedAnnouncement && (savedAnnouncement.Id || savedAnnouncement.ID);
      if (savedId) { announcement.Id = savedId; }
      if (savedAnnouncement && savedAnnouncement.Created) { announcement.Created = savedAnnouncement.Created; }
      var link;
      var linkPayload;
      var selectedFile;
      for (i = 0; i < links.length; i += 1) {
        link = links[i];
        linkPayload = { KokokuID: savedId || announcement.ID, Text: link.Text, FileName: link.FileName, URL: link.URL, Type: link.Type, Sort: link.Sort };
        selectedFile = selectedFiles[pdfKey(kind, link.ID)];
        if (link.Id) {
          DataService.update("links", link.Id, linkPayload, function () {}, function () {
            byId("form-message").innerHTML = "公告は保存しましたが、リンクの更新に失敗しました。";
          });
        } else {
          DataService.add("links", linkPayload, (function (savedLink) {
            return function (result) { if (result) { savedLink.Id = result.Id || result.ID; } };
          }(link)), function () {
            byId("form-message").innerHTML = "公告は保存しましたが、リンクの保存に失敗しました。";
          });
        }
        if (selectedFile) {
          DataService.uploadPdf(selectedFile, link.FileName || fileNameFromUrl(link.URL) || selectedFile.name, function () {}, function () {
            byId("form-message").innerHTML = "公告は保存しましたが、PDFのアップロードに失敗しました。";
          });
        }
      }
      byId("form-message").innerHTML = "SharePointへ公告とリンクを保存しました。";
    }
    if (isNew) {
      DataService.add("announcements", payload, saveLinks, function () {
        byId("form-message").innerHTML = "SharePointへの公告保存に失敗しました。";
      });
    } else {
      DataService.update("announcements", itemId, payload, function () { saveLinks(announcement); }, function () {
        byId("form-message").innerHTML = "SharePointへの公告更新に失敗しました。";
      });
    }
  }

  function saveAnnouncement(event) {
    if (workflowBusy) { if (event) { event.preventDefault(); } return false; }
    var id = byId("announcement-id").value;
    var targetKind = id ? editingList : "planned";
    var state = listState(targetKind);
    var announcement = announcementById(id, state.announcements);
    var links;
    var linkRecords = [];
    var removedLinks = [];
    var selectedFiles = {};
    var text;
    var url;
    var fileInput;
    var file;
    var link;
    var i;
    var isNew = !announcement;
    if (event) {
      event.preventDefault();
    }
    if (!DataService.getCurrentUser() || (id && (!announcement || !DataService.canManageAnnouncement(announcement, targetKind, adminActive)))) {
      byId("form-message").innerHTML = "この投稿を修正する権限がありません。";
      return false;
    }
    if (!isAllowed(byId("category-input").value, ALLOWED_CATEGORIES)) {
      byId("form-message").innerHTML = "区分はNEW、空白、結果のいずれかを選択してください。";
      return false;
    }
    if (!isAllowed(byId("garrison-input").value, ALLOWED_GARRISONS)) {
      byId("form-message").innerHTML = "駐屯地は一覧から選択してください。";
      return false;
    }
    if (byId("status-input").value === "結果登録" || byId("status-input").value === "入札終了登録") {
      byId("form-message").textContent = "公告リストの「掲載終了・結果登録」から元の公告を選んで依頼してください。";
      return false;
    }
    if (!isAllowed(byId("status-input").value, adminActive ? ALLOWED_STATUSES : REGISTRANT_STATUSES)) {
      byId("form-message").innerHTML = adminActive ? "状態は一覧から選択してください。" : "登録者は公告登録、内容修正、入札終了登録、結果登録から選択してください。";
      return false;
    }
    for (i = 0; i < PDF_ROW_COUNT; i += 1) {
      text = pdfInput("link-text-input", i).value.trim();
      url = pdfInput("link-url-input", i).value.trim();
      if (text && !url) {
        updatePdfLinks();
        byId("form-message").innerHTML = "PDFリンクを作成中です。少し待ってから保存してください。";
        return false;
      }
      if (text) {
        linkRecords.push({ rowIndex: i, text: text, url: url });
      }
    }
    if (!byId("date-input").value || !linkRecords.length) {
      byId("form-message").innerHTML = "駐屯地、入札日、PDF表示名を1件以上入力してください。";
      return false;
    }
    if (!/^R[1-9][0-9]*\.(?:[1-9]|1[0-2])\.(?:[1-9]|[12][0-9]|3[01])$/.test(byId("date-input").value)) {
      byId("form-message").innerHTML = "入札日はR8.8.10形式で入力してください。";
      return false;
    }
    if (!announcement) {
      id = nextId(state.announcements);
      announcement = { ID: id, AuthorId: DataService.getCurrentUser().id, AuthorName: DataService.getCurrentUser().name, Created: new Date().toISOString(), Sort: String(state.announcements.length + 1), Status: "公告登録", OperationDate: "" };
      state.announcements.unshift(announcement);
    }
    announcement.Category = byId("category-input").value;
    announcement.Garrison = byId("garrison-input").value;
    announcement.BidDate = byId("date-input").value;
    announcement.Status = byId("status-input").value;
    announcement.Remarks = byId("remarks-input").value;
    announcement.OperationDate = operationDateText();
    announcement.ListKind = targetKind;
    links = linksFor(id, state.links);
    for (i = 0; i < linkRecords.length; i += 1) {
      linkRecords[i].link = links[i] || { ID: nextLinkId(state.links), KokokuID: id, Type: "公告" };
      link = linkRecords[i].link;
      link.Text = linkRecords[i].text;
      link.URL = linkRecords[i].url;
      link.FileName = fileNameFromUrl(link.URL);
      link.Sort = String(i + 1);
      if (!links[i]) {
        state.links.push(link);
      }
      fileInput = pdfInput("pdf-file-input", linkRecords[i].rowIndex);
      file = fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
      if (file) {
        selectedFiles[pdfKey(targetKind, link.ID)] = file;
        selectedPdfFiles[pdfKey(targetKind, link.ID)] = file;
      }
    }
    for (i = links.length - 1; i >= linkRecords.length; i -= 1) {
      removedLinks.push(links[i]);
      delete selectedPdfFiles[pdfKey(targetKind, links[i].ID)];
      state.links.splice(state.links.indexOf(links[i]), 1);
      if (DataService.isSharePoint()) {
        DataService.remove("links", links[i].Id || links[i].ID, function () {}, function () {});
      }
    }
    links = [];
    for (i = 0; i < linkRecords.length; i += 1) {
      links.push(linkRecords[i].link);
    }
    if (targetKind === "planned") {
      i = state.announcements.indexOf(announcement);
      if (i > 0) {
        state.announcements.splice(i, 1);
        state.announcements.unshift(announcement);
      }
      preservePlannedOrder = true;
    }
    clearForm();
    filterAnnouncements();
    byId("form-message").innerHTML = DataService.isSharePoint() ? "SharePointへ保存しています..." : "公告を保存しました（CSVモードのメモリ上）。";
    persistAnnouncement(targetKind, announcement, links, isNew, selectedFiles);
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
    if (workflowBusy) { return; }
    var id = this.getAttribute("data-id");
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var i;
    var announcement = announcementById(id, state.announcements);
    var deletedLinks;
    if (!DataService.canManageAnnouncement(announcement, kind, adminActive)) {
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
    if (workflowBusy) { return; }
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

  function moveAnnouncementOrder() {
    if (workflowBusy) { return; }
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var id = this.getAttribute("data-id");
    var index = -1;
    var nextIndex;
    var i;
    var temporary;
    if (!adminActive) {
      return;
    }
    for (i = 0; i < state.announcements.length; i += 1) {
      if (String(state.announcements[i].ID) === String(id)) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return;
    }
    nextIndex = this.className.indexOf("order-up-button") >= 0 ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= state.announcements.length) {
      return;
    }
    temporary = state.announcements[index];
    state.announcements[index] = state.announcements[nextIndex];
    state.announcements[nextIndex] = temporary;
    temporary.OperationDate = operationDateText();
    if (kind === "published") {
      preserveAnnouncementOrder = true;
    } else {
      preservePlannedOrder = true;
    }
    filterAnnouncements();
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
    byId("planned-announcement-list").innerHTML = '<tr><td colspan="11" class="empty-row">データを表示できません。</td></tr>';
    byId("announcement-list").innerHTML = '<tr><td colspan="9" class="empty-row">データを表示できません。</td></tr>';
  }

  function applyLoadedData(data) {
    deactivateAdmin();
    preserveAnnouncementOrder = false;
    preservePlannedOrder = true;
    plannedAnnouncements = normalizeAnnouncements(data.announcements || []);
    plannedLinks = data.links || [];
    allAnnouncements = normalizeAnnouncements(data.publishedAnnouncements || []);
    allLinks = data.publishedLinks || [];
    allSettings = dateOnlySettings(data.settings || []);
    byId("database-input").value = data.database || "KOKOKU";
    byId("public-html-link").href = DataService.getPublicHtmlUrl();
    byId("data-mode-input").value = data.mode === "SHAREPOINT" ? "SHAREPOINT" : "CSV";
    var user = DataService.getCurrentUser();
    byId("current-user").textContent = (data.mode === "SHAREPOINT" ? "ログイン：" : "CSV仮ユーザー：") + (user ? user.name + "（" + user.id + "）" : "未確認");
    byId("database-apply").disabled = false;
    byId("data-mode-apply").disabled = false;
    byId("data-status").innerHTML = (data.databaseName || "公告DB") + " / " + (data.mode === "SHAREPOINT" ? "SharePointリスト" : "CSVモード") + " / 読み込み完了";
    filterAnnouncements();
    renderSettings();
  }

  function loadData() {
    if (workflowBusy) { return; }
    requestFiles = {};
    setHidden(byId("publication-request-panel"), true);
    deactivateAdmin();
    byId("database-apply").disabled = true;
    byId("data-mode-apply").disabled = true;
    DataService.load(applyLoadedData, function () {
      byId("database-apply").disabled = false;
      byId("data-mode-apply").disabled = false;
      showError();
    });
  }

  function switchDataMode() {
    if (workflowBusy) { return; }
    var mode = byId("data-mode-input").value;
    if (!DataService.setMode(mode)) {
      return;
    }
    byId("data-status").innerHTML = mode === "SHAREPOINT" ? "SharePointリストへ切替中..." : "CSVモードへ切替中...";
    loadData();
  }

  function switchDatabase() {
    if (workflowBusy) { return; }
    var database = byId("database-input").value;
    if (!DataService.setDatabase(database)) {
      return;
    }
    byId("data-status").innerHTML = "DBを切替中...";
    loadData();
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
    var user = DataService.getCurrentUser();
    if (!user || (DataService.isSharePoint() && !user.isAdmin)) {
      byId("admin-message").innerHTML = "管理者権限を確認できません。";
      return;
    }
    if (!DataService.isSharePoint() && byId("admin-password").value !== ADMIN_PASSWORD) {
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
    downloadCsv(DataService.getCsvFileName("publishedAnnouncements"), CsvData.toCsv(allAnnouncements, ["ID", "AuthorId", "AuthorName", "Created", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields)));
    byId("form-message").innerHTML = "公告CSVを出力しました。";
  }

  function exportPlannedAnnouncements() {
    downloadCsv(DataService.getCsvFileName("announcements"), CsvData.toCsv(plannedAnnouncements, ["ID", "AuthorId", "AuthorName", "Created", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields)));
    byId("form-message").innerHTML = "公告予定CSVを出力しました。";
  }

  function exportLinks() {
    downloadCsv(DataService.getCsvFileName("publishedLinks"), CsvData.toCsv(allLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "リンクCSVを出力しました。";
  }

  function exportPlannedLinks() {
    downloadCsv(DataService.getCsvFileName("links"), CsvData.toCsv(plannedLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "公告予定リンクCSVを出力しました。";
  }

  function exportSettings() {
    downloadCsv(DataService.getCsvFileName("settings"), CsvData.toCsv(allSettings, ["ID", "Type", "Text", "URL", "Sort"]));
    byId("form-message").innerHTML = "設定CSVを出力しました。";
  }

  function previewPage() {
    var data = publicationData();
    if (HtmlExport.openPreview(data.announcements, data.links, allSettings)) {
      byId("form-message").innerHTML = "公開ページプレビューを開きました。";
    }
  }

  function exportHtml() {
    var data = publicationData();
    var html = HtmlExport.create(data.announcements, data.links, allSettings);
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
    if (plannedAnnouncements.some(function (request) { return request.RequestStatus === "公開待ち" && request.ResultURL && !requestFiles[request.ID]; })) {
      byId("form-message").textContent = "公開待ちの結果PDFファイルが手元にありません。公開待ちを解除し、依頼の修正でPDFを選び直してください。";
      return;
    }
    var data = publicationData();
    var files = [{ name: "nafin/R8kokoku.html", content: HtmlExport.create(data.announcements, data.links, allSettings) }];
    plannedAnnouncements.forEach(function (request) { if (request.RequestStatus === "公開待ち" && request.ResultURL && requestFiles[request.ID]) { files.push({ name: "nafin/" + request.ResultURL, file: requestFiles[request.ID] }); } });
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
    if ((this && this.id === "sort-date" && preserveAnnouncementOrder) || (this && this.id === "sort-planned-date" && preservePlannedOrder)) {
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
    if (workflowBusy) { return; }
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
    if (workflowBusy) { return; }
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
    updatePdfLinks();
    byId("data-status").innerHTML = "テンプレート / SharePoint / CSV確認中...";
    loadData();
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
    byId("publication-request-form").onsubmit = submitPublicationRequest;
    byId("publication-request-cancel").onclick = function () { setHidden(byId("publication-request-panel"), true); };
    byId("published-check").onclick = verifyPublication;
    byId("import-source").onclick = importSource;
    byId("import-file").onclick = importFile;
    byId("setting-add").onclick = addSetting;
    byId("sort-date").onclick = toggleDateSort;
    byId("sort-planned-date").onclick = toggleDateSort;
    byId("admin-logout").onclick = deactivateAdmin;
    byId("database-apply").onclick = switchDatabase;
    byId("data-mode-apply").onclick = switchDataMode;
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
