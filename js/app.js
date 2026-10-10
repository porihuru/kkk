(function (global) {
  "use strict";

  var plannedAnnouncements = [];
  var plannedLinks = [];
  var allAnnouncements = [];
  var allLinks = [];
  var allSettings = [];
  var activeFiscalYear = calendarFiscalYear();
  var deletedAnnouncements = [];
  var dateSortDescending = false;
  var preserveAnnouncementOrder = false;
  var preservePlannedOrder = false;
  var editingList = "planned";
  var selectedPdfFiles = {};
  var filenameGenerationSequences = [];
  var resultWorkMode = false;
  var editingResultSourceId = "";
  var PDF_ROW_COUNT = 5;
  var workflowBusy = false;
  var unsaved = false;
  var formDirty = false;
  var pendingSave = null;
  function mayLeave() {
    return !workflowBusy && ((!unsaved && !Object.keys(selectedPdfFiles).length) || window.confirm("未保存の変更または選択PDFがあります。出力していない内容は失われます。切り替えますか？"));
  }
  function saveProgress(message, finished, retry) {
    var panel = byId("save-progress");
    if (!panel) { return; }
    panel.style.display = "block";
    byId("save-progress-message").textContent = message;
    byId("save-progress-close").style.display = finished ? "inline-block" : "none";
    byId("save-progress-close").onclick = function () { panel.style.display = "none"; };
    byId("save-progress-retry").style.display = retry ? "inline-block" : "none";
    byId("save-progress-retry").onclick = retry || null;
  }
  function runSave(tasks, done, progressTitle) {
    var index = 0;
    unsaved = true;
    function resume() {
      workflowBusy = true;
      byId("form-message").textContent = "SharePointへ保存中です...";
      function next() {
        if (index === tasks.length) {
          workflowBusy = false; pendingSave = null; unsaved = false;
          byId("retry-save").disabled = true; done();
          if (progressTitle) { saveProgress(progressTitle + "：完了しました（" + tasks.length + " / " + tasks.length + "件）。", true); }
          return;
        }
        if (progressTitle) { saveProgress(progressTitle + "：" + (tasks[index].phase || "保存中") + "　完了 " + index + " / " + tasks.length + "件。応答を待っています。画面を閉じずにお待ちください。", false); }
        var settled = false;
        function failed(failureMessage) {
          if (settled) { return; } settled = true;
          workflowBusy = false; pendingSave = resume;
          byId("retry-save").disabled = false;
          byId("form-message").textContent = typeof failureMessage === "string" ? failureMessage : "未保存：保存に失敗しました。変更は保持しています。「再保存」を押してください。競合時はCSVを退避して再読込してください。";
          if (progressTitle) { saveProgress(progressTitle + "：エラーで停止しています。完了 " + index + " / " + tasks.length + "件。" + byId("form-message").textContent, false, resume); }
        }
        try { tasks[index](function () { if (settled) { return; } settled = true; index += 1; next(); }, failed); }
        catch (error) { failed("処理に失敗しました：" + (error.message || String(error))); }
      }
      next();
    }
    resume();
  }

  var adminActive = false;
  var ADMIN_PASSWORD = "snk";
  var ALLOWED_CATEGORIES = ["NEW", "", "結果"];
  var ALLOWED_GARRISONS = ["札幌", "真駒内", "丘珠", "北千歳", "南恵庭", "北恵庭", "東千歳", "静内", "幌別", "函館", "倶知安", "美唄", "岩見沢", "滝川", "上富良野", "留萌", "旭川", "名寄", "稚内", "遠軽", "美幌", "帯広", "鹿追", "釧路", "別海"];
  var REGISTRANT_STATUSES = ["公告登録", "内容修正", "入札終了登録", "結果登録"];
  var ALLOWED_STATUSES = REGISTRANT_STATUSES.concat(["公告反映済", "結果反映済", "公開待ち"]);

  function byId(id) {
    return document.getElementById(id);
  }

  function fiscalYearForBidDate(value) {
    return PublicationWorkflow.fiscalYear(value);
  }

  function itemFiscalYear(item) {
    return PublicationWorkflow.itemFiscalYear(item);
  }

  function settingByType(type) {
    var i;
    for (i = 0; i < allSettings.length; i += 1) {
      if (allSettings[i].Type === type) { return allSettings[i]; }
    }
    return null;
  }

  function calendarFiscalYear(value) {
    var source = value && typeof value.getTime === "function" ? new Date(value.getTime()) : new Date();
    var japan = new Date(source.getTime() + 9 * 60 * 60 * 1000);
    var reiwaYear = japan.getUTCFullYear() - 2018;
    if (japan.getUTCMonth() < 3) { reiwaYear -= 1; }
    return "R" + reiwaYear;
  }

  function fiscalYearMismatchMessage(year) {
    if (!year) { return "入札日が正しい日付ではありません。実在する日付を入力してください。保存は行っていません。"; }
    return "入札日は" + (year || "判定できない") + "年度です。現在の作業年度は" + activeFiscalYear + "年度です。上部メニューを" + (year || "正しい年度") + "へ切り替えるか、入札日を修正してください。保存は行っていません。";
  }

  function requireActiveFiscalYear(year) {
    if (year && year === activeFiscalYear) { return true; }
    byId("form-message").textContent = fiscalYearMismatchMessage(year);
    return false;
  }

  function updateFiscalYearUi() {
    var select = byId("fiscal-year-input");
    select.innerHTML = ["R8", "R9", "R10", "R11", "R12"].map(function (year) { return '<option value="' + year + '">' + year + '年度</option>'; }).join("");
    select.value = activeFiscalYear;
    byId("active-fiscal-year").textContent = "作業年度：" + activeFiscalYear;
    byId("public-html-link").href = DataService.getPublicHtmlUrl(activeFiscalYear);
    byId("public-html-link").textContent = activeFiscalYear + "年度の公開HTMLを確認";
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

  function validPdfFile(file, purpose) {
    if (!file) { return true; }
    if (global.Diagnostics && global.Diagnostics.checkPdfFile) {
      return global.Diagnostics.checkPdfFile(file, purpose);
    }
    return /\.pdf$/i.test(String(file.name || "")) && !(typeof file.size === "number" && file.size === 0);
  }

  function updatePdfLink(rowIndex) {
    if (resultWorkMode) { return; }
    var title = pdfInput("link-text-input", rowIndex).value.trim();
    var garrison = byId("garrison-input").value;
    var sequence = (filenameGenerationSequences[rowIndex] || 0) + 1;
    var fiscalYear = fiscalYearForBidDate(byId("date-input").value) || activeFiscalYear;
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
      pdfInput("link-url-input", rowIndex).value = DataService.getPublicationConfig(fiscalYear).pdfRoot.replace(/^\/+|\/+$/g, "") + "/" + result.fileName;
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
        pdfInput("pdf-file-input", rowIndex).onchange = function () {
          var file = this.files && this.files.length ? this.files[0] : null;
          if (file && !validPdfFile(file, resultWorkMode ? "結果PDF" : "公告PDF")) {
            byId("form-message").textContent = "選択したPDFを保存できません。右上の「診断」で内容を確認してください。";
          }
          if (resultWorkMode) { updateResultPdfLink(rowIndex); }
        };
        byId("pdf-file-clear-" + (rowIndex + 1)).onclick = function () { clearResultPdf(rowIndex); };
      }(i));
    }
  }

  function resultPdfUrl(fileName) {
    var source = announcementById(editingResultSourceId, allAnnouncements);
    var fiscalYear = source ? itemFiscalYear(source) : fiscalYearForBidDate(byId("date-input").value);
    var root = DataService.getPublicationConfig(fiscalYear).pdfRoot || "R8/be";
    return String(root).replace(/^\/+|\/+$/g, "") + "/" + fileName;
  }

  function updateResultPdfLink(rowIndex) {
    var input = pdfInput("pdf-file-input", rowIndex);
    var file = input.files && input.files.length ? input.files[0] : null;
    var sequence = (filenameGenerationSequences[rowIndex] || 0) + 1;
    filenameGenerationSequences[rowIndex] = sequence;
    if (!file) { clearResultPdf(rowIndex); return; }
    if (!validPdfFile(file, "結果PDF")) {
      byId("form-message").textContent = "選択した結果PDFを保存できません。右上の「診断」で内容を確認してください。";
      return;
    }
    FilenameGenerator.generate({ title: pdfInput("link-text-input", rowIndex).value, garrison: byId("garrison-input").value, category: "NEW", date: bidDateAsDate() }, function (result) {
      var name;
      if (sequence !== filenameGenerationSequences[rowIndex]) { return; }
      name = result.fileName.replace(/\.pdf$/i, "_kk.pdf");
      pdfInput("link-url-input", rowIndex).value = resultPdfUrl(name);
      byId("form-message").textContent = "結果PDFを選択しました。";
    }, function () {
      if (sequence !== filenameGenerationSequences[rowIndex]) { return; }
      input.value = "";
      byId("form-message").textContent = "結果PDFのファイル名を作成できません。";
    });
  }

  function clearResultPdf(rowIndex) {
    if (!resultWorkMode) { return; }
    filenameGenerationSequences[rowIndex] = (filenameGenerationSequences[rowIndex] || 0) + 1;
    pdfInput("pdf-file-input", rowIndex).value = "";
    if (pdfInput("link-text-input", rowIndex).value) {
      var source = announcementById(editingResultSourceId, allAnnouncements);
      pdfInput("link-url-input", rowIndex).value = DataService.getPublicationConfig(source ? itemFiscalYear(source) : activeFiscalYear).endedUrl;
    }
    byId("form-message").textContent = "結果PDFを削除し、掲載終了PDFへ戻しました。";
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
    if (value === "公開待ち") { return value; }
    if (value === "下書き") {
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
      item.FiscalYear = fiscalYearForBidDate(item.BidDate) || item.FiscalYear || "";
      result.push(item);
    }
    return result;
  }

  function listState(kind) {
    return kind === "planned" ? { announcements: plannedAnnouncements, links: plannedLinks } : { announcements: allAnnouncements, links: allLinks };
  }

  function isResultWork(item) {
    return item && item.WorkType === "RESULT";
  }

  function resultWorkBySource(sourceId, includeVirtual) {
    var i;
    for (i = 0; i < plannedAnnouncements.length; i += 1) {
      if (isResultWork(plannedAnnouncements[i]) && String(plannedAnnouncements[i].SourceAnnouncementID) === String(sourceId) && (includeVirtual || !plannedAnnouncements[i]._virtualResult)) {
        return plannedAnnouncements[i];
      }
    }
    return null;
  }

  function sourceHasPublishedResult(source) {
    var links = linksFor(source.ID, allLinks);
    var i;
    if (source.ResultSubmittedAt) { return true; }
    for (i = 0; i < links.length; i += 1) {
      if (links[i].Type === "結果") { return true; }
    }
    return false;
  }

  function syncVirtualResultWork() {
    var keptAnnouncements = [];
    var keptLinks = [];
    var i;
    var j;
    var source;
    var sourceLinks;
    var task;
    for (i = 0; i < plannedAnnouncements.length; i += 1) {
      if (!plannedAnnouncements[i]._virtualResult) { keptAnnouncements.push(plannedAnnouncements[i]); }
    }
    for (i = 0; i < plannedLinks.length; i += 1) {
      if (!plannedLinks[i]._virtualResult) { keptLinks.push(plannedLinks[i]); }
    }
    plannedAnnouncements = keptAnnouncements;
    plannedLinks = keptLinks;
    for (i = 0; i < allAnnouncements.length; i += 1) {
      source = allAnnouncements[i];
      if (PublicationWorkflow.state(source) !== "掲載終了" || sourceHasPublishedResult(source) || resultWorkBySource(source.ID, false)) { continue; }
      task = {
        ID: "result-" + source.ID,
        AuthorId: "",
        AuthorName: "未担当",
        Created: "",
        Category: "結果",
        Garrison: source.Garrison,
        BidDate: source.BidDate,
        FiscalYear: itemFiscalYear(source),
        Remarks: source.Remarks,
        Sort: String(plannedAnnouncements.length + 1),
        Status: "結果作業",
        OperationDate: "",
        ListKind: "planned",
        WorkType: "RESULT",
        SourceAnnouncementID: String(source.ID),
        WorkflowKey: "RESULT:" + source.ID,
        _virtualResult: true
      };
      plannedAnnouncements.push(task);
      sourceLinks = linksFor(source.ID, allLinks);
      for (j = 0; j < sourceLinks.length; j += 1) {
        var endedUrl = DataService.getPublicationConfig(itemFiscalYear(source)).endedUrl;
        plannedLinks.push({ ID: "result-link-" + source.ID + "-" + j, KokokuID: task.ID, Text: sourceLinks[j].Text, FileName: fileNameFromUrl(endedUrl), URL: endedUrl, Type: "掲載終了", Sort: String(j + 1), _virtualResult: true });
      }
    }
  }

  function setResultFormMode(active) {
    var i;
    resultWorkMode = active;
    byId("category-input").disabled = active;
    byId("garrison-input").disabled = active;
    byId("date-input").readOnly = active;
    byId("date-picker-button").disabled = active;
    byId("date-picker-input").disabled = active;
    byId("status-input").disabled = active;
    for (i = 0; i < PDF_ROW_COUNT; i += 1) {
      pdfInput("link-text-input", i).readOnly = active;
      byId("pdf-file-clear-" + (i + 1)).className = active ? "button button-small button-secondary result-file-clear" : "button button-small button-secondary result-file-clear hidden";
    }
    if (!active) { editingResultSourceId = ""; }
  }

  function publicationData(fiscalYear) {
    var year = fiscalYear || activeFiscalYear;
    var announcements = allAnnouncements.filter(function (item) { return itemFiscalYear(item) === year; });
    var ids = {};
    var links;
    announcements.forEach(function (item) { ids[String(item.ID)] = true; });
    links = allLinks.filter(function (link) { return ids[String(link.KokokuID)] === true; });
    return PublicationWorkflow.candidate(announcements, links, DataService.getPublicationConfig(year).endedUrl);
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
      unsaved = true;
      success();
    }
  }

  function verifyPublication() {
    if (!adminActive || workflowBusy || pendingSave) { return; }
    var file = byId("published-check-file").files[0];
    if (!file) { byId("published-check-message").textContent = "公開サイトから取得したHTMLを選択してください。"; return; }
    workflowBusy = true;
    function fail(message) { workflowBusy = false; byId("published-check-message").textContent = message || "反映記録の保存に失敗しました。再読込して状態を確認してください。"; }
    HtmlImport.readFile(file, function (source) {
      var expected;
      try {
        expected = publicationData(activeFiscalYear);
        if (PublicationWorkflow.signature(expected, DataService.getPublicLinkUrl) !== PublicationWorkflow.signature(HtmlImport.parse(source), DataService.getPublicLinkUrl)) { fail("公開予定とHTMLが一致しません。反映済みにはしていません。"); return; }
      } catch (error) { fail(error.message); return; }
      var verifiedItems = allAnnouncements.filter(function (item) { return itemFiscalYear(item) === activeFiscalYear; });
      var index = 0, timestamp = new Date().toISOString();
      function next() {
        if (index === verifiedItems.length) { workflowBusy = false; filterAnnouncements(); byId("published-check-message").textContent = activeFiscalYear + "年度の公開HTMLとの一致を確認しました。"; return; }
        saveWorkflowItem(verifiedItems[index++], { VerifiedAt: timestamp }, next, function () { fail(); });
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

  function linkById(linkId, sourceLinks) {
    var i;
    for (i = 0; i < sourceLinks.length; i += 1) {
      if (String(sourceLinks[i].ID) === String(linkId)) { return sourceLinks[i]; }
    }
    return null;
  }

  function previewPdf() {
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var link = linkById(this.getAttribute("data-link-id"), state.links);
    var previewType = this.getAttribute("data-preview-type") || (link && link.Type) || "";
    var previewUrl = this.getAttribute("data-preview-url") || (link && link.URL) || "";
    var file = link && previewType !== "掲載終了" ? selectedPdfFiles[pdfKey(kind, link.ID)] : null;
    var url;
    var opened;
    if (!link) {
      byId("form-message").textContent = "確認するPDFの情報が見つかりません。再読込してください。";
      return;
    }
    if (file && global.navigator.msSaveOrOpenBlob) {
      global.navigator.msSaveOrOpenBlob(file, link.FileName || file.name || "document.pdf");
      byId("form-message").textContent = "選択中のPDFを開きました。";
      return;
    }
    if (file) {
      if (!global.URL || !global.URL.createObjectURL) {
        byId("form-message").textContent = "このブラウザーでは選択中のPDFを確認できません。";
        return;
      }
      url = global.URL.createObjectURL(file);
      opened = global.open(url, "_blank");
      if (!opened) {
        global.URL.revokeObjectURL(url);
        byId("form-message").textContent = "PDFを開けません。ポップアップを許可してください。";
        return;
      }
      global.setTimeout(function () { global.URL.revokeObjectURL(url); }, 60000);
    } else {
      url = DataService.isSharePoint() && previewType !== "掲載終了" ? DataService.getPdfPreviewUrl(previewUrl, link.FileName) : DataService.getPublicLinkUrl(previewUrl);
      if (!url) {
        byId("form-message").textContent = "PDFの保存先を確認できません。PDFを選択するか、設定を確認してください。";
        return;
      }
      opened = global.open(url, "_blank");
      if (!opened) {
        byId("form-message").textContent = "PDFを開けません。ポップアップを許可してください。";
        return;
      }
    }
    try { opened.opener = null; } catch (ignore) {}
    byId("form-message").textContent = "PDFを別画面で開きました。";
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
    var statusText;

    if (!((kind === "published" && preserveAnnouncementOrder) || (kind === "planned" && preservePlannedOrder))) {
      state.announcements.sort(compareAnnouncements);
      announcements.sort(compareAnnouncements);
    }
    var displayedIds = announcements.map(function (item) { return String(item.ID); });
    var linkCount = state.links.filter(function (item) { return displayedIds.indexOf(String(item.KokokuID)) >= 0; }).length;
    countElement.textContent = "公告 " + announcements.length + "件（リンク " + linkCount + "件）";
    if (!announcements.length) {
      listElement.innerHTML = '<tr><td colspan="' + (kind === "planned" ? "12" : "10") + '" class="empty-row">該当する公告はありません。</td></tr>';
      return;
    }

    for (i = 0; i < announcements.length; i += 1) {
      canOperate = DataService.canManageAnnouncement(announcements[i], kind, adminActive);
      links = linksFor(announcements[i].ID, state.links);
      if (kind === "published" && announcements[i].PublicState && announcements[i].PublicState !== "公告掲載中") {
        try { links = PublicationWorkflow.candidate([announcements[i]], links, DataService.getPublicationConfig(itemFiscalYear(announcements[i])).endedUrl).links; } catch (error) { links = []; }
      }
      categoryClass = announcements[i].Category === "NEW" ? "category" : "category category-change";
      upDisabled = i === 0 ? " disabled" : "";
      downDisabled = i === announcements.length - 1 ? " disabled" : "";
      html.push("<tr>");
      html.push("<td class=\"id-cell\">");
      if (adminActive && !announcements[i]._virtualResult) {
        html.push("<span class=\"order-controls\"><button type=\"button\" class=\"button order-button order-up-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\" aria-label=\"上へ移動\"" + upDisabled + ">↑</button><button type=\"button\" class=\"button order-button order-down-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\" aria-label=\"下へ移動\"" + downDisabled + ">↓</button></span>");
      }
      html.push('<span title="管理ID: ' + escapeHtml(announcements[i].ID) + '">' + (announcements.length - i) + '</span><br><small class="management-id">ID: ' + escapeHtml(announcements[i].ID) + '</small></td>');
      html.push("<td class=\"year-cell\">" + escapeHtml(itemFiscalYear(announcements[i]) || "不明") + "</td>");
      html.push("<td class=\"actions\">");
      if (canOperate && !isResultWork(announcements[i])) {
        html.push("<button type=\"button\" class=\"button button-small edit-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">修正</button> <button type=\"button\" class=\"button button-small button-danger delete-button\" data-list=\"" + kind + "\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">削除</button>");
      }
      if (kind === "planned" && isResultWork(announcements[i])) {
        html.push("<button type=\"button\" class=\"button button-small result-work-button\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">結果作業</button>");
      }
      if (kind === "planned" && adminActive && !announcements[i]._virtualResult) {
        html.push(" <button type=\"button\" class=\"button button-small move-button publish-button\" data-list=\"planned\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">本リストへ登録</button>");
      }
      if (kind === "published" && adminActive && !announcements[i].PublicState) {
        html.push(" <button type=\"button\" class=\"button button-small move-button return-button\" data-list=\"published\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">予定へ差し戻し</button>");
      }
      if (kind === "published" && adminActive && PublicationWorkflow.state(announcements[i]) !== "掲載終了") {
        html.push(" <button type=\"button\" class=\"button button-small button-secondary end-publication-button\" data-id=\"" + escapeHtml(announcements[i].ID) + "\">掲載終了</button>");
      }
      if (!canOperate && !adminActive && !isResultWork(announcements[i])) {
        html.push("—");
      }
      html.push("</td>");
      html.push("<td class=\"operation-date-cell\">" + escapeHtml(announcements[i].OperationDate || "—") + "</td>");
      if (kind === "planned") {
        html.push("<td class=\"author-cell\">" + escapeHtml(announcements[i].AuthorName || (announcements[i].AuthorId ? "ID: " + announcements[i].AuthorId : "不明")) + "</td>");
        html.push("<td class=\"operation-date-cell\">" + escapeHtml(postingDateText(announcements[i].Created)) + "</td>");
      }
      statusText = kind === "published" ? (announcements[i].Status === "公開待ち" && PublicationWorkflow.state(announcements[i]) !== "掲載終了" ? "公開待ち" : PublicationWorkflow.state(announcements[i])) : announcements[i].Status;
      html.push('<td class="status-cell">' + escapeHtml(statusText));
      if (kind === "published" && announcements[i].Status === "公開待ち" && PublicationWorkflow.state(announcements[i]) === "掲載終了") { html.push('<br><small>ZIP未作成</small>'); }
      if (kind === "published" && PublicationWorkflow.due(announcements[i])) { html.push('<br><strong class="due-notice">掲載終了の確認対象</strong>'); }
      html.push('</td>');
      html.push("<td><span class=\"" + categoryClass + "\">" + escapeHtml(announcements[i].Category) + "</span></td>");
      html.push("<td class=\"garrison-cell\">" + escapeHtml(announcements[i].Garrison) + "</td>");
      html.push("<td class=\"subject-cell\"><ul class=\"link-list\">");
      for (j = 0; j < links.length; j += 1) {
        html.push("<li><a href=\"" + escapeHtml(DataService.getPublicLinkUrl(links[j].URL)) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(links[j].Text) + "</a> <button type=\"button\" class=\"button button-small button-secondary pdf-preview-button\" data-list=\"" + kind + "\" data-link-id=\"" + escapeHtml(links[j].ID) + "\" data-preview-url=\"" + escapeHtml(links[j].URL) + "\" data-preview-type=\"" + escapeHtml(links[j].Type) + "\" aria-label=\"" + escapeHtml(links[j].Text + "のPDFを確認") + "\">PDF確認</button></li>");
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
    var editButtons = document.getElementsByClassName("edit-button");
    var deleteButtons = document.getElementsByClassName("delete-button");
    var publishButtons = document.getElementsByClassName("publish-button");
    var returnButtons = document.getElementsByClassName("return-button");
    var orderUpButtons = document.getElementsByClassName("order-up-button");
    var orderDownButtons = document.getElementsByClassName("order-down-button");
    var pdfPreviewButtons = document.getElementsByClassName("pdf-preview-button");
    var endPublicationButtons = document.getElementsByClassName("end-publication-button");
    var resultWorkButtons = document.getElementsByClassName("result-work-button");
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
    for (i = 0; i < pdfPreviewButtons.length; i += 1) {
      pdfPreviewButtons[i].onclick = previewPdf;
    }
    for (i = 0; i < endPublicationButtons.length; i += 1) {
      endPublicationButtons[i].onclick = endPublication;
    }
    for (i = 0; i < resultWorkButtons.length; i += 1) {
      resultWorkButtons[i].onclick = beginResultWork;
    }
  }

  function beginEdit() {
    if (workflowBusy || pendingSave) { return; }
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

  function beginResultWork() {
    if (workflowBusy || pendingSave) { return; }
    var task = announcementById(this.getAttribute("data-id"), plannedAnnouncements);
    var source;
    var links;
    var rowIndex;
    if (!task || !isResultWork(task) || !DataService.getCurrentUser()) { return; }
    if (!task._virtualResult && !DataService.canManageAnnouncement(task, "planned", adminActive)) {
      byId("form-message").textContent = "この結果は別のユーザーが保存済みです。修正は結果投稿者または管理者が行ってください。";
      return;
    }
    source = announcementById(task.SourceAnnouncementID, allAnnouncements);
    if (!source) {
      byId("form-message").textContent = "コピー元の公告が見つかりません。再読込してください。";
      return;
    }
    if (!requireActiveFiscalYear(itemFiscalYear(source))) { return; }
    links = linksFor(task.ID, plannedLinks);
    editingList = "planned";
    editingResultSourceId = String(source.ID);
    setResultFormMode(true);
    byId("announcement-id").value = task.ID;
    byId("category-input").value = "結果";
    byId("garrison-input").value = source.Garrison;
    byId("date-input").value = source.BidDate;
    syncDatePicker();
    byId("status-input").value = "結果登録";
    byId("remarks-input").value = task.Remarks || source.Remarks || "";
    for (rowIndex = 0; rowIndex < PDF_ROW_COUNT; rowIndex += 1) {
      pdfInput("link-text-input", rowIndex).value = links.length > rowIndex ? links[rowIndex].Text : "";
      pdfInput("link-url-input", rowIndex).value = links.length > rowIndex ? links[rowIndex].URL : "";
      pdfInput("pdf-file-input", rowIndex).disabled = rowIndex >= links.length;
      byId("pdf-file-clear-" + (rowIndex + 1)).className = rowIndex < links.length ? "button button-small button-secondary result-file-clear" : "button button-small button-secondary result-file-clear hidden";
    }
    byId("editor-title").innerHTML = "結果作業";
    byId("cancel-edit").className = "button button-secondary";
    byId("form-message").innerHTML = "結果PDFを選択して保存してください。";
    if (byId("announcement-form").scrollIntoView) { byId("announcement-form").scrollIntoView(); }
  }

  function clearForm() {
    formDirty = false;
    setResultFormMode(false);
    byId("announcement-form").reset();
    var rowIndex;
    for (rowIndex = 0; rowIndex < PDF_ROW_COUNT; rowIndex += 1) { pdfInput("pdf-file-input", rowIndex).disabled = false; }
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

  function persistAnnouncement(kind, announcement, links, isNew, selectedFiles, removedLinks) {
    unsaved = true;
    if (!DataService.isSharePoint()) { return; }
    var payload = {}, tasks = [];
    ["Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields).forEach(function (key) { payload[key] = announcement[key] || ""; });
    payload.ListKind = kind;
    links.forEach(function (link) {
      var file = selectedFiles[pdfKey(kind, link.ID)] || selectedPdfFiles[pdfKey(kind, link.ID)];
      if (file) { tasks.push(function (ok, fail) { DataService.uploadPdf(file, link.FileName || fileNameFromUrl(link.URL), ok, fail, isResultWork(announcement) ? "結果PDF" : "公告PDF", itemFiscalYear(announcement)); }); }
    });
    tasks.push(function (ok, fail) {
      if (isNew && !announcement.Id) {
        DataService.add("announcements", payload, function (saved) {
          announcement.Id = saved.Id || saved.ID; announcement.ID = String(announcement.Id);
          if (saved.Created) { announcement.Created = saved.Created; }
          links.forEach(function (link) { link.KokokuID = announcement.ID; }); ok();
        }, function (request) {
          if (isResultWork(announcement) && request && /duplicate|unique|一意|重複/i.test(String(request.responseText || ""))) {
            fail("未保存：ほかのユーザーが結果を登録しました。再読込してください。");
          } else { fail(request); }
        });
      } else { DataService.update("announcements", announcement.Id || announcement.ID, payload, ok, fail); }
    });
    links.forEach(function (link) {
      tasks.push(function (ok, fail) {
        var data = { KokokuID: String(announcement.Id || announcement.ID), Text: link.Text, FileName: link.FileName, URL: link.URL, Type: link.Type, Sort: String(link.Sort || "") };
        if (link.Id) { DataService.update("links", link.Id, data, ok, fail); }
        else { DataService.add("links", data, function (saved) { link.Id = saved.Id || saved.ID; ok(); }, fail); }
      });
    });
    (removedLinks || []).forEach(function (link) { tasks.push(function (ok, fail) { DataService.remove("links", link.Id || link.ID, ok, fail); }); });
    runSave(tasks, function () { filterAnnouncements(); byId("form-message").textContent = isResultWork(announcement) ? "結果・リンク・PDFをSharePointへ保存しました。" : "公告・リンク・PDFをSharePointへ保存しました。"; });
  }

  function saveResultWork() {
    var task = announcementById(byId("announcement-id").value, plannedAnnouncements);
    var source = announcementById(editingResultSourceId, allAnnouncements);
    var links;
    var link;
    var file;
    var selectedFiles = {};
    var currentUser = DataService.getCurrentUser();
    var now = new Date().toISOString();
    var i;
    var isNew;
    if (!task || !source || !currentUser) {
      byId("form-message").textContent = "結果作業の対象を確認できません。再読込してください。";
      return false;
    }
    if (!requireActiveFiscalYear(itemFiscalYear(source))) { return false; }
    if (!task._virtualResult && !DataService.canManageAnnouncement(task, "planned", adminActive)) {
      byId("form-message").textContent = "この結果は別のユーザーが保存済みです。";
      return false;
    }
    links = linksFor(task.ID, plannedLinks);
    for (i = 0; i < links.length; i += 1) {
      file = pdfInput("pdf-file-input", i).files && pdfInput("pdf-file-input", i).files.length ? pdfInput("pdf-file-input", i).files[0] : null;
      if (file && !validPdfFile(file, "結果PDF")) {
        byId("form-message").textContent = "選択した結果PDFを保存できません。右上の「診断」で内容を確認してください。";
        return false;
      }
      if (!/_kk\.pdf$/i.test(pdfInput("link-url-input", i).value) && !selectedPdfFiles[pdfKey("planned", links[i].ID)]) {
        byId("form-message").textContent = "結果PDFを選択してください。";
        return false;
      }
      if (file) { selectedFiles[pdfKey("planned", links[i].ID)] = file; }
    }
    isNew = !!task._virtualResult;
    if (isNew) {
      if (resultWorkBySource(source.ID, false)) {
        byId("form-message").textContent = "ほかのユーザーが結果を登録しました。再読込してください。";
        return false;
      }
      plannedAnnouncements.splice(plannedAnnouncements.indexOf(task), 1);
      links.forEach(function (item) { plannedLinks.splice(plannedLinks.indexOf(item), 1); });
      task = {
        ID: nextId(plannedAnnouncements),
        AuthorId: String(currentUser.id),
        AuthorName: currentUser.name,
        Created: now,
        Category: "結果",
        Garrison: source.Garrison,
        BidDate: source.BidDate,
        FiscalYear: itemFiscalYear(source),
        Remarks: byId("remarks-input").value,
        Sort: "1",
        Status: "結果登録",
        OperationDate: operationDateText(),
        ListKind: "planned",
        WorkType: "RESULT",
        SourceAnnouncementID: String(source.ID),
        WorkflowKey: "RESULT:" + source.ID,
        ResultSubmittedById: String(currentUser.id),
        ResultSubmittedByName: currentUser.name,
        ResultSubmittedAt: now
      };
      plannedAnnouncements.unshift(task);
      links = links.map(function (oldLink, index) {
        var newLink = { ID: nextLinkId(plannedLinks), KokokuID: task.ID, Text: oldLink.Text, FileName: fileNameFromUrl(pdfInput("link-url-input", index).value), URL: pdfInput("link-url-input", index).value, Type: "結果", Sort: String(index + 1) };
        file = pdfInput("pdf-file-input", index).files[0];
        plannedLinks.push(newLink);
        if (file) {
          selectedFiles[pdfKey("planned", newLink.ID)] = file;
          selectedPdfFiles[pdfKey("planned", newLink.ID)] = file;
        }
        return newLink;
      });
    } else {
      task.Category = "結果";
      task.Garrison = source.Garrison;
      task.BidDate = source.BidDate;
      task.FiscalYear = itemFiscalYear(source);
      task.Remarks = byId("remarks-input").value;
      task.Status = "結果登録";
      task.OperationDate = operationDateText();
      task.ResultSubmittedById = String(currentUser.id);
      task.ResultSubmittedByName = currentUser.name;
      task.ResultSubmittedAt = now;
      for (i = 0; i < links.length; i += 1) {
        links[i].URL = pdfInput("link-url-input", i).value;
        links[i].FileName = fileNameFromUrl(links[i].URL);
        links[i].Type = "結果";
        file = pdfInput("pdf-file-input", i).files && pdfInput("pdf-file-input", i).files.length ? pdfInput("pdf-file-input", i).files[0] : null;
        if (file) {
          selectedFiles[pdfKey("planned", links[i].ID)] = file;
          selectedPdfFiles[pdfKey("planned", links[i].ID)] = file;
        }
      }
    }
    preservePlannedOrder = true;
    clearForm();
    filterAnnouncements();
    byId("form-message").textContent = DataService.isSharePoint() ? "結果をSharePointへ保存しています..." : "結果を公告予定リストへ保存しました。CSVも出力してください。";
    persistAnnouncement("planned", task, links, isNew, selectedFiles, []);
    return false;
  }

  function saveAnnouncement(event) {
    if (workflowBusy || pendingSave) { if (event) { event.preventDefault(); } return false; }
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
    var requestedStatus;
    if (event) {
      event.preventDefault();
    }
    if (resultWorkMode) { return saveResultWork(); }
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
        fileInput = pdfInput("pdf-file-input", i);
        file = fileInput.files && fileInput.files.length ? fileInput.files[0] : null;
        if (file && !validPdfFile(file, "公告PDF")) {
          byId("form-message").textContent = "選択した公告PDFを保存できません。右上の「診断」で内容を確認してください。";
          return false;
        }
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
    if (!requireActiveFiscalYear(fiscalYearForBidDate(byId("date-input").value))) { return false; }
    if (!announcement) {
      id = nextId(state.announcements);
      announcement = { ID: id, AuthorId: DataService.getCurrentUser().id, AuthorName: DataService.getCurrentUser().name, Created: new Date().toISOString(), Sort: String(state.announcements.length + 1), Status: "公告登録", OperationDate: "" };
      state.announcements.unshift(announcement);
    }
    announcement.Category = byId("category-input").value;
    announcement.Garrison = byId("garrison-input").value;
    announcement.BidDate = byId("date-input").value;
    announcement.FiscalYear = fiscalYearForBidDate(announcement.BidDate);
    requestedStatus = byId("status-input").value;
    announcement.Status = requestedStatus;
    if (targetKind === "published") {
      announcement.Status = "公開待ち";
      announcement.PublicState = requestedStatus === "入札終了登録" ? "掲載終了" :
        (requestedStatus === "結果登録" || announcement.Category === "結果" ? "結果掲載中" : "公告掲載中");
    }
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
    persistAnnouncement(targetKind, announcement, links, isNew, selectedFiles, removedLinks);
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
    if (workflowBusy || pendingSave) { return; }
    var id = this.getAttribute("data-id"), kind = this.getAttribute("data-list") || "planned", state = listState(kind);
    var item = announcementById(id, state.announcements), links = linksFor(id, state.links);
    if (!item || !requireActiveFiscalYear(itemFiscalYear(item))) { return; }
    if (!DataService.canManageAnnouncement(item, kind, adminActive) || !window.confirm("この公告を削除しますか？")) { return; }
    function deleted() {
      deletedAnnouncements.unshift({ deletedAt: new Date().toLocaleString(), announcement: copyObject(item), links: links.map(copyObject) });
      state.announcements.splice(state.announcements.indexOf(item), 1);
      links.forEach(function (link) { state.links.splice(state.links.indexOf(link), 1); delete selectedPdfFiles[pdfKey(kind, link.ID)]; });
      unsaved = !DataService.isSharePoint(); renderDeletedAnnouncements(); filterAnnouncements();
      byId("form-message").textContent = DataService.isSharePoint() ? "公告とリンクを削除しました。" : "削除しました。CSVを出力してください。";
    }
    if (!DataService.isSharePoint()) { deleted(); return; }
    var tasks = links.map(function (link) { return function (ok, fail) { DataService.remove("links", link.Id || link.ID, ok, fail); }; });
    tasks.push(function (ok, fail) { DataService.remove("announcements", item.Id || item.ID, ok, fail); });
    runSave(tasks, deleted);
  }

  function endPublication() {
    if (workflowBusy || pendingSave) { return; }
    var item = announcementById(this.getAttribute("data-id"), allAnnouncements);
    var patch = { PublicState: "掲載終了", Category: "", Status: "公開待ち", OperationDate: operationDateText() };
    var key;
    if (!adminActive || !item || PublicationWorkflow.state(item) === "掲載終了") { return; }
    if (!requireActiveFiscalYear(itemFiscalYear(item))) { return; }
    function ended() {
      for (key in patch) { if (patch.hasOwnProperty(key)) { item[key] = patch[key]; } }
      unsaved = !DataService.isSharePoint();
      filterAnnouncements();
      byId("form-message").textContent = "掲載終了に変更しました。リンクは設定済みの掲載終了PDFです。ZIP作成後に公開済みになります。" + (DataService.isSharePoint() ? "" : " 状態を残す場合はCSVも出力してください。");
    }
    if (DataService.isSharePoint()) {
      runSave([function (ok, fail) { DataService.update("announcements", item.Id || item.ID, patch, ok, fail); }], ended);
    } else { ended(); }
  }

  function publishResultWork(task) {
    var source = announcementById(task.SourceAnnouncementID, allAnnouncements);
    var resultLinks = linksFor(task.ID, plannedLinks);
    var sourceLinks;
    var finalLinks = [];
    var newLinks = [];
    var removedLinks = [];
    var patch;
    var tasks = [];
    var firstNewId;
    var i;
    if (!adminActive || task._virtualResult || !source) {
      byId("form-message").textContent = "保存済みの結果またはコピー元公告を確認できません。";
      return;
    }
    if (!requireActiveFiscalYear(itemFiscalYear(source))) { return; }
    if (!resultLinks.length || resultLinks.some(function (link) { return !/_kk\.pdf$/i.test(link.URL || ""); })) {
      byId("form-message").textContent = "結果PDFが未登録です。結果作業を完了してから本リストへ登録してください。";
      return;
    }
    sourceLinks = linksFor(source.ID, allLinks);
    firstNewId = parseInt(nextLinkId(allLinks), 10) || 1;
    for (i = 0; i < resultLinks.length; i += 1) {
      var target = sourceLinks[i];
      if (!target) {
        target = { ID: String(firstNewId + newLinks.length), KokokuID: String(source.ID) };
        newLinks.push(target);
      }
      target.Text = resultLinks[i].Text;
      target.FileName = resultLinks[i].FileName || fileNameFromUrl(resultLinks[i].URL);
      target.URL = resultLinks[i].URL;
      target.Type = "結果";
      target.Sort = String(i + 1);
      finalLinks.push(target);
    }
    removedLinks = sourceLinks.slice(resultLinks.length);
    patch = {
      Category: "結果",
      Garrison: task.Garrison,
      BidDate: task.BidDate,
      Remarks: task.Remarks,
      Status: "公開待ち",
      PublicState: "結果掲載中",
      OperationDate: operationDateText(),
      ResultSubmittedById: task.ResultSubmittedById,
      ResultSubmittedByName: task.ResultSubmittedByName,
      ResultSubmittedAt: task.ResultSubmittedAt
    };
    if (DataService.isSharePoint()) {
      finalLinks.forEach(function (link) {
        tasks.push(function (ok, fail) {
          var data = { KokokuID: String(source.Id || source.ID), Text: link.Text, FileName: link.FileName, URL: link.URL, Type: "結果", Sort: link.Sort };
          if (link.Id) { DataService.update("links", link.Id, data, ok, fail); }
          else { DataService.add("links", data, function (saved) { link.Id = saved.Id || saved.ID; link.ID = String(link.Id); ok(); }, fail); }
        });
      });
      removedLinks.forEach(function (link) { tasks.push(function (ok, fail) { DataService.remove("links", link.Id || link.ID, ok, fail); }); });
      tasks.push(function (ok, fail) { DataService.update("announcements", source.Id || source.ID, patch, ok, fail); });
      resultLinks.forEach(function (link) { tasks.push(function (ok, fail) { DataService.remove("links", link.Id || link.ID, ok, fail); }); });
      tasks.push(function (ok, fail) { DataService.remove("announcements", task.Id || task.ID, ok, fail); });
    }
    function applied() {
      var file;
      Object.keys(patch).forEach(function (key) { source[key] = patch[key]; });
      removedLinks.forEach(function (link) { if (allLinks.indexOf(link) >= 0) { allLinks.splice(allLinks.indexOf(link), 1); } });
      newLinks.forEach(function (link) { if (allLinks.indexOf(link) < 0) { allLinks.push(link); } });
      for (i = 0; i < resultLinks.length; i += 1) {
        file = selectedPdfFiles[pdfKey("planned", resultLinks[i].ID)];
        delete selectedPdfFiles[pdfKey("planned", resultLinks[i].ID)];
        if (file) { selectedPdfFiles[pdfKey("published", finalLinks[i].ID)] = file; }
        if (plannedLinks.indexOf(resultLinks[i]) >= 0) { plannedLinks.splice(plannedLinks.indexOf(resultLinks[i]), 1); }
      }
      if (plannedAnnouncements.indexOf(task) >= 0) { plannedAnnouncements.splice(plannedAnnouncements.indexOf(task), 1); }
      unsaved = !DataService.isSharePoint();
      clearForm();
      filterAnnouncements();
      byId("form-message").textContent = "結果を元の公告へ登録しました。ZIP作成までは公開待ちです。" + (DataService.isSharePoint() ? "" : " 状態を残す場合はCSVも出力してください。");
    }
    if (DataService.isSharePoint()) { runSave(tasks, applied); }
    else { applied(); }
  }

  function moveAnnouncement() {
    if (workflowBusy || pendingSave) { return; }
    var fromKind = this.getAttribute("data-list") || "planned", toKind = fromKind === "planned" ? "published" : "planned";
    var from = listState(fromKind), to = listState(toKind), item = announcementById(this.getAttribute("data-id"), from.announcements);
    if (!adminActive || !item) { return; }
    if (!requireActiveFiscalYear(itemFiscalYear(item))) { return; }
    if (fromKind === "planned" && isResultWork(item)) { publishResultWork(item); return; }
    var patch = { ListKind: toKind, Status: toKind === "published" ? "公開待ち" : "内容修正", OperationDate: operationDateText() };
    if (toKind === "published" && item.Status === "入札終了登録") { patch.PublicState = "掲載終了"; }
    if (toKind === "published" && (item.Status === "結果登録" || item.Category === "結果")) { patch.PublicState = "結果掲載中"; }
    patch.Sort = String(to.announcements.reduce(function (minimum, row) { return Math.min(minimum, Number(row.Sort || 0)); }, 0) - 1);
    function moved() {
      var oldId = item.ID, movedLinks = linksFor(oldId, from.links);
      if (!DataService.isSharePoint() && announcementById(oldId, to.announcements)) { item.ID = nextId(to.announcements); }
      Object.keys(patch).forEach(function (key) { item[key] = patch[key]; });
      from.announcements.splice(from.announcements.indexOf(item), 1); to.announcements.unshift(item);
      movedLinks.forEach(function (link) {
        var file = selectedPdfFiles[pdfKey(fromKind, link.ID)];
        delete selectedPdfFiles[pdfKey(fromKind, link.ID)];
        from.links.splice(from.links.indexOf(link), 1);
        if (!DataService.isSharePoint()) { link.ID = nextLinkId(to.links); }
        link.KokokuID = String(item.ID); to.links.push(link);
        if (file) { selectedPdfFiles[pdfKey(toKind, link.ID)] = file; }
      });
      unsaved = !DataService.isSharePoint(); preserveAnnouncementOrder = true; filterAnnouncements();
      byId("form-message").textContent = toKind === "published" ? "公告リストへ移動しました。ZIP作成までは公開待ちです。" : "公告予定リストへ差し戻しました。";
    }
    if (DataService.isSharePoint()) {
      runSave([function (ok, fail) { DataService.update("announcements", item.Id || item.ID, patch, ok, fail); }], moved);
    } else { moved(); }
  }

  function moveAnnouncementOrder() {
    if (workflowBusy || pendingSave) { return; }
    var kind = this.getAttribute("data-list") || "planned";
    var state = listState(kind);
    var id = this.getAttribute("data-id");
    var index = -1;
    var nextIndex;
    var currentPosition;
    var nextPosition;
    var yearItems;
    var i;
    var temporary;
    if (!adminActive) {
      return;
    }
    yearItems = state.announcements.filter(function (item) { return itemFiscalYear(item) === activeFiscalYear; });
    for (i = 0; i < yearItems.length; i += 1) {
      if (String(yearItems[i].ID) === String(id)) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      return;
    }
    nextIndex = this.className.indexOf("order-up-button") >= 0 ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= yearItems.length) {
      return;
    }
    currentPosition = state.announcements.indexOf(yearItems[index]);
    nextPosition = state.announcements.indexOf(yearItems[nextIndex]);
    temporary = state.announcements[currentPosition];
    state.announcements[currentPosition] = state.announcements[nextPosition];
    state.announcements[nextPosition] = temporary;
    temporary = yearItems[index];
    yearItems[index] = yearItems[nextIndex];
    yearItems[nextIndex] = temporary;
    temporary.OperationDate = operationDateText();
    if (kind === "published") {
      preserveAnnouncementOrder = true;
    } else {
      preservePlannedOrder = true;
    }
    unsaved = true;
    var persistedAnnouncements = yearItems.filter(function (item) { return !item._virtualResult; });
    persistedAnnouncements.forEach(function (item, position) { item.Sort = String(position + 1); });
    filterAnnouncements();
    if (DataService.isSharePoint()) {
      runSave(persistedAnnouncements.map(function (item) { return function (ok, fail) { DataService.update("announcements", item.Id || item.ID, { Sort: item.Sort }, ok, fail); }; }), function () { byId("form-message").textContent = "並び順を保存しました。"; });
    }
  }

  function filterAnnouncements() {
    syncVirtualResultWork();
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
        if (itemFiscalYear(state.announcements[i]) === activeFiscalYear && text.indexOf(keyword) >= 0) {
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
    byId("planned-announcement-list").innerHTML = '<tr><td colspan="12" class="empty-row">データを表示できません。</td></tr>';
    byId("announcement-list").innerHTML = '<tr><td colspan="10" class="empty-row">データを表示できません。</td></tr>';
  }

  function applyLoadedData(data) {
    deactivateAdmin();
    preserveAnnouncementOrder = true;
    preservePlannedOrder = true;
    plannedAnnouncements = normalizeAnnouncements(data.announcements || []);
    plannedLinks = data.links || [];
    allAnnouncements = normalizeAnnouncements(data.publishedAnnouncements || []);
    plannedAnnouncements.sort(function (a, b) { return Number(a.Sort || 0) - Number(b.Sort || 0); });
    allAnnouncements.sort(function (a, b) { return Number(a.Sort || 0) - Number(b.Sort || 0); });
    allLinks = data.publishedLinks || [];
    allSettings = data.settings || [];
    DataService.setFiscalYear(activeFiscalYear);
    byId("database-input").value = data.database || "KOKOKU";
    updateFiscalYearUi();
    byId("data-mode-input").value = data.mode === "SHAREPOINT" ? "SHAREPOINT" : "CSV";
    var user = DataService.getCurrentUser();
    byId("current-user").textContent = (data.mode === "SHAREPOINT" ? "ログイン：" : "CSV仮ユーザー：") + (user ? user.name + "（" + user.id + "）" : "未確認");
    byId("database-apply").disabled = false;
    byId("data-mode-apply").disabled = false;
    byId("data-status").innerHTML = (data.databaseName || "公告DB") + " / " + activeFiscalYear + "年度 / " + (data.mode === "SHAREPOINT" ? "SharePointリスト" : "CSVモード") + " / 読み込み完了";
    filterAnnouncements();
    renderSettings();
  }

  function loadData() {
    if (workflowBusy || pendingSave) { return; }
    selectedPdfFiles = {}; unsaved = false; formDirty = false; pendingSave = null;
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
    if (!mayLeave()) { return; }
    pendingSave = null;
    var mode = byId("data-mode-input").value;
    if (!DataService.setMode(mode)) {
      return;
    }
    byId("data-status").innerHTML = mode === "SHAREPOINT" ? "SharePointリストへ切替中..." : "CSVモードへ切替中...";
    loadData();
  }

  function switchDatabase() {
    if (!mayLeave()) { return; }
    pendingSave = null;
    var database = byId("database-input").value;
    if (!DataService.setDatabase(database)) {
      return;
    }
    byId("data-status").innerHTML = "DBを切替中...";
    loadData();
  }

  function switchFiscalYear() {
    var year;
    year = String(byId("fiscal-year-input").value || "");
    if (["R8", "R9", "R10", "R11", "R12"].indexOf(year) < 0) {
      byId("admin-message").textContent = "R8年度からR12年度までの作業年度を選択してください。";
      byId("fiscal-year-input").value = activeFiscalYear;
      return;
    }
    if (year === activeFiscalYear) { return; }
    if (workflowBusy || pendingSave || formDirty) {
      byId("fiscal-year-input").value = activeFiscalYear;
      byId("admin-message").textContent = "未保存の入力または選択PDFがあるため、年度を切り替えられません。先に保存またはキャンセルしてください。";
      return;
    }
    if (byId("announcement-id").value || resultWorkMode) { clearForm(); }
    activeFiscalYear = year;
    DataService.setFiscalYear(year);
    updateFiscalYearUi();
    filterAnnouncements();
    byId("data-status").innerHTML = year + "年度を作業対象にしています。";
    byId("admin-message").textContent = year + "年度へ切り替えました。";
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
    if (!user) {
      byId("admin-message").innerHTML = "ログインユーザーを確認できません。";
      return;
    }
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
    downloadCsv(DataService.getCsvFileName("publishedAnnouncements"), CsvData.toCsv(allAnnouncements, ["ID", "AuthorId", "AuthorName", "Created", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields)));
    byId("form-message").innerHTML = "公告CSVを出力しました。";
  }

  function exportPlannedAnnouncements() {
    downloadCsv(DataService.getCsvFileName("announcements"), CsvData.toCsv(plannedAnnouncements.filter(function (item) { return !item._virtualResult; }), ["ID", "AuthorId", "AuthorName", "Created", "Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields)));
    byId("form-message").innerHTML = "公告予定CSVを出力しました。";
  }

  function exportLinks() {
    downloadCsv(DataService.getCsvFileName("publishedLinks"), CsvData.toCsv(allLinks, ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "リンクCSVを出力しました。";
  }

  function exportPlannedLinks() {
    downloadCsv(DataService.getCsvFileName("links"), CsvData.toCsv(plannedLinks.filter(function (item) { return !item._virtualResult; }), ["ID", "KokokuID", "Text", "FileName", "URL", "Type", "Sort"]));
    byId("form-message").innerHTML = "公告予定リンクCSVを出力しました。";
  }

  function exportSettings() {
    downloadCsv(DataService.getCsvFileName("settings"), CsvData.toCsv(allSettings, ["ID", "Type", "Text", "URL", "Sort"]));
    byId("form-message").innerHTML = "設定CSVを出力しました。";
  }

  function previewPage() {
    var data = publicationData(activeFiscalYear);
    if (HtmlExport.openPreview(data.announcements, data.links, allSettings, activeFiscalYear)) {
      byId("form-message").innerHTML = activeFiscalYear + "年度の公開ページプレビューを開きました。";
    }
  }

  function exportHtml() {
    var data = publicationData(activeFiscalYear);
    var html = HtmlExport.create(data.announcements, data.links, allSettings, activeFiscalYear);
    var fileName = DataService.getPublicHtmlFileName(activeFiscalYear);
    downloadBlob(fileName, new Blob([html], { type: "text/html;charset=utf-8" }));
    byId("form-message").textContent = fileName + "を出力しました。";
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
    if (workflowBusy || pendingSave) { return; }
    byId("zip-message").textContent = "ZIPを作成しています...";
    var data;
    try { data = publicationData(activeFiscalYear); }
    catch (error) { byId("zip-message").textContent = "ZIPを作成できません。" + error.message; return; }
    var invalidLink = data.links.filter(function (entry) {
      var owner = announcementById(entry.KokokuID, allAnnouncements);
      if (entry.Type === "掲載終了" || (!fullData && (!owner || owner.Status !== "公開待ち"))) { return false; }
      return entry.URL && (!/^R[1-9][0-9]*\//i.test(entry.URL) || /(?:^|\/)\.\.(?:\/|$)/.test(entry.URL));
    })[0];
    if (invalidLink) { byId("zip-message").textContent = "ZIPを作成できません。公開用PDFの相対パスを確認してください。公告ID=" + invalidLink.KokokuID + " / " + invalidLink.URL; return; }
    var htmlPath = DataService.getPublicHtmlPath(activeFiscalYear);
    var zipName = DataService.getPublicHtmlFileName(activeFiscalYear).replace(/\.html$/i, "") + (fullData ? "_full.zip" : "_update.zip");
    var html;
    try { html = HtmlExport.create(data.announcements, data.links, allSettings, activeFiscalYear); }
    catch (error) { byId("zip-message").textContent = "ZIPを作成できません。" + error.message; return; }
    var files = [{ name: htmlPath, content: html }];
    var reads = [];
    var zipStarted = false;
    function createZip() {
      if (zipStarted) { return; }
      zipStarted = true;
      ZipExport.create(files, function (blob) {
        try { downloadBlob(zipName, blob); } catch (error) { workflowBusy = false; byId("zip-message").textContent = "ZIPのダウンロードに失敗しました。公開状態は変更していません。"; saveProgress(byId("zip-message").textContent, true); return; }
        var tasks = [];
        data.announcements.forEach(function (candidate) {
          var item = announcementById(candidate.ID, allAnnouncements);
          var patch = { Status: candidate.Status, PublicState: PublicationWorkflow.state(candidate), Category: candidate.Category };
          if (Object.keys(patch).some(function (key) { return String(item[key] || "") !== String(patch[key]); })) {
            tasks.push(function (ok, fail) { saveWorkflowItem(item, patch, ok, fail); });
          }
        });
        runSave(tasks, function () { unsaved = !DataService.isSharePoint(); filterAnnouncements(); byId("zip-message").textContent = zipName + "を出力し、対象を公開済みにしました。" + (DataService.isSharePoint() ? "" : "状態を残す場合はCSVも出力してください。"); saveProgress(byId("zip-message").textContent, true); }, "ZIP公開状態の保存");
      }, function () { workflowBusy = false; byId("zip-message").textContent = "PDFの読込に失敗しました。ZIPは作成していません。"; saveProgress(byId("zip-message").textContent, true); });
    }
    data.links.forEach(function (link) {
      var sourceItem = announcementById(link.KokokuID, allAnnouncements);
      if (link.Type === "掲載終了" || (!fullData && (!sourceItem || sourceItem.Status !== "公開待ち"))) { return; }
      var file = selectedPdfFiles[pdfKey("published", link.ID)];
      if (!file && !DataService.isSharePoint()) { return; }
      var name = link.FileName || fileNameFromUrl(link.URL) || (file && file.name);
      var entry = {name: "nafin/" + (link.URL || DataService.getPublicationConfig(activeFiscalYear).pdfRoot + "/" + name), file: file};
      files.push(entry);
      if (!file) { reads.push({link:link, entry:entry}); }
    });
    workflowBusy = true;
    byId("zip-message").textContent = "ZIPの構造を確認してください。まだ作成していません。";
    ZipPreview.open(zipName, files, fullData, function () {
      var index = 0;
      function next() {
        saveProgress("ZIP作成中：PDF取得 " + index + " / " + reads.length + "件。画面を閉じずにお待ちください。", false);
        if (index === reads.length) { createZip(); return; }
        var task = reads[index];
        DataService.readPdf(task.link, function (blob) { task.entry.file = blob; index += 1; next(); }, function () {
          workflowBusy = false;
          var message = "PDFを読み込めません。ZIPは作成していません。公告ID=" + task.link.KokokuID + " / " + task.entry.name;
          byId("zip-message").textContent = message;
          saveProgress(message, true);
        });
      }
      next();
    }, function () {
      workflowBusy = false;
      byId("zip-message").textContent = "ZIP作成をキャンセルしました。公開状態は変更していません。";
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

  function replaceImportedData(data, snapshot) {
    if (workflowBusy || pendingSave) { return; }
    if (DataService.isSharePoint() && !snapshot) {
      if (!data.announcements || !data.announcements.length) { throw new Error("公告が0件のため登録を中止しました。"); }
      workflowBusy = true;
      saveProgress("HTML登録：SharePointの最新データを確認中です。", false);
      DataService.load(function (fresh) {
        workflowBusy = false;
        try { replaceImportedData(data, fresh); }
        catch (error) { saveProgress("HTML登録を中止しました：" + error.message, true); }
      }, function () {
        workflowBusy = false;
        saveProgress("SharePointの読込に失敗しました。削除・登録は開始していません。", true);
      });
      return;
    }
    var imported = normalizeAnnouncements(data.announcements);
    var importYears = {};
    var importYear;
    var previous;
    var previousIds = {};
    var previousLinks;
    var retainedAnnouncements;
    var retainedLinks;
    var newLinks = data.links;
    var idMap = {};
    var nextImportedId;
    var importedDateSettings = dateOnlySettings(data.settings || []);
    var currentDateSetting = settingByType("date");
    var retainedSettings = allSettings.filter(function (item) { return item.Type !== "date"; });
    var mergedSettings;
    var tasks = [];
    var i;
    imported.forEach(function (item) { if (itemFiscalYear(item)) { importYears[itemFiscalYear(item)] = true; } });
    var yearKeys = Object.keys(importYears);
    if (yearKeys.length > 1) { throw new Error("複数年度の公告が含まれています。年度別HTMLを選択してください。"); }
    importYear = yearKeys.length ? yearKeys[0] : activeFiscalYear;
    if (importYear !== activeFiscalYear) { throw new Error("取込HTMLは" + importYear + "年度です。上部メニューを" + importYear + "年度へ切り替えてから取り込んでください。"); }
    previous = allAnnouncements.filter(function (item) { return itemFiscalYear(item) === importYear; });
    previous.forEach(function (item) { previousIds[String(item.ID)] = true; });
    previousLinks = allLinks.filter(function (link) { return previousIds[String(link.KokokuID)] === true; });
    retainedAnnouncements = allAnnouncements.filter(function (item) { return itemFiscalYear(item) !== importYear; });
    retainedLinks = allLinks.filter(function (link) { return previousIds[String(link.KokokuID)] !== true; });
    if (snapshot) {
      previous = (snapshot.announcements || []).concat(snapshot.publishedAnnouncements || []);
      previousLinks = (snapshot.links || []).concat(snapshot.publishedLinks || []);
      retainedAnnouncements = []; retainedLinks = [];
      allSettings = snapshot.settings || [];
      currentDateSetting = settingByType("date");
      retainedSettings = allSettings.filter(function (item) { return item.Type !== "date"; });
      if (!window.confirm("選択中の区分の公告 " + previous.length + "件とリンク " + previousLinks.length + "件を全件削除し、HTMLの公告 " + imported.length + "件を登録します。全年度・予定一覧・アプリで追加した公告も削除対象です。別区分・PDF・設定は残します。実行しますか？")) {
        saveProgress("HTML登録をキャンセルしました。データは変更していません。", true); return;
      }
    }
    nextImportedId = parseInt(nextId(retainedAnnouncements), 10) || 1;
    var nextImportedLinkId = parseInt(nextLinkId(retainedLinks), 10) || 1;
    for (i = 0; i < imported.length; i += 1) {
      idMap[String(imported[i].ID)] = String(nextImportedId + i);
      imported[i].ID = String(nextImportedId + i);
      imported[i].FiscalYear = importYear;
    }
    for (i = 0; i < newLinks.length; i += 1) {
      newLinks[i].KokokuID = idMap[String(newLinks[i].KokokuID)] || newLinks[i].KokokuID;
      newLinks[i].ID = String(nextImportedLinkId + i);
    }
    mergedSettings = (importedDateSettings.length ? importedDateSettings : (currentDateSetting ? [currentDateSetting] : [])).concat(retainedSettings);
    function applied() {
      preserveAnnouncementOrder = true; allAnnouncements = retainedAnnouncements.concat(imported); allLinks = retainedLinks.concat(newLinks);
      allSettings = mergedSettings; unsaved = !DataService.isSharePoint();
      if (snapshot) { plannedAnnouncements = []; plannedLinks = []; selectedPdfFiles = {}; }
      clearForm(); filterAnnouncements(); renderSettings();
      updateFiscalYearUi();
      byId("import-message").textContent = importYear + "年度のHTMLを取り込みました。公告 " + imported.length + "件・リンク " + newLinks.length + "件。表示番号は上から件数順に減り、一番下が1です。リンク先PDFの存在確認は行っていません。" + (DataService.isSharePoint() ? "SharePointへの保存が完了しました。" : "CSVを出力してください。");
    }
    imported.forEach(function (item) { item.ListKind = "published"; item.PublicState = item.Category === "結果" ? "結果掲載中" : "公告掲載中"; });
    if (!DataService.isSharePoint()) { applied(); return; }
    previousLinks.forEach(function (link) { tasks.push(function (ok, fail) { DataService.remove("links", link.Id || link.ID, ok, fail); }); });
    previous.forEach(function (item) { tasks.push(function (ok, fail) { DataService.remove("announcements", item.Id || item.ID, ok, fail); }); });
    tasks.forEach(function (task) { task.phase = "既存データ削除中"; });
    var deleteCount = tasks.length;
    imported.forEach(function (item) {
      var childLinks = newLinks.filter(function (link) { return String(link.KokokuID) === String(item.ID); });
      tasks.push(function (ok, fail) {
        var payload = {};
        ["Category", "Garrison", "BidDate", "Remarks", "Sort", "Status", "OperationDate"].concat(PublicationWorkflow.fields).forEach(function (key) { payload[key] = item[key] || ""; });
        DataService.add("announcements", payload, function (saved) { item.Id = saved.Id; item.ID = String(saved.Id); item.AuthorId = saved.AuthorId; item.AuthorName = DataService.getCurrentUser().name; item.Created = saved.Created; childLinks.forEach(function (link) { link.KokokuID = item.ID; }); ok(); }, fail);
      });
      childLinks.forEach(function (link) { tasks.push(function (ok, fail) { DataService.add("links", { KokokuID: String(item.Id), Text: link.Text, FileName: link.FileName || "", URL: link.URL, Type: link.Type || "公告", Sort: String(link.Sort || "") }, function (saved) { link.Id = saved.Id; link.ID = String(saved.Id); ok(); }, fail); }); });
    });

    var oldSetting = currentDateSetting;
    if (importedDateSettings.length) { tasks.push(function (ok, fail) {
      var item = importedDateSettings[0], payload = { Type: "date", Text: item.Text, URL: "", Sort: "1" };
      if (oldSetting) { item.Id = oldSetting.Id || oldSetting.ID; DataService.update("settings", item.Id, payload, ok, fail); }
      else { DataService.add("settings", payload, function (saved) { item.Id = saved.Id; item.ID = String(saved.Id); ok(); }, fail); }
    }); }
    data.settings = mergedSettings;
    tasks.forEach(function (task, index) { if (index >= deleteCount) { task.phase = "HTMLデータ登録中"; } });
    runSave(tasks, applied, "HTML登録");
  }

  function dateOnlySettings(settings) {
    var result = settings.filter(function (item) { return item.Type === "date"; }).slice(0, 1);
    if (result.length) { result[0].Sort = "1"; }
    return result;
  }

  function renderSettings() {
    var html = [];
    var dateSetting = settingByType("date");
    if (!dateSetting) {
      byId("import-settings").innerHTML = "<strong>基準日</strong> 未設定";
      byId("setting-date").value = "";
      return;
    }
    html.push("<strong>作業年度</strong> " + escapeHtml(activeFiscalYear) + "年度　");
    html.push("<strong>基準日</strong> " + escapeHtml(dateSetting.Text));
    byId("import-settings").innerHTML = html.join("");
    byId("setting-date").value = dateSetting.Text;
  }

  function addSetting() {
    if (workflowBusy || pendingSave) { return; }
    unsaved = true;
    var text = byId("setting-date").value;
    var currentDateSetting = settingByType("date");
    var editIndex = currentDateSetting ? allSettings.indexOf(currentDateSetting) : -1;
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
    if (DataService.isSharePoint()) {
      runSave([function (ok, fail) {
        var payload = { Type: setting.Type, Text: setting.Text, URL: setting.URL, Sort: setting.Sort };
        if (editIndex < 0 && !setting.Id) { DataService.add("settings", payload, function (saved) { setting.Id = saved.Id || saved.ID; setting.ID = String(setting.Id); ok(); }, fail); }
        else { DataService.update("settings", setting.Id || setting.ID, payload, ok, fail); }
      }], function () { byId("import-message").textContent = "基準日をSharePointへ保存しました。"; });
    }
  }

  function importSource() {
    if (workflowBusy || pendingSave) { return; }
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
      byId("import-message").textContent = "HTMLを取り込めませんでした。" + (e && e.message ? e.message : "公告一覧表の構造を確認してください。");
    }
  }

  function importFile() {
    if (workflowBusy || pendingSave) { return; }
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
        byId("import-message").textContent = "HTMLを取り込めませんでした。" + (e && e.message ? e.message : "公告一覧表の構造を確認してください。");
      }
    }, function () {
      byId("import-message").innerHTML = "HTMLファイルを読み込めませんでした。";
    });
  }

  function start() {
    var retry = document.createElement("button");
    retry.id = "retry-save"; retry.type = "button"; retry.textContent = "再保存"; retry.disabled = true;
    byId("form-message").parentNode.appendChild(retry);
    retry.onclick = function () { if (pendingSave && !workflowBusy) { pendingSave(); } };
    global.onbeforeunload = function (event) {
      if (unsaved || workflowBusy || Object.keys(selectedPdfFiles).length) {
        event = event || global.event;
        var message = "未保存の変更または選択PDFがあります。";
        if (event) { event.returnValue = message; }
        return message;
      }
    };
    function markEdited(event) {
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) && event.target.id !== "search-input" && event.target.id !== "database-input" && event.target.id !== "data-mode-input" && event.target.id !== "fiscal-year-input") { unsaved = true; formDirty = true; }
    }
    document.addEventListener("change", markEdited);
    document.addEventListener("input", markEdited);
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
    byId("published-check").onclick = verifyPublication;
    byId("import-source").onclick = importSource;
    byId("import-file").onclick = importFile;
    byId("setting-add").onclick = addSetting;
    byId("sort-date").onclick = toggleDateSort;
    byId("sort-planned-date").onclick = toggleDateSort;
    byId("admin-logout").onclick = deactivateAdmin;
    byId("database-apply").onclick = switchDatabase;
    byId("data-mode-apply").onclick = switchDataMode;
    byId("fiscal-year-input").onchange = switchFiscalYear;
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
