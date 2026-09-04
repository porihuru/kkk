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

http.createServer(function (request, response) {
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
}).listen(8000, "127.0.0.1", function () {
  console.log("Serving HTTP on 127.0.0.1 port 8000 (http://127.0.0.1:8000/) ...");
});
