(function (global) {
  "use strict";

  var tokenizer = null;
  var loading = false;
  var waiting = [];
  var stationCodes = {
    "札幌": "sap",
    "真駒内": "325",
    "丘珠": "oka",
    "北千歳": "323",
    "南恵庭": "min",
    "北恵庭": "kit",
    "東千歳": "324",
    "静内": "siz",
    "幌別": "hor",
    "函館": "332",
    "倶知安": "kut",
    "美唄": "bib",
    "岩見沢": "iwa",
    "滝川": "345",
    "上富良野": "344",
    "留萌": "rum",
    "旭川": "343",
    "名寄": "342",
    "稚内": "wak",
    "遠軽": "376",
    "美幌": "375",
    "帯広": "374",
    "鹿追": "sik",
    "釧路": "377",
    "別海": "bek"
  };
  var pairMap = {
    "キャ": "kya", "キュ": "kyu", "キョ": "kyo",
    "ギャ": "gya", "ギュ": "gyu", "ギョ": "gyo",
    "シャ": "sha", "シュ": "shu", "ショ": "sho",
    "ジャ": "ja", "ジュ": "ju", "ジョ": "jo",
    "チャ": "cha", "チュ": "chu", "チョ": "cho",
    "ニャ": "nya", "ニュ": "nyu", "ニョ": "nyo",
    "ヒャ": "hya", "ヒュ": "hyu", "ヒョ": "hyo",
    "ビャ": "bya", "ビュ": "byu", "ビョ": "byo",
    "ピャ": "pya", "ピュ": "pyu", "ピョ": "pyo",
    "ミャ": "mya", "ミュ": "myu", "ミョ": "myo",
    "リャ": "rya", "リュ": "ryu", "リョ": "ryo",
    "ファ": "fa", "フィ": "fi", "フェ": "fe", "フォ": "fo",
    "フュ": "fyu", "ウィ": "wi", "ウェ": "we", "ウォ": "wo",
    "ティ": "ti", "トゥ": "tu", "ディ": "di", "ドゥ": "du",
    "ツァ": "tsa", "ツィ": "tsi", "ツェ": "tse", "ツォ": "tso",
    "シェ": "she", "ジェ": "je", "チェ": "che"
  };
  var kanaMap = {
    "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
    "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
    "ガ": "ga", "ギ": "gi", "グ": "gu", "ゲ": "ge", "ゴ": "go",
    "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
    "ザ": "za", "ジ": "ji", "ズ": "zu", "ゼ": "ze", "ゾ": "zo",
    "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
    "ダ": "da", "ヂ": "ji", "ヅ": "zu", "デ": "de", "ド": "do",
    "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
    "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho",
    "バ": "ba", "ビ": "bi", "ブ": "bu", "ベ": "be", "ボ": "bo",
    "パ": "pa", "ピ": "pi", "プ": "pu", "ペ": "pe", "ポ": "po",
    "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
    "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
    "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
    "ワ": "wa", "ヲ": "o", "ン": "n", "ヴ": "vu",
    "ヰ": "i", "ヱ": "e", "ヵ": "ka", "ヶ": "ke"
  };

  function notifyWaiters(error) {
    var callbacks = waiting;
    var i;
    waiting = [];
    for (i = 0; i < callbacks.length; i += 1) {
      callbacks[i](error);
    }
  }

  function load(done, error) {
    if (tokenizer) {
      done(tokenizer);
      return;
    }
    waiting.push(function (loadError) {
      if (loadError) {
        if (error) {
          error(loadError);
        }
        return;
      }
      done(tokenizer);
    });
    if (loading) {
      return;
    }
    loading = true;
    if (!global.kuromoji) {
      loading = false;
      if (global.Diagnostics) {
        global.Diagnostics.error("DICTIONARY", "Kuromoji.jsを読み込めませんでした。", "jisyo/kuromoji.js");
      }
      notifyWaiters(new Error("Kuromoji.jsを読み込めませんでした。"));
      return;
    }
    global.kuromoji.builder({ dicPath: "jisyo/dict/" }).build(function (buildError, builtTokenizer) {
      loading = false;
      if (buildError) {
        if (global.Diagnostics) {
          global.Diagnostics.error("DICTIONARY", "日本語辞書の読み込みに失敗しました。", (buildError && buildError.message ? buildError.message : String(buildError)) + "\r\nPath=jisyo/dict/");
        }
        notifyWaiters(buildError);
        return;
      }
      tokenizer = builtTokenizer;
      if (global.Diagnostics) {
        global.Diagnostics.log("DICTIONARY", "日本語辞書を読み込みました。", "jisyo/dict/");
      }
      notifyWaiters(null);
    });
  }

  function katakanaToRomaji(text) {
    var result = "";
    var i = 0;
    var smallTsu = false;
    var pair;
    var value;
    var first;
    while (i < text.length) {
      pair = text.substr(i, 2);
      if (pairMap[pair]) {
        value = pairMap[pair];
        i += 2;
      } else {
        first = text.charAt(i);
        if (first === "ッ") {
          smallTsu = true;
          i += 1;
          continue;
        }
        if (first === "ー") {
          i += 1;
          continue;
        }
        value = kanaMap[first] || first;
        i += 1;
      }
      if (smallTsu && value) {
        result += value.charAt(0);
        smallTsu = false;
      }
      result += value;
    }
    return result;
  }

  function titlePrefix(tokenizerInstance, title) {
    var tokens = tokenizerInstance.tokenize(title);
    var reading = "";
    var i;
    for (i = 0; i < tokens.length; i += 1) {
      reading += katakanaToRomaji(tokens[i].reading || tokens[i].surface_form || "");
    }
    return reading.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
  }

  function dateCode(date) {
    var reiwaYear = date.getFullYear() - 2018;
    return String(reiwaYear).padStart(2, "0") + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
  }

  function createResult(options, prefix, done, error) {
    var stationCode = stationCodes[options.garrison] || (!options.garrison ? "non" : null);
    var categoryCode = options.category === "結果" ? "kekka" : "n";
    var date = options.date || new Date();
    var fileName;
    if (!stationCode) {
      error(new Error("駐屯地コードが見つかりません。"));
      return;
    }
    if (!prefix) {
      error(new Error("PDF表示名からファイル名を作成できません。"));
      return;
    }
    fileName = dateCode(date) + "-" + stationCode + "-" + categoryCode + "-" + prefix + ".pdf";
    done({ fileName: fileName, url: "R" + (date.getFullYear() - 2018) + "/be/" + fileName, prefix: prefix });
  }

  function generate(options, done, error) {
    if (!options.title) {
      createResult(options, "examp", done, error);
      return;
    }
    load(function (tokenizerInstance) {
      createResult(options, titlePrefix(tokenizerInstance, options.title), done, error);
    }, error);
  }

  global.FilenameGenerator = {
    load: load,
    generate: generate
  };
}(this));