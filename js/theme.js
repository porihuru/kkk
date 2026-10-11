(function () {
  "use strict";
  var root = document.documentElement;
  var storageKey = "kkk-theme";
  var theme = "light";
  try {
    if (window.localStorage.getItem(storageKey) === "dark") { theme = "dark"; }
  } catch (ignore) {}
  root.setAttribute("data-theme", theme);

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("theme-toggle");
    if (!button) { return; }
    function updateButton() {
      var dark = root.getAttribute("data-theme") === "dark";
      button.setAttribute("aria-pressed", String(dark));
      button.title = dark ? "ライトモードに切り替え" : "ダークモードに切り替え";
    }
    updateButton();
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      updateButton();
      try { window.localStorage.setItem(storageKey, next); } catch (ignore) {}
    });
  });
}());
