(function (global) {
  "use strict";

  var ZipExport = {};

  function word(value) {
    return String.fromCharCode(value & 255, (value >>> 8) & 255);
  }

  function dword(value) {
    return word(value) + word(value >>> 16);
  }

  function crc32(binary) {
    var crc = -1;
    var i;
    var j;
    var code;
    for (i = 0; i < binary.length; i += 1) {
      code = (crc ^ binary.charCodeAt(i)) & 255;
      for (j = 0; j < 8; j += 1) {
        code = code & 1 ? (code >>> 1) ^ 3988292384 : code >>> 1;
      }
      crc = (crc >>> 8) ^ code;
    }
    return (crc ^ -1) >>> 0;
  }

  function ascii(value) {
    var result = "";
    var i;
    for (i = 0; i < value.length; i += 1) {
      result += String.fromCharCode(value.charCodeAt(i) & 255);
    }
    return result;
  }

  function utf8(value) {
    return unescape(encodeURIComponent(value));
  }

  function byteLength(binary) {
    return binary.length;
  }

  function toBytes(binary) {
    var bytes = new Uint8Array(binary.length);
    var i;
    for (i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) & 255;
    }
    return bytes;
  }

  ZipExport.create = function (files, success) {
    var local = [];
    var central = [];
    var offset = 0;
    var finished = 0;
    var i;

    function addFile(file) {
      var name = ascii(file.name);
      var binary = file.binary ? file.content : utf8(file.content);
      var checksum = crc32(binary);
      var header = "PK\x03\x04" + word(20) + word(0) + word(0) + word(0) + word(0) + dword(checksum) + dword(binary.length) + dword(binary.length) + word(name.length) + word(0) + name;
      var entry = "PK\x01\x02" + word(20) + word(20) + word(0) + word(0) + word(0) + word(0) + dword(checksum) + dword(binary.length) + dword(binary.length) + word(name.length) + word(0) + word(0) + word(0) + word(0) + dword(0) + dword(offset) + name;
      local.push(header);
      local.push(toBytes(binary));
      central.push(entry);
      offset += header.length + binary.length;
      finished += 1;
      if (finished === files.length) {
        central.push("PK\x05\x06" + word(0) + word(0) + word(files.length) + word(files.length) + dword(central.join("").length) + dword(offset) + word(0));
        success(new Blob([local.join(""), central.join("")], { type: "application/zip" }));
      }
    }

    if (!files.length) {
      success(new Blob([], { type: "application/zip" }));
      return;
    }
    for (i = 0; i < files.length; i += 1) {
      if (files[i].content !== undefined) {
        addFile(files[i]);
      } else {
        (function (file) {
          var reader = new FileReader();
          reader.onload = function () { addFile({ name: file.name, content: reader.result, binary: true }); };
          reader.readAsBinaryString(file.file);
        }(files[i]));
      }
    }
  };

  global.ZipExport = ZipExport;
}(this));
