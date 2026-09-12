var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");

var root = path.resolve(__dirname, "..");
var mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".gz": "application/octet-stream"
};

function isInsideRoot(filePath) {
  var relative = path.relative(root, filePath);
  return relative === "" || (relative.substr(0, 2) !== ".." && !path.isAbsolute(relative));
}

function sendFile(response, filePath) {
  fs.stat(filePath, function (statError, stats) {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function reportReady() {
  console.log("Serving HTTP on 127.0.0.1 port 8000 (http://127.0.0.1:8000/) ...");
  if (process.argv.indexOf("--open") !== -1) {
    var candidates = [
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Microsoft/Edge/Application/msedge.exe")
    ];
    var executable = candidates.find(function (candidate) { return fs.existsSync(candidate); });
    if (!executable) {
      console.error("Microsoft Edge was not found. Open http://127.0.0.1:8000/ in your browser.");
      process.exitCode = 1;
      return;
    }
    var browser = require("child_process").spawn(executable, ["--new-window", "http://127.0.0.1:8000/"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    browser.on("error", function (error) {
      console.error("Cannot open Edge: " + error.message);
      process.exitCode = 1;
    });
    browser.unref();
  }
}

var server = http.createServer(function (request, response) {
  var pathname;
  var filePath;
  try {
    pathname = decodeURIComponent(url.parse(request.url).pathname);
  } catch (error) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }
  if (pathname === "/") {
    pathname = "/index.html";
  }
  filePath = path.resolve(root, "." + pathname);
  if (!isInsideRoot(filePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  sendFile(response, filePath);
});

server.on("error", function (error) {
  function fail() {
    console.error("Cannot start kkk: " + error.message);
    process.exitCode = 1;
  }
  if (error.code !== "EADDRINUSE") {
    fail();
    return;
  }
  // Reuse an existing server only when it serves this application's index.
  var expected = fs.readFileSync(path.join(root, "index.html"));
  var probe = http.get("http://127.0.0.1:8000/index.html", function (response) {
    var chunks = [];
    var size = 0;
    response.on("data", function (chunk) {
      size += chunk.length;
      if (size > expected.length) {
        probe.destroy(new Error("Different application on port 8000"));
        return;
      }
      chunks.push(chunk);
    });
    response.on("error", fail);
    response.on("end", function () {
      if (response.statusCode === 200 && Buffer.concat(chunks).equals(expected)) {
        reportReady();
      } else {
        fail();
      }
    });
  });
  probe.setTimeout(3000, function () {
    probe.destroy(new Error("Server check timed out"));
  });
  probe.on("error", fail);
});

server.listen(8000, "127.0.0.1", reportReady);
