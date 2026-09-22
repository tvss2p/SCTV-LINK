/**
 * SCTV LINK HUB - Google Apps Script バックエンド
 *
 * このスクリプトを、リンク一覧を管理する Google スプレッドシートに
 * 紐づく Apps Script プロジェクトとして貼り付け、「ウェブアプリ」として
 * デプロイして使用します（README.md 参照）。
 *
 * サイト側は fetch() や JSONP(<script>タグ) ではなく、
 * 「隠しiframeで実際にこのURLへ遷移させ、postMessageで結果を送り返す」
 * 方式でこのAPIを呼び出す(?embed=1 を付けて呼ばれる)。
 * fetch()はApps Script特有のCORS制約で、JSONPはChromeのCORB
 * (Cross-Origin Read Blocking / Apps ScriptがJavaScriptとして
 * 正しいContent-Typeを返さないため)でそれぞれ読み取れないことが
 * あるが、iframeへの実際のページ遷移+postMessageはCORS/CORBの
 * 対象外のため確実に動作する。
 * 読み取り・保存とも doGet だけで処理する
 * （保存は ?action=save&data=<base64のJSON> というGETリクエストとして送られてくる）。
 * ?embed=1 を付けずに直接ブラウザで開いた場合は、動作確認用に
 * 通常のJSONをそのまま返す。
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

// リンク一覧のキャッシュ設定。
// SpreadsheetApp でシートを読むのは1回あたり0.5〜1.5秒かかるため、
// 読み取り結果をスクリプトキャッシュに置き、2回目以降はそこから即座に返す。
// キャッシュは「管理ページからの保存時」と「シートを直接編集したとき(onEdit)」に更新される。
var CACHE_KEY = "links_json_v1";
var CACHE_TTL_SECONDS = 300; // 5分（万一キャッシュ更新を取りこぼしても、この時間で必ず読み直す）

// スリープ防止(keepWarm)を動かす時間帯。この範囲外ではシート読み取りを省く。
// 判定にはスクリプトのタイムゾーン設定が使われる
// （[プロジェクトの設定]→[タイムゾーン] が Asia/Tokyo になっているか確認してください）。
var KEEP_WARM_START_HOUR = 7;  // 7時台から
var KEEP_WARM_END_HOUR = 20;   // 20時になったら終了

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

function getCache_() {
  try {
    return CacheService.getScriptCache();
  } catch (err) {
    return null; // キャッシュが使えない環境でも、シート直読みで動作は継続する
  }
}

function putCachedLinks_(links) {
  var cache = getCache_();
  if (!cache) return;
  try {
    cache.put(CACHE_KEY, JSON.stringify(links), CACHE_TTL_SECONDS);
  } catch (err) {
    /* 100KB超などで保存できない場合は、単にキャッシュ無しで動く */
  }
}

function clearCachedLinks_() {
  var cache = getCache_();
  if (!cache) return;
  try {
    cache.remove(CACHE_KEY);
  } catch (err) {
    /* no-op */
  }
}

/**
 * リンク一覧を返す。キャッシュがあればシートを読まずにそれを返す。
 * skipCache が true の場合は必ずシートを読み直す（管理ページからの読み込み用）。
 */
function readLinksCached_(skipCache) {
  if (!skipCache) {
    var cache = getCache_();
    if (cache) {
      var hit = cache.get(CACHE_KEY);
      if (hit) {
        try {
          var links = JSON.parse(hit);
          if (Array.isArray(links)) return links;
        } catch (err) {
          /* 壊れていたら読み直す */
        }
      }
    }
  }
  var fresh = readLinks_();
  putCachedLinks_(fresh);
  return fresh;
}

/**
 * スプレッドシートを直接編集したときにキャッシュを捨てる（簡易トリガー）。
 * これにより、シートを手で書き換えた内容もすぐにサイトへ反映される。
 */
function onEdit(e) {
  clearCachedLinks_();
}

/**
 * 【スリープ防止】5分おきの時間主導型トリガーから呼ばれる。
 *
 * Apps Script は一定時間どこからも呼ばれないとスリープし、
 * 次の1回目の応答に10秒前後かかる（コールドスタート）。
 * 定期的に空回ししておくことでこれを防ぐ。
 * ついでにキャッシュも入れ直すので、業務時間中はキャッシュが切れることもなくなる
 * （トリガー間隔5分 ≦ キャッシュ有効期限5分）。
 *
 * 【設定方法】このファイルを保存したあと、Apps Scriptエディタ上部の
 * 関数選択メニューで setupKeepWarmTrigger を選び、「実行」を1回押すだけです。
 * （初回は承認画面が出ます。トリガー画面での手作業は不要です）
 */
