/**
 * ふりかえり記録 — Google Apps Script（Webアプリ）
 *
 * 役割：フロント(index.html)から送られた「過去の記録」を
 *       Googleカレンダーに終日イベントとして書き込む。
 *
 * ★ CORS対策（重要）★
 *   GASのWebアプリはCORSプリフライト(OPTIONS)を通せない。
 *   なのでフロントからは fetch(..., { mode:'no-cors', headers:{'Content-Type':'text/plain'} }) で送る。
 *   その場合ブラウザはボディを text/plain として送るので、
 *   GAS側では e.postData.contents を JSON.parse して受け取る（下記doPost参照）。
 *   ※ no-cors だとフロントは「応答」を読めない。成功/失敗はフロント側で
 *     ネットワーク例外の有無だけで判断する（＝オマケ同期という割り切り）。
 *
 * デプロイ設定：
 *   「デプロイ」→「新しいデプロイ」→ 種類=ウェブアプリ
 *   実行するユーザー：自分 / アクセスできるユーザー：全員
 */

// カテゴリ → Googleカレンダーの色
function colorFor(cat) {
  var m = {
    '仕事':               CalendarApp.EventColor.RED,
    '撮影編集':            CalendarApp.EventColor.GREEN,
    '研究・プログラミング': CalendarApp.EventColor.MAUVE,
    '3Dプリンター工作':    CalendarApp.EventColor.CYAN,
    'ダンス':             CalendarApp.EventColor.PALE_RED,
    '出会い':             CalendarApp.EventColor.ORANGE,
    '人と会う・イベント':   CalendarApp.EventColor.YELLOW,
    '生活・その他':        CalendarApp.EventColor.GRAY
  };
  return m[cat] || CalendarApp.EventColor.GRAY;
}

