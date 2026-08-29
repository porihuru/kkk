(function (global) {
  "use strict";

  var HtmlImport = {};

  function textOf(element) {
    return String(element.textContent || element.innerText || "").replace(/^\s+|\s+$/g, "");
  }

  function relativeUrl(value) {
    var url = String(value || "");
    var marker = url.indexOf("/nafin/R8/");
    if (marker >= 0) {
      return url.substring(marker + 7);
    }
    return url;
  }

  function fileName(value) {
    var url = String(value || "");
    var slash = url.lastIndexOf("/");
    return slash >= 0 ? url.substring(slash + 1) : url;
  }

  function settingsFrom(container, table) {
    var settings = [];
    var headings = container.getElementsByTagName("h1");
    var paragraphs = container.getElementsByTagName("p");
    var anchors = container.getElementsByTagName("a");
    var bodyText = textOf(container);
    var dateMatch = bodyText.match(/令和[0-9０-９]+年[0-9０-９]+月[0-9０-９]+日現在/);
    var i;
    var text;
    var topTables = container.getElementsByTagName("table");
    var topRows;
    var topHeaders;
    var noticeSource;
    var noticeLines;
    var clone;
    var cloneLinks;
    if (headings.length) {
      settings.push({ Type: "title", Text: textOf(headings[0]), URL: "", Sort: "1" });
    }
    if (dateMatch) {
      settings.push({ Type: "date", Text: dateMatch[0], URL: "", Sort: "2" });
    }
    for (i = 0; i < paragraphs.length; i += 1) {
      if (paragraphs[i].compareDocumentPosition(table) & 4) {
        text = textOf(paragraphs[i]);
        if (text && (!dateMatch || text.indexOf(dateMatch[0]) < 0)) {
          settings.push({ Type: "notice", Text: text, URL: "", Sort: String(settings.length + 1) });
        }
      }
    }
    for (i = 0; i < anchors.length; i += 1) {
      if (anchors[i].compareDocumentPosition(table) & 4 && textOf(anchors[i])) {
        settings.push({ Type: "link", Text: textOf(anchors[i]), URL: anchors[i].getAttribute("href") || "", Sort: String(settings.length + 1) });
      }
    }
    if (topTables.length) {
      topRows = topTables[0].getElementsByTagName("tr");
      if (topRows.length) {
        topHeaders = topRows[0].getElementsByTagName("th");
        if (topHeaders.length > 1) {
          clone = topHeaders[1].cloneNode(true);
          cloneLinks = clone.getElementsByTagName("a");
          for (i = cloneLinks.length - 1; i >= 0; i -= 1) {
            cloneLinks[i].parentNode.removeChild(cloneLinks[i]);
          }
          noticeSource = textOf(clone);
          noticeLines = noticeSource.split(/\r?\n/);
          for (i = 0; i < noticeLines.length; i += 1) {
            text = noticeLines[i].replace(/^\s+|\s+$/g, "");
            if (text && text.indexOf("令和") !== 0) {
              settings.push({ Type: "notice", Text: text, URL: "", Sort: String(settings.length + 1) });
            }
          }
        }
      }
    }
    for (i = 0; i < settings.length; i += 1) {
      if (settings[i].Type === "date") {
        return [settings[i]];
      }
    }
    return [];
  }

  HtmlImport.parse = function (source) {
    var container = document.createElement("div");
    var tables;
    var table = null;
    var rows;
    var announcements = [];
    var links = [];
    var rowIndex;
    var linkIndex;
    var cells;
    var anchors;
    var announcementId;
    var settings;
    container.innerHTML = source;
    tables = container.getElementsByTagName("table");
    for (rowIndex = 0; rowIndex < tables.length; rowIndex += 1) {
      rows = tables[rowIndex].getElementsByTagName("tr");
      if (rows.length > 1 && rows[1].getElementsByTagName("td").length >= 5) {
        table = tables[rowIndex];
        break;
      }
    }
    if (!table) {
      throw new Error("公告一覧表を見つけられませんでした。");
    }
    settings = settingsFrom(container, table);
    rows = table.getElementsByTagName("tr");
    for (rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      cells = rows[rowIndex].getElementsByTagName("td");
      if (cells.length < 5) {
        continue;
      }
      announcementId = String(announcements.length + 1);
      announcements.push({ ID: announcementId, Category: textOf(cells[0]), Garrison: textOf(cells[1]), BidDate: textOf(cells[3]), Remarks: textOf(cells[4]), Sort: announcementId, Status: "公開" });
      anchors = cells[2].getElementsByTagName("a");
      for (linkIndex = 0; linkIndex < anchors.length; linkIndex += 1) {
        if (textOf(anchors[linkIndex]) && anchors[linkIndex].getAttribute("href") && anchors[linkIndex].getAttribute("href").indexOf("https://.pdf/") < 0) {
          links.push({ ID: String(links.length + 1), KokokuID: announcementId, Text: textOf(anchors[linkIndex]), FileName: fileName(anchors[linkIndex].getAttribute("href")), URL: relativeUrl(anchors[linkIndex].getAttribute("href")), Type: textOf(anchors[linkIndex]).toLowerCase().indexOf("変更公告") >= 0 ? "変更公告" : "公告", Sort: String(linkIndex + 1) });
        }
      }
    }
    return { announcements: announcements, links: links, settings: settings };
  };

  HtmlImport.readFile = function (file, success, error) {
    var reader = new FileReader();
    reader.onload = function () { success(reader.result); };
    reader.onerror = error;
    reader.readAsText(file, "UTF-8");
  };

  global.HtmlImport = HtmlImport;
}(this));
