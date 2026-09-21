(function (global) {
  "use strict";
  var W = {};
  W.fields = ["ListKind", "PublicState", "VerifiedAt", "WorkType", "SourceAnnouncementID", "WorkflowKey", "ResultSubmittedById", "ResultSubmittedByName", "ResultSubmittedAt"];
  W.copy = function (item) { var result = {}, key; for (key in item) { if (item.hasOwnProperty(key)) { result[key] = item[key]; } } return result; };
  W.state = function (item) { return item.PublicState || (item.Category === "結果" ? "結果掲載中" : "公告掲載中"); };
  W.due = function (item, now) {
    var m = /^R(\d+)\.(\d+)\.(\d+)$/.exec(item.BidDate || "");
    if (!m || W.state(item) !== "公告掲載中") { return false; }
    var y = 2018 + Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    var d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) { return false; }
    return (now || new Date()).getTime() >= d.getTime() - 9 * 3600000;
  };
  W.candidate = function (announcements, links, endedUrl) {
    var result = { announcements: announcements.map(W.copy), links: links.map(W.copy) }, i, j, target;
    // Original links stay in the stored data. Only the publication copy is replaced.
    for (i = 0; i < result.announcements.length; i += 1) {
      target = result.announcements[i]; target.Status = target.Category === "結果" ? "結果反映済" : "公告反映済";
      if (W.state(target) === "掲載終了") { target.Category = ""; }
      if (W.state(target) === "結果掲載中") { target.Category = "結果"; target.Status = "結果反映済"; }
      if (W.state(target) === "公告掲載中") { continue; }
      var original = null;
      for (j = 0; j < result.links.length; j += 1) { if (String(result.links[j].KokokuID) === String(target.ID)) { original = result.links[j]; break; } }
      if (!original) { throw new Error("元の公告PDFリンクがありません：" + target.ID); }
      var replacement = W.copy(original);
      replacement.URL = W.state(target) === "掲載終了" ? endedUrl : replacement.URL;
      if (!replacement.URL) { throw new Error("公開PDFのリンク先が未設定です：" + target.ID); }
      replacement.Type = W.state(target) === "掲載終了" ? "掲載終了" : "結果";
      result.links = result.links.filter(function (link) { return String(link.KokokuID) !== String(target.ID); });
      result.links.push(replacement);
    }
    return result;
  };
  W.signature = function (data, resolveUrl) {
    function text(value) { return String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
    return JSON.stringify(data.announcements.map(function (item) {
      return [text(item.Category), text(item.Garrison), text(item.BidDate), text(item.Remarks), data.links.filter(function (link) { return String(link.KokokuID) === String(item.ID); }).sort(function (a,b) { return Number(a.Sort || 0)-Number(b.Sort || 0); }).map(function (link) { return [text(link.Text), resolveUrl(link.URL)]; })];
    }));
  };
  global.PublicationWorkflow = W;
}(this));