function doPost(e) {
  var res = { ok: false };
  try {
    // no-cors + text/plain で来るので、本文は e.postData.contents（文字列）を JSON.parse
    var d = JSON.parse(e.postData.contents);
    var cal = CalendarApp.getDefaultCalendar();
    var cats = d.cats || [];
    var tag = '[fk:' + d.id + ']';

    // アプリ側で削除した記録を、次回の読み込みで復活させない。
    if (d.action === 'delete') {
      var deleteFrom = new Date((d.date || '2010-01-01') + 'T00:00:00');
      var deleteTo = new Date(deleteFrom.getTime() + 86400000);
      var deleteEvents = cal.getEvents(deleteFrom, deleteTo, { search: tag });
      for (var di = 0; di < deleteEvents.length; di++) {
        if ((deleteEvents[di].getDescription() || '').indexOf(tag) !== -1) {
          deleteEvents[di].deleteEvent();
        }
      }
      res.ok = true;
      res.action = 'deleted';
      return jsonOutput_(res);
    }

    // 入力されたタイトルをGoogleカレンダーの予定名にする（旧データは従来形式にフォールバック）
    var catStr = cats.length ? cats.join('/') : 'その他';
    var title = d.title || ('[' + catStr + '] ' + (d.memo || '') + ' ・' + (d.hours || 0) + 'h');
    title = title.replace(/\s+/g, ' ').trim();
    var desc = 'カテゴリ: ' + catStr + '\n時間: ' + (d.hours || 0) + 'h' +
      (d.memo ? '\nメモ: ' + d.memo : '') + '\n' + tag; // 再送時の重複防止タグ

    var day = new Date(d.date + 'T00:00:00');
    // 開始・終了(HH:MM)があれば「時間指定イベント」、無ければ終日イベント
    var hasTime = d.start && d.end;
    var startDT = hasTime ? new Date(d.date + 'T' + d.start + ':00') : null;
    var endDT   = hasTime ? new Date(d.date + 'T' + d.end   + ':00') : null;
    // 2:00〜翌2:00表示で、24以上の時刻は翌日として扱う
    if (hasTime && Number(d.startH) >= 24) startDT = new Date(startDT.getTime() + 86400000);
    if (hasTime && Number(d.endH) >= 24) endDT = new Date(endDT.getTime() + 86400000);
    if (hasTime && endDT <= startDT) endDT = new Date(startDT.getTime() + 30 * 60000);

    // 既存イベントを [fk:id] タグで探す（±3日）→ あれば更新、無ければ作成
    var from = new Date(day.getTime() - 3 * 86400000);
    var to   = new Date(day.getTime() + 3 * 86400000);
    var evs = cal.getEvents(from, to), found = null;
    for (var i = 0; i < evs.length; i++) {
      if ((evs[i].getDescription() || '').indexOf(tag) !== -1) { found = evs[i]; break; }
    }

    var ev;
    if (found) {
      found.setTitle(title);
      found.setDescription(desc);
      if (hasTime) found.setTime(startDT, endDT);
      ev = found;
    } else {
      ev = hasTime
        ? cal.createEvent(title, startDT, endDT, { description: desc })
        : cal.createAllDayEvent(title, day, { description: desc });
    }

    // 代表色 = 先頭カテゴリの色
    if (cats.length) ev.setColor(colorFor(cats[0]));

    res.ok = true;
    res.action = found ? 'updated' : 'created';
  } catch (err) {
    res.error = String(err);
  }
  return jsonOutput_(res);
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Googleカレンダーに残っている、このアプリ由来の予定を読み返す。
 * GAS Webアプリは通常のCORS応答を付けられないため、フロントからは
 * <script> で読み込めるJSONPを使う。
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'list') {
    try {
      var callback = String(p.callback || 'callback');
      if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
        throw new Error('Invalid callback');
      }
      var from = new Date((p.from || '2010-01-01') + 'T00:00:00');
      var to = new Date((p.to || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')) + 'T23:59:59');
      var cal = CalendarApp.getDefaultCalendar();
      var events = cal.getEvents(from, to, { search: 'fk:' });
      var tz = Session.getScriptTimeZone();
      var records = [];

      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var desc = ev.getDescription() || '';
        var idMatch = desc.match(/\[fk:([^\]]+)\]/);
        if (!idMatch || idMatch[1] === 'test') continue;
        // Calendar側の改行コードに左右されないよう、説明欄を1行ずつ読む。
        var catText = '', hoursText = '', memoText = '';
        var lines = desc.split(/\r?\n/);
        for (var li = 0; li < lines.length; li++) {
          if (lines[li].indexOf('カテゴリ:') === 0) catText = lines[li].slice('カテゴリ:'.length).trim();
          else if (lines[li].indexOf('時間:') === 0) hoursText = lines[li].slice('時間:'.length).replace(/h\s*$/, '').trim();
          else if (lines[li].indexOf('メモ:') === 0) memoText = lines[li].slice('メモ:'.length).trim();
        }
        var eventTitle = ev.getTitle();
        var legacyTitle = eventTitle.match(/^\[([^\]]+)\]\s*(.*?)\s*・[0-9.]+h$/);
        if (!catText && legacyTitle) catText = legacyTitle[1];
        if (!memoText && legacyTitle && legacyTitle[2]) memoText = legacyTitle[2].trim();
        var displayTitle = legacyTitle && !legacyTitle[2] && memoText ? memoText : eventTitle;
        var start = ev.getStartTime();
        var end = ev.getEndTime();
        var allDay = ev.isAllDayEvent();
        var hours = hoursText !== '' && !isNaN(Number(hoursText)) ? Number(hoursText) : Math.max(0, (end.getTime() - start.getTime()) / 3600000);
        records.push({
          id: idMatch[1],
          date: Utilities.formatDate(start, tz, 'yyyy-MM-dd'),
          cats: catText ? catText.split('/') : ['生活・その他'],
          hours: hours,
          start: allDay ? '' : Utilities.formatDate(start, tz, 'HH:mm'),
          end: allDay ? '' : Utilities.formatDate(end, tz, 'HH:mm'),
          startH: allDay ? null : Number(Utilities.formatDate(start, tz, 'H')) + Number(Utilities.formatDate(start, tz, 'm')) / 60,
          endH: allDay ? null : Number(Utilities.formatDate(end, tz, 'H')) + Number(Utilities.formatDate(end, tz, 'm')) / 60,
          title: displayTitle,
          memo: memoText,
          synced: true,
          ts: start.getTime()
        });
      }

      var payload = callback + '(' + JSON.stringify({ ok: true, records: records }) + ');';
      return ContentService.createTextOutput(payload)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } catch (err) {
      var safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(String(p.callback || '')) ? String(p.callback) : 'callback';
      return ContentService.createTextOutput(safeCallback + '(' + JSON.stringify({ ok: false, error: String(err) }) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
  }
  // 疎通確認用（ブラウザでURLを開くと表示される）
  return ContentService.createTextOutput('OK: furikaeri GAS is alive');
}
