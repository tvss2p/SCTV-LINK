/**
 * SCTV LINK HUB - Google Apps Script バックエンド
 *
 * このスクリプトを、リンク一覧を管理する Google スプレッドシートに
 * 紐づく Apps Script プロジェクトとして貼り付け、「ウェブアプリ」として
 * デプロイして使用します（README.md 参照）。
 *
 * サイト側は fetch() ではなく JSONP（<script>タグ）でこのAPIを呼び出す。
 * (fetch()だとApps Script特有のCORS制約で読み取れないことがあるため)
 * 読み取り・保存とも doGet だけで処理する
 * （保存は ?action=save&data=<base64のJSON> というGETリクエストとして送られてくる）。
 *
 * シートの1行目はヘッダー行 (id, name, url, description) とし、
 * 2行目以降にリンクを1件ずつ入力してください。
 *
 *   id           name                       url                                            description
 *   campaign     ①キャンペーン確認サイト     https://tvss2p.github.io/sctv-campaign-site/   キャンペーン内容・重畳適用可否などを確認できます。
 *   ...
 *
 * パスワードはスクリプトプロパティ SITE_PASSWORD に設定してください。
 * （未設定の場合は既定値 "2121" が使われます）
 * [Apps Scriptエディタ] 左メニュー「プロジェクトの設定」→
 * 「スクリプト プロパティ」→ プロパティ追加: SITE_PASSWORD = 2121
 *
 * コードを更新したら、必ず「デプロイ」→「デプロイを管理」→ 対象デプロイの
 * 鉛筆アイコン →「バージョン: 新バージョン」→「デプロイ」で再デプロイしてください。
 * （URLは変わりません。再デプロイしないと古いコードのまま動作します）
 */

var SHEET_NAME = "links"; // シート(タブ)名。実際のタブ名に合わせて変更してください。
var PASSWORD_PROPERTY_KEY = "SITE_PASSWORD";
var DEFAULT_PASSWORD = "2121";

function getPassword_() {
  var pw = PropertiesService.getScriptProperties().getProperty(PASSWORD_PROPERTY_KEY);
  return pw || DEFAULT_PASSWORD;
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function readLinks_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var links = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || "");
    var name = String(row[1] || "");
    var url = String(row[2] || "");
    var description = String(row[3] || "");
    if (!id && !name && !url && !description) continue; // 空行はスキップ
    links.push({ id: id, name: name, url: url, description: description });
  }
  return links;
}

function writeLinks_(links) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  }
  sheet.getRange(1, 1, 1, 4).setValues([["id", "name", "url", "description"]]);
  if (links.length > 0) {
    var rows = links.map(function (l, i) {
      return [
        l.id || "link-" + (i + 1),
        l.name || "",
        l.url || "",
        l.description || "",
      ];
    });
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
}

function base64ToUtf8_(base64) {
  var bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes).getDataAsString("UTF-8");
}

function handleRead_() {
  try {
    return { ok: true, links: readLinks_() };
  } catch (err) {
    return { ok: false, error: "server_error", message: String(err) };
  }
}

function handleSave_(params) {
  var links;
  try {
    var jsonStr = base64ToUtf8_(params.data || "");
    var body = JSON.parse(jsonStr);
    links = body.links;
  } catch (err) {
    return { ok: false, error: "invalid_body" };
  }
  if (!Array.isArray(links)) {
    return { ok: false, error: "invalid_links" };
  }
  try {
    writeLinks_(links);
    return { ok: true, links: readLinks_() };
  } catch (err) {
    return { ok: false, error: "server_error", message: String(err) };
  }
}

/**
 * 結果をレスポンスとして返す。
 * callback が指定されている場合(JSONP)は `callback(JSON文字列);` という
 * 実行可能なJavaScriptとして返し、指定がなければ通常のJSONとして返す。
 */
function respond_(result, callback) {
  if (callback) {
    var js = callback + "(" + JSON.stringify(result) + ");";
    return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * GET /exec?pw=xxxx                              → 現在のリンク一覧を取得
 * GET /exec?pw=xxxx&action=save&data=<base64>     → リンク一覧を保存(丸ごと置き換え)
 * どちらも &callback=xxx を付けるとJSONPとして応答する。
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var pw = params.pw || "";
  var callback = params.callback;
  var result;

  if (pw !== getPassword_()) {
    result = { ok: false, error: "unauthorized" };
  } else if (params.action === "save") {
    result = handleSave_(params);
  } else {
    result = handleRead_();
  }

  return respond_(result, callback);
}

/**
 * POST /exec  body: { "pw": "xxxx", "links": [ {id,name,url,description}, ... ] }
 * サイト側は現在このエンドポイントを使用していない(JSONPのGETのみ使用)が、
 * CORSの問題が発生しない環境など、他クライアントからの利用のために残してある。
 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_({ ok: false, error: "invalid_body" });
  }
  if (!body || body.pw !== getPassword_()) {
    return respond_({ ok: false, error: "unauthorized" });
  }
  if (!Array.isArray(body.links)) {
    return respond_({ ok: false, error: "invalid_links" });
  }
  try {
    writeLinks_(body.links);
    return respond_({ ok: true, links: readLinks_() });
  } catch (err) {
    return respond_({ ok: false, error: "server_error", message: String(err) });
  }
}
