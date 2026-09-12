(function (global) {
  "use strict";
  var W = {};
  W.fields = ["ListKind", "PublicState", "TargetID", "RequestType", "RequestStatus", "ResultURL", "ResultName", "VerifiedAt"];
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
  W.active = function (request) { return request.RequestType && request.RequestStatus !== "反映確認済み"; };
  W.validate = function (request, announcements) {
    var target = null, i;
    for (i = 0; i < announcements.length; i += 1) { if (String(announcements[i].ID) === String(request.TargetID)) { target = announcements[i]; } }
    if (!target) { throw new Error("元の公告が見つかりません。"); }
    if (request.RequestType !== "掲載終了依頼" && request.RequestType !== "結果登録") { throw new Error("更新依頼の種類が不正です。"); }
    if (request.RequestType === "掲載終了依頼" && W.state(target) !== "公告掲載中" && !(W.state(target) === "掲載終了" && request.RequestStatus === "公開待ち")) { throw new Error("掲載終了にできるのは公告掲載中の案件です。"); }
    if (request.RequestType === "結果登録" && !/^R\d+\/[A-Za-z0-9_\/-]+\.pdf$/i.test(request.ResultURL || "")) { throw new Error("結果PDFの登録が必要です。"); }
    return target;
  };
  W.candidate = function (announcements, links, requests, endedUrl) {
    var result = { announcements: announcements.map(W.copy), links: links.map(W.copy) }, used = {}, i, j, r, target;
    for (i = 0; i < requests.length; i += 1) {
      r = requests[i];
      if (r.RequestStatus !== "公開待ち") { continue; }
      target = W.validate(r, result.announcements);
      if (used[String(target.ID)]) { throw new Error("同じ公告に複数の公開待ち依頼があります。"); }
      used[String(target.ID)] = true;
      target.PublicState = r.RequestType === "掲載終了依頼" ? "掲載終了" : "結果掲載中";
      target.Category = r.RequestType === "結果登録" ? "結果" : "";
      target.ResultURL = r.ResultURL || target.ResultURL || "";
      target.ResultName = r.ResultName || target.ResultName || "";
    }
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
      replacement.URL = W.state(target) === "掲載終了" ? endedUrl : target.ResultURL;
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
