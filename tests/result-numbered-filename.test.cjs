const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const patterns = source.match(/\/_kk[^\n]*?\$\/i/g);
test("both save and publication guards recognize numbered result PDFs", () => {
  assert.equal(patterns.length, 2);
  patterns.forEach(pattern => {
    const re = new RegExp(pattern.slice(1, -2), "i");
    ["R8/be/test_kk.pdf", "R8/be/test_kk_2.pdf", "R8/be/test_kk_10.pdf", "R8/be/test_KK_3.PDF"].forEach(url => assert.ok(re.test(url), url));
  });
});
test("ordinary announcements and invalid extensions are still rejected", () => {
  patterns.forEach(pattern => {
    const re = new RegExp(pattern.slice(1, -2), "i");
    ["R8/be/test.pdf", "R8/be/test_2.pdf", "R8/be/test_kk_2.txt", ""].forEach(url => assert.equal(re.test(url), false, url));
  });
});
