// セキュリティテスト。情報漏えい・XSS・意図しない外部通信を防ぐための検証。
// 大きく2種類:
// 1) 静的検証: ソースを読み、危険なAPI（eval/innerHTML代入/外部通信/外部URL）が
//    使われていないことを正規表現で確認する（軽量なSAST代わり）
// 2) 動的検証: jsdom上で実際に悪意ある入力を流し込み、DOMにスクリプトが
//    注入されない（常にテキストとして扱われる）ことを確認する
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom, fireInput, clickByText, flush, navForce, appRoot } from './setup/dom-env.js';

installDom();
document.body.innerHTML = '<header><span id="netBadge"></span></header><main id="app"></main>';

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart, saveChart } = await import('../js/store.js');
const { importFile } = await import('../js/export.js');
await import('../js/app.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

function readJsFiles() {
  // js/vendor 配下は自前で監査していない外部ライブラリ（xlsx.core.min.js）なので対象外。
  // これは「監査していないから」であって、危険とみなしているわけではない。
  const out = [];
  for (const name of fs.readdirSync(JS_DIR)) {
    const p = path.join(JS_DIR, name);
    if (fs.statSync(p).isDirectory()) continue;
    out.push({ file: 'js/' + name, src: fs.readFileSync(p, 'utf8') });
  }
  const dataDir = path.join(JS_DIR, 'data');
  for (const name of fs.readdirSync(dataDir)) {
    out.push({ file: 'js/data/' + name, src: fs.readFileSync(path.join(dataDir, name), 'utf8') });
  }
  return out;
}

describe('セキュリティ（静的検証）: 自前コードに危険なAPIが無いこと', () => {
  const files = readJsFiles();

  test('eval / new Function / document.write を使っていない', () => {
    for (const { file, src } of files) {
      assert.doesNotMatch(src, /\beval\s*\(/, `${file}: eval(...) が見つかった`);
      assert.doesNotMatch(src, /new\s+Function\s*\(/, `${file}: new Function(...) が見つかった`);
      assert.doesNotMatch(src, /document\.write\s*\(/, `${file}: document.write(...) が見つかった`);
    }
  });

  test('外部通信（fetch/XMLHttpRequest/sendBeacon/WebSocket）を行っていない（sw.jsの同一オリジンfetchを除く）', () => {
    for (const { file, src } of files) {
      assert.doesNotMatch(src, /XMLHttpRequest/, `${file}: XMLHttpRequest が見つかった`);
      assert.doesNotMatch(src, /sendBeacon/, `${file}: sendBeacon が見つかった`);
      assert.doesNotMatch(src, /new\s+WebSocket/, `${file}: WebSocket が見つかった`);
      assert.doesNotMatch(src, /\bfetch\s*\(/, `${file}: fetch(...) が見つかった（appは外部通信しない設計）`);
    }
  });

  test('innerHTML への代入は handwriting.js の固定SVG表示1箇所のみ（ユーザー入力を挟まない）', () => {
    const hits = files.filter(({ src }) => /\.innerHTML\s*=/.test(src));
    assert.equal(hits.length, 1, 'innerHTML への代入箇所数が想定と異なる');
    assert.equal(hits[0].file, 'js/handwriting.js');
    // BODY_CHARTS[bg] という固定マップからの参照のみで、文字列連結や変数直代入ではない
    assert.match(hits[0].src, /this\.bgLayer\.innerHTML = svg \|\| '';/);
  });

  test('el() ヘルパーに html: プロパティの受け口が無い（過去に存在したXSS経路を撤去済み）', () => {
    const ui = files.find((f) => f.file === 'js/ui.js').src;
    assert.doesNotMatch(ui, /k === 'html'/);
  });

  test('index.html / manifest / css は外部オリジンを一切参照しない（同一オリジンのみ）', () => {
    for (const f of ['index.html', 'manifest.webmanifest', 'css/styles.css']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.doesNotMatch(src, /https?:\/\//, `${f}: 外部URLが見つかった`);
    }
  });

  test('sw.js は他オリジンへのリクエストを素通りさせる（同一オリジン限定ガードがある）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    assert.match(src, /url\.origin !== self\.location\.origin/);
  });
});

describe('セキュリティ（動的検証）: 悪意ある入力を入れてもDOMに注入されない', () => {
  const nav = navForce;
  const appEl = appRoot;

  const XSS = '<img src=x onerror="window.__xss_fired = true">';
  const XSS_SCRIPT = '<script>window.__xss_fired = true</script>';

  beforeEach(async () => {
    await db.clear('clients');
    await db.clear('charts');
    delete window.__xss_fired;
    document.querySelectorAll('.overlay, .toast').forEach((n) => n.remove());
  });

  test('クライアント名にHTMLペイロードを入れても一覧・詳細でタグとして解釈されない', async () => {
    const c = newClient({
      name: XSS, kana: XSS_SCRIPT, birthday: '1990-01-01', sex: '男', startDate: '2026-01-01',
      goal: XSS, memo: XSS_SCRIPT,
    });
    await saveClient(c);

    await nav('#/');
    assert.equal(appEl().querySelector('img'), null);
    assert.equal(appEl().querySelector('script'), null);
    assert.ok(appEl().querySelector('.file-name').textContent.includes(XSS));
    assert.notEqual(window.__xss_fired, true);

    await nav('#/client/' + c.id);
    assert.equal(appEl().querySelector('img'), null);
    assert.equal(appEl().querySelector('script'), null);
    assert.ok(appEl().querySelector('.client-card').textContent.includes(XSS));
    assert.notEqual(window.__xss_fired, true);
  });

  test('カルテのメモ・テーブル欄にペイロードを入れてもタグとして解釈されない', async () => {
    const c = newClient({ name: 'テスト太郎', kana: 'テスト', birthday: '1990-01-01', sex: '男', startDate: '2026-01-01' });
    await saveClient(c);
    const ch = await createChart(c.id, 'karte');
    ch.pages.find((p) => p.name === '本日の記録').values.memo = XSS_SCRIPT;
    ch.pages.find((p) => p.name === 'メニュー・測定記録').values.items = [{ name: XSS, value: XSS_SCRIPT, reps: '', note: '' }];
    await saveChart(ch);

    await nav(`#/client/${c.id}/chart/${ch.id}`);
    clickByText(appEl(), '.pchip-name', '本日の記録');
    await flush();
    assert.equal(appEl().querySelector('script'), null);
    assert.equal(appEl().querySelector('img'), null);
    assert.notEqual(window.__xss_fired, true);
    // メモ欄(textarea)には文字列としてそのまま入っている（valueはHTML解釈されない）
    const memoTextarea = [...appEl().querySelectorAll('textarea')].find((t) => t.value === XSS_SCRIPT);
    assert.ok(memoTextarea);

    clickByText(appEl(), '.pchip-name', 'メニュー・測定記録');
    await flush();
    assert.equal(appEl().querySelector('script'), null);
    assert.equal(appEl().querySelector('img'), null);
    assert.notEqual(window.__xss_fired, true);
    // テーブルセル(input)にも文字列としてそのまま入っている
    const nameCell = [...appEl().querySelectorAll('.grid-table input')].find((i) => i.value === XSS);
    assert.ok(nameCell);
  });

  test('page.bg に不正な値を入れても固定マップ経由のためinnerHTMLに注入されない', async () => {
    const c = newClient({ name: 'テスト太郎', kana: 'テスト', birthday: '1990-01-01', sex: '男', startDate: '2026-01-01' });
    await saveClient(c);
    const ch = await createChart(c.id, 'karte');
    const canvasPage = ch.pages.find((p) => p.name === '白紙（手書き・自由記述）');
    canvasPage.bg = XSS_SCRIPT; // BODY_CHARTS に無いキー
    await saveChart(ch);

    await nav(`#/client/${c.id}/chart/${ch.id}`);
    // ページナビの最後（白紙タブ）を開く
    const chips = appEl().querySelectorAll('.pchip-name');
    [...chips].find((n) => n.textContent === '白紙（手書き・自由記述）').click();
    await flush();

    assert.equal(appEl().querySelector('script'), null);
    const bgLayer = appEl().querySelector('.pad-bg');
    assert.ok(bgLayer);
    assert.equal(bgLayer.innerHTML, ''); // 未知のbgキーは空表示になる（悪意ある文字列は描画されない）
    assert.notEqual(window.__xss_fired, true);
  });

  test('JSONバックアップの読み込み経由でもXSSペイロードはテキストとして扱われる', async () => {
    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'all',
      clients: [newClient({ id: 'cx1', name: XSS_SCRIPT, kana: 'インポート', birthday: '1990-01-01', sex: '女', startDate: '2026-01-01' })],
      charts: [],
    };
    await importFile({ text: async () => JSON.stringify(backup) }, { merge: true });

    await nav('#/');
    assert.equal(appEl().querySelector('script'), null);
    assert.ok(appEl().querySelector('.file-name').textContent.includes(XSS_SCRIPT));
    assert.notEqual(window.__xss_fired, true);
  });
});
