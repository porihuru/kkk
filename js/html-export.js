(function (global) {
  "use strict";

  var HtmlExport = {};
  var templateSource = "";

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function linksFor(links, announcementId) {
    var result = [];
    var i;
    for (i = 0; i < links.length; i += 1) {
      if (String(links[i].KokokuID) === String(announcementId)) {
        result.push(links[i]);
      }
    }
    result.sort(function (left, right) {
      return (parseInt(left.Sort, 10) || 0) - (parseInt(right.Sort, 10) || 0);
    });
    return result;
  }

  function dateSetting(settings) {
    var i;
    for (i = 0; i < settings.length; i += 1) {
      if (settings[i].Type === "date" && settings[i].Text) {
        return settings[i].Text;
      }
    }
    return "";
  }

  function rowHtml(announcement, links, index) {
    var cells = [];
    var anchorCount = 0;
    var i;
    var background = index % 2 ? "#f0fff0" : "#fafdff";

    cells.push("<tr style=\"background-color:" + background + ";\">");
    cells.push("<td align=\"center\"><font color=\"red\">" + escapeHtml(announcement.Category) + "</font></td>");
    cells.push("<td align=\"center\">" + escapeHtml(announcement.Garrison) + "</td>");
    cells.push("<td>");
    for (i = 0; i < links.length; i += 1) {
      if (i > 0) {
        cells.push("<br>");
      }
      cells.push("<a href=\"" + escapeHtml(links[i].URL) + "\" target=\"_blank\">" + escapeHtml(links[i].Text) + "</a>");
      anchorCount += 1;
    }
    while (anchorCount < 5) {
      cells.push("<a href=\"https://.pdf/\" target=\"_blank\"></a>");
      anchorCount += 1;
    }
    cells.push("</td>");
    cells.push("<td align=\"center\">" + escapeHtml(announcement.BidDate) + "</td>");
    cells.push("<td align=\"center\">" + escapeHtml(announcement.Remarks) + "</td>");
    cells.push("</tr>");
    return cells.join("");
  }

  function replaceDate(source, dateText) {
    if (!dateText) {
      return source;
    }
    return source.replace(/(>[^<]*)(令和[0-9０-９]+年[0-9０-９]+月[0-9０-９]+日現在)([^<]*<\/label[^>]*>)/, "$1" + escapeHtml(dateText) + "$3");
  }

  function replaceRows(source, rows) {
    var pattern = /(<table\b[^>]*\bid\s*=\s*["']myTable["'][^>]*>[\s\S]*?<tbody\b[^>]*>)[\s\S]*?(<\/tbody>)/i;
    if (!pattern.test(source)) {
      if (global.Diagnostics) {
        global.Diagnostics.error("HTML", "テンプレート内に公告テーブル myTable が見つかりません。", "config/koukoku.html");
      }
      throw new Error("koukoku.html の公告テーブルを見つけられませんでした。");
    }
    return source.replace(pattern, "$1" + rows + "$2");
  }

  function disableDateSorting(source) {
    return source.replace(/\s+onclick\s*=\s*["']sortByDate\(\)["']/gi, "");
  }

  HtmlExport.loadTemplate = function (success, error) {
    var request = new XMLHttpRequest();
    request.open("GET", "config/koukoku.html", true);
    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        templateSource = request.responseText;
        if (global.Diagnostics) {
          global.Diagnostics.log("HTML", "公開HTMLテンプレートを読み込みました。", "config/koukoku.html");
        }
        success(templateSource);
      } else {
        if (global.Diagnostics) {
          global.Diagnostics.httpError("HTML", "GET", "config/koukoku.html", request);
        }
        if (error) {
          error(request);
        }
      }
    };
    request.send(null);
  };

  HtmlExport.create = function (announcements, links, settings) {
    var rows = [];
    var currentDate;
    var i;
    var announcementLinks;
    var source;

    if (!templateSource) {
      if (global.Diagnostics) {
        global.Diagnostics.error("HTML", "HTML出力を実行できません。テンプレートが未読込です。", "config/koukoku.html");
      }
      throw new Error("koukoku.html が読み込まれていません。");
    }
    settings = settings || [];
    currentDate = dateSetting(settings);
    for (i = 0; i < announcements.length; i += 1) {
      if (announcements[i].Status && announcements[i].Status !== "公告反映済" && announcements[i].Status !== "結果反映済" && announcements[i].Status !== "公開済み" && announcements[i].Status !== "公開") {
        continue;
      }
      announcementLinks = linksFor(links, announcements[i].ID);
      rows.push(rowHtml(announcements[i], announcementLinks, rows.length));
    }
    source = disableDateSorting(templateSource);
    source = replaceDate(source, currentDate);
    return replaceRows(source, rows.join(""));
  };

  HtmlExport.openPreview = function (announcements, links, settings) {
    var preview = window.open("", "kokokuPreview");
    if (!preview) {
      if (global.Diagnostics) {
        global.Diagnostics.warn("HTML", "プレビューのポップアップがブロックされました。", "ブラウザのポップアップ許可を確認してください。");
      }
      window.alert("ポップアップがブロックされています。許可してから再度実行してください。");
      return false;
    }
    preview.document.open();
    preview.document.write(HtmlExport.create(announcements, links, settings));
    preview.document.close();
    return true;
  };

  global.HtmlExport = HtmlExport;
}(this));