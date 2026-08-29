/* CSVデータを読み込むデータアクセス層。SharePoint対応時も画面側のAPIを維持する。 */
(function (global) {
  "use strict";

  var CsvData = {};

  CsvData.load = function (success, error) {
    var requests = {
      announcements: "csv/kokoku.csv",
      links: "csv/links.csv",
      settings: "csv/settings.csv"
    };
    var result = {};
    var remaining = 3;
    var failed = false;
    var key;

    function loaded(name, rows) {
      result[name] = rows;
      remaining -= 1;
      if (remaining === 0 && !failed) {
        success(result);
      }
    }

    function failedLoad(request) {
      if (!failed) {
        failed = true;
        error(request);
      }
    }

    for (key in requests) {
      if (requests.hasOwnProperty(key)) {
        CsvData.loadFile(requests[key], loaded.bind(null, key), failedLoad);
      }
    }
  };

  CsvData.loadFile = function (path, success, error) {
    var request = new XMLHttpRequest();
    request.open("GET", path, true);
    request.onreadystatechange = function () {
      if (request.readyState !== 4) {
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        success(CsvData.parse(request.responseText));
      } else {
        error(request);
      }
    };
    request.send(null);
  };

  CsvData.parse = function (text) {
    var rows = [];
    var row = [];
    var value = "";
    var quoted = false;
    var i;
    var character;
    var next;

    for (i = 0; i < text.length; i += 1) {
      character = text.charAt(i);
      next = text.charAt(i + 1);
      if (character === '"' && quoted && next === '"') {
        value += '"';
        i += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(value);
        value = "";
      } else if ((character === "\r" || character === "\n") && !quoted) {
        if (character === "\r" && next === "\n") {
          i += 1;
        }
        row.push(value);
        if (row.length > 1 || row[0] !== "") {
          rows.push(row);
        }
        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    if (value !== "" || row.length > 0) {
      row.push(value);
      rows.push(row);
    }

    return CsvData.toObjects(rows);
  };

  CsvData.toObjects = function (rows) {
    var objects = [];
    var headers = rows.length ? rows[0] : [];
    var i;
    var j;
    var object;

    for (i = 1; i < rows.length; i += 1) {
      object = {};
      for (j = 0; j < headers.length; j += 1) {
        object[headers[j]] = rows[i][j] || "";
      }
      objects.push(object);
    }
    return objects;
  };

  CsvData.toCsv = function (objects, columns) {
    var lines = [columns.join(",")];
    var i;
    var j;
    var values;
    for (i = 0; i < objects.length; i += 1) {
      values = [];
      for (j = 0; j < columns.length; j += 1) {
        values.push(CsvData.escapeValue(objects[i][columns[j]]));
      }
      lines.push(values.join(","));
    }
    return "\ufeff" + lines.join("\r\n") + "\r\n";
  };

  CsvData.escapeValue = function (value) {
    var text = String(value === undefined || value === null ? "" : value);
    if (text.indexOf(",") >= 0 || text.indexOf('"') >= 0 || text.indexOf("\r") >= 0 || text.indexOf("\n") >= 0) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  };

  global.CsvData = CsvData;
}(this));