function keepWarm() {
  var hour = new Date().getHours();
  // 時間外は、起動状態の維持だけして重いシート読み取りは行わない
  if (hour < KEEP_WARM_START_HOUR || hour >= KEEP_WARM_END_HOUR) return;
  try {
    putCachedLinks_(readLinks_());
  } catch (err) {
    clearCachedLinks_(); // 読めなかったときは古いキャッシュを残さない
  }
}

/**
 * keepWarm を5分おきに実行するトリガーを設定する（1回だけ手動実行すればOK）。
 * 何度実行しても重複しないよう、既存の同じトリガーは作り直す。
 * 停止したくなったら removeKeepWarmTrigger を実行してください。
 */
function setupKeepWarmTrigger() {
  removeKeepWarmTrigger();
  ScriptApp.newTrigger("keepWarm").timeBased().everyMinutes(5).create();
  Logger.log("スリープ防止トリガーを設定しました（5分おき / %s時〜%s時はシートも読み直し）",
    KEEP_WARM_START_HOUR, KEEP_WARM_END_HOUR);
}

/**
 * スリープ防止トリガーを解除する。
 */
function removeKeepWarmTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "keepWarm") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log("既存のスリープ防止トリガーを%s件削除しました", removed);
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

function handleRead_(skipCache) {
  try {
    return { ok: true, links: readLinksCached_(skipCache) };
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
    var saved = readLinks_();
    putCachedLinks_(saved); // 保存直後にキャッシュを最新化する
    return { ok: true, links: saved };
  } catch (err) {
    clearCachedLinks_();
    return { ok: false, error: "server_error", message: String(err) };
  }
}

/**
 * 結果をレスポンスとして返す。
 * embed=true の場合は、隠しiframeの中から結果をpostMessageで
 * 送り返す実行可能なHTMLとして返す(CORS/CORBの対象外になる)。
 * それ以外(直接ブラウザで開いた場合など)は通常のJSONとして返す。
 *
 * 注意: Apps ScriptのHtmlServiceは、コンテンツを独自の入れ子iframeで
 * ラップして配信する(サイト側から見ると、iframeの中にさらに
 * Apps Script自身の内部iframeが入っている状態になる)。そのため
 * window.parent だけでは呼び出し元の実際のページまで届かないことが
 * あるので、必ず一番外側のウィンドウまで届く window.top と、
 * 念のため window.parent の両方に送る。またDevToolsで
 * "Quirks Mode" の警告が出ることがあるが、これはApps Script側が
 * 独自に付与するマークアップによるもので実害はない(postMessageの
 * 実行には影響しない)。
 */
function respond_(result, embed) {
  if (embed) {
    var payload = JSON.stringify({ source: "sctv-link-hub", result: result });
    // "</" + "script" のように分割して、HTML側の</script>タグとの衝突を防ぐ
    var html =
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><" +
      "script>" +
      "var __sctvMsg = " + payload + ";" +
      "function __sctvSend(){" +
      "try{ if (window.top) window.top.postMessage(__sctvMsg, \"*\"); }catch(e){}" +
      "try{ if (window.parent && window.parent !== window.top) window.parent.postMessage(__sctvMsg, \"*\"); }catch(e){}" +
      "}" +
      "__sctvSend();" +
      "setTimeout(__sctvSend, 300);" +
      "</" +
      "script></body></html>";
    return HtmlService.createHtmlOutput(html);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * GET /exec?pw=xxxx                              → 現在のリンク一覧を取得(サーバー側キャッシュあり)
 * GET /exec?pw=xxxx&fresh=1                       → キャッシュを無視してシートから取得
 * GET /exec?pw=xxxx&action=save&data=<base64>     → リンク一覧を保存(丸ごと置き換え)
 * どちらも &embed=1 を付けるとiframe+postMessage用のHTMLとして応答する。
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var pw = params.pw || "";
  var embed = params.embed === "1";
  var result;

  if (pw !== getPassword_()) {
    result = { ok: false, error: "unauthorized" };
  } else if (params.action === "save") {
    result = handleSave_(params);
  } else {
    result = handleRead_(params.fresh === "1");
  }

  return respond_(result, embed);
}

/**
 * POST /exec  body: { "pw": "xxxx", "links": [ {id,name,url,description}, ... ] }
 * サイト側は現在このエンドポイントを使用していない(GET+iframeのみ使用)が、
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
    var savedLinks = readLinks_();
    putCachedLinks_(savedLinks);
    return respond_({ ok: true, links: savedLinks });
  } catch (err) {
    return respond_({ ok: false, error: "server_error", message: String(err) });
  }
}
