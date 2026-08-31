/**
 * SCTV LINK HUB - Google Apps Script バックエンド
 *
 * このスクリプトを、リンク一覧を管理する Google スプレッドシートに
 * 紐づく Apps Script プロジェクトとして貼り付け、「ウェブアプリ」として
 * デプロイして使用します（README.md 参照）。
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
 */

var SHEET_NAME = "links"; // シート(タブ)名。実際のタブ名に合わせて変更してください。
var PASSWORD_PROPERTY_KEY = "SITE_PASSWORD";
var DEFAULT_PASSWORD = "2121";

function getPassword_() {
  var pw = PropertiesService.getScriptProperties().getProperty(PASSWORD_PROPERTY_KEY);
  return pw || DEFAULT_PASSWORD;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
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

/**
 * GET /exec?pw=xxxx
 * パスワードが正しい場合のみ、現在のリンク一覧を返す。
 */
function doGet(e) {
  var pw = (e && e.parameter && e.parameter.pw) || "";
  if (pw !== getPassword_()) {
    return jsonOutput_({ ok: false, error: "unauthorized" });
  }
  try {
    return jsonOutput_({ ok: true, links: readLinks_() });
  } catch (err) {
    return jsonOutput_({ ok: false, error: "server_error", message: String(err) });
  }
}

/**
 * POST /exec  body: { "pw": "xxxx", "links": [ {id,name,url,description}, ... ] }
 * パスワードが正しい場合のみ、シートの内容を丸ごと置き換える。
 * (プリフライトを避けるため、クライアントは Content-Type を指定しない
 *  text/plain な POST として送信すること)
 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput_({ ok: false, error: "invalid_body" });
  }
  if (!body || body.pw !== getPassword_()) {
    return jsonOutput_({ ok: false, error: "unauthorized" });
  }
  if (!Array.isArray(body.links)) {
    return jsonOutput_({ ok: false, error: "invalid_links" });
  }
  try {
    writeLinks_(body.links);
    return jsonOutput_({ ok: true, links: readLinks_() });
  } catch (err) {
    return jsonOutput_({ ok: false, error: "server_error", message: String(err) });
  }
}
