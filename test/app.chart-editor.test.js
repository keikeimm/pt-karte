// カルテエディタ（ページ描画・各フィールド種別・手書き・スキップ送り・
// ページ追加/削除・名称変更/削除）の結合テスト。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireClick, fireInput, fireChange, firePointer, stubRect, byText, clickByText, flush } from './setup/dom-env.js';

installDom();
document.body.innerHTML = '<header><span id="netBadge"></span></header><main id="app"></main>';

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart, getChart } = await import('../js/store.js');
await import('../js/app.js');

function nav(hash) {
  location.hash = '#/__force__';
  location.hash = hash;
  return flush();
}
function appEl() {
  return document.getElementById('app');
}
function cleanupOverlays() {
  document.querySelectorAll('.overlay, .toast').forEach((n) => n.remove());
}
function pageTitle() {
  return appEl().querySelector('.page-h-title').textContent;
}
function gotoPageByName(name) {
  return clickByText(appEl(), '.pchip-name', name);
}
async function waitSaved() {
  await new Promise((r) => setTimeout(r, 550)); // debounce(450ms) 経過を待つ
}

let client;
beforeEach(async () => {
  await db.clear('clients');
  await db.clear('charts');
  cleanupOverlays();
  client = newClient({
    name: '編集太郎', kana: 'ヘンシュウ', birthday: '1995-03-03',
    sex: '男', phone: '09000001111', email: 'e@example.com', startDate: '2026-01-01',
  });
  await saveClient(client);
});

describe('カルテエディタ: 共通', () => {
  test('ページナビは pages 数だけ表示され、先頭がactive・顧客データが頭に出る', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    const chips = appEl().querySelectorAll('.pchip');
    assert.equal(chips.length, ch.pages.length);
    assert.ok(chips[0].classList.contains('active'));
    assert.match(appEl().querySelector('.client-strip').textContent, /編集太郎/);
    assert.match(appEl().querySelector('.client-summary').textContent, /編集太郎/);
  });

  test('ページ送り・戻りとページ数表示', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.equal(appEl().querySelector('#pageCount').textContent, `1 / ${ch.pages.length}`);

    clickByText(appEl(), 'button', '次のページ →');
    await flush();
    assert.equal(appEl().querySelector('#pageCount').textContent, `2 / ${ch.pages.length}`);

    clickByText(appEl(), 'button', '← 前のページ');
    await flush();
    assert.equal(appEl().querySelector('#pageCount').textContent, `1 / ${ch.pages.length}`);
  });

  test('ページを飛ばす設定にすると、送りボタンでスキップされる', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    // 「セッション情報」「メニュー記録」は skippable:false なのでスキップ不可な別ページを使う
    gotoPageByName(ch.pages[3].name); // 有酸素・コンディショニング
    await flush();
    appEl().querySelector('.skip-toggle input').click();
    await flush();
    assert.ok(appEl().querySelectorAll('.pchip')[3].classList.contains('skipped'));

    gotoPageByName(ch.pages[2].name); // メニュー記録へ
    await flush();
    clickByText(appEl(), 'button', '次のページ →'); // 4番目はスキップされ5番目へ
    await flush();
    assert.equal(pageTitle(), ch.pages[4].name);
  });

  test('名称変更で editor-title が更新される', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    clickByText(appEl(), 'button', '名称変更');
    const input = document.querySelector('.modal input');
    fireInput(input, '9月分セッション記録');
    clickByText(document.body, '.modal-foot button', '保存');
    await flush();
    assert.match(appEl().querySelector('.editor-title').textContent, /9月分セッション記録/);
    assert.equal((await getChart(ch.id)).title, '9月分セッション記録');
  });

  test('削除でクライアント詳細に戻り、カルテが消える', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    clickByText(appEl(), 'button', '削除');
    clickByText(document.body, '.modal-foot button', 'OK');
    await flush();
    assert.equal(location.hash, '#/client/' + client.id);
    assert.equal(await getChart(ch.id), undefined);
  });

  test('存在しないチャートIDはクライアント詳細にリダイレクト', async () => {
    await nav(`#/client/${client.id}/chart/nope`);
    assert.equal(location.hash, '#/client/' + client.id);
  });
});

describe('カルテエディタ: フォームフィールド', () => {
  test('text/number/select/textarea を入力すると保存される（session）', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('セッション情報');
    await flush();

    const grid = appEl().querySelector('.field-grid');
    fireInput(grid.querySelector('input[type=date]'), '2026-02-01');
    fireInput(grid.querySelector('input[type=number]'), '12');
    const selects = grid.querySelectorAll('select');
    fireChange(selects[0], '良い'); // 体調
    fireInput(grid.querySelector('textarea'), '腕立て10回できた');
    await waitSaved();

    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === 'セッション情報');
    assert.equal(p.values.date, '2026-02-01');
    assert.equal(p.values.sessionNo, '12');
    assert.equal(p.values.condition, '良い');
    assert.equal(p.values.homeworkCheck, '腕立て10回できた');
  });

  test('テーブルフィールドは行の追加・削除ができる（メニュー記録）', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('メニュー記録');
    await flush();

    const rowsBefore = appEl().querySelectorAll('.grid-table tr.data').length;
    fireInput(appEl().querySelector('.grid-table tr.data input'), 'ベンチプレス');
    clickByText(appEl(), 'button', '＋ 行を追加');
    await flush();
    assert.equal(appEl().querySelectorAll('.grid-table tr.data').length, rowsBefore + 1);

    // 追加した末尾の（空の）行だけを削除し、先頭の「ベンチプレス」行は残す
    const delButtons = appEl().querySelectorAll('.row-del');
    fireClick(delButtons[delButtons.length - 1]);
    await flush();
    assert.equal(appEl().querySelectorAll('.grid-table tr.data').length, rowsBefore);

    await waitSaved();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === 'メニュー記録');
    assert.ok(p.values.menu.some((r) => r.ex === 'ベンチプレス'));
  });

  test('yesno フィールド（PAR-Q+）を選択できる（counseling）', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('医学スクリーニング（PAR-Q+）');
    await flush();

    const yn = appEl().querySelector('.field-yesno .yn');
    assert.ok(yn, 'yesno field should render');
    const yesRadio = yn.querySelectorAll('input[type=radio]')[0];
    yesRadio.click(); // checkbox/radioの活性化(check+change発火)は本物の.click()が必要
    await waitSaved();

    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '医学スクリーニング（PAR-Q+）');
    assert.equal(p.values.parq1, 'はい');
  });

  test('checkbox フィールドと静的文（注意事項）が描画され、チェックが保存される（precautions）', async () => {
    const ch = await createChart(client.id, 'precautions');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.equal(pageTitle(), '運動参加の注意事項'); // 顧客データページを持たない
    assert.match(appEl().querySelector('.static-text').textContent, /体調不良/);

    const cb = appEl().querySelector('.field-inline input[type=checkbox]');
    cb.click();
    await waitSaved();

    const saved = await getChart(ch.id);
    assert.equal(saved.pages[0].values.readPrecautions, true);
  });

  test('sign フィールド（署名）に描画し、クリアできる（precautions）', async () => {
    const ch = await createChart(client.id, 'precautions');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('免責・キャンセルポリシー');
    await flush();

    const signCanvas = appEl().querySelector('.sign-box .pad-canvas');
    assert.ok(signCanvas);
    stubRect(signCanvas, { width: 300, height: 100 });
    stubRect(signCanvas.closest('.pad-wrap'), { width: 300, height: 100 });
    firePointer(signCanvas, 'pointerdown', { x: 10, y: 10, pointerId: 9 });
    firePointer(signCanvas, 'pointermove', { x: 80, y: 20, pointerId: 9 });
    firePointer(signCanvas, 'pointerup', { x: 80, y: 20, pointerId: 9 });
    await waitSaved();

    let saved = await getChart(ch.id);
    let p = saved.pages.find((x) => x.name === '免責・キャンセルポリシー');
    assert.equal(p.values.signature.length, 1);

    clickByText(appEl(), 'button', '署名クリア');
    clickByText(document.body, '.modal-foot button', 'OK');
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '免責・キャンセルポリシー');
    assert.equal(p.values.signature.length, 0);
  });
});

describe('カルテエディタ: 手書きページ（canvas）', () => {
  test('ペン/消しゴム切替・色・太さ・undo/redo・背景選択・クリアが一通り動く', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('セッションメモ（手書き）');
    await flush();

    const canvas = appEl().querySelector('.pad-canvas');
    stubRect(canvas, { width: 300, height: 300 });
    stubRect(canvas.closest('.pad-wrap'), { width: 300, height: 300 });

    firePointer(canvas, 'pointerdown', { x: 10, y: 10, pointerId: 5 });
    firePointer(canvas, 'pointermove', { x: 60, y: 40, pointerId: 5 });
    firePointer(canvas, 'pointerup', { x: 60, y: 40, pointerId: 5 });
    await waitSaved();
    let saved = await getChart(ch.id);
    let p = saved.pages.find((x) => x.name === 'セッションメモ（手書き）');
    assert.equal(p.strokes.length, 1);
    assert.equal(p.strokes[0].tool, 'pen');

    clickByText(appEl(), 'button', '⌫ 消しゴム');
    firePointer(canvas, 'pointerdown', { x: 5, y: 5, pointerId: 6 });
    firePointer(canvas, 'pointerup', { x: 5, y: 5, pointerId: 6 });
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === 'セッションメモ（手書き）');
    assert.equal(p.strokes[1].tool, 'eraser');

    fireClick(appEl().querySelector('.swatches .sw')); // 色を選ぶとpenツールに戻る
    fireInput(appEl().querySelector('.width-range'), '8');
    fireClick(byText(appEl(), 'button', '↶ 取消'));
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === 'セッションメモ（手書き）');
    assert.equal(p.strokes.length, 1);

    fireChange(appEl().querySelector('.bg-select'), 'body-front');
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === 'セッションメモ（手書き）');
    assert.equal(p.bg, 'body-front');

    fireInput(appEl().querySelector('.page-content textarea'), 'フォームが安定してきた');
    clickByText(appEl(), 'button', 'クリア');
    clickByText(document.body, '.modal-foot button', 'OK');
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === 'セッションメモ（手書き）');
    assert.equal(p.strokes.length, 0);
    assert.equal(p.values.note, 'フォームが安定してきた');
  });
});

describe('カルテエディタ: note ページ', () => {
  test('自由記入テキストが保存される', async () => {
    const ch = await createChart(client.id, 'session');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('次回への申し送り・宿題');
    await flush();

    fireInput(appEl().querySelector('.note-area'), '次回は下半身メニュー中心に');
    await waitSaved();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '次回への申し送り・宿題');
    assert.equal(p.text, '次回は下半身メニュー中心に');
  });
});

describe('カルテエディタ: 白紙テンプレのページ追加/削除', () => {
  test('ページを追加でき、種別・名前が反映される', async () => {
    const ch = await createChart(client.id, 'blank');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    const before = appEl().querySelectorAll('.pchip').length;

    clickByText(appEl(), 'button', '＋ ページを追加');
    const nameInput = document.querySelector('.modal input[type=text]');
    fireInput(nameInput, '姿勢写真');
    const canvasRadio = [...document.querySelectorAll('.kind-pick input[type=radio]')][2];
    canvasRadio.click();
    clickByText(document.body, '.modal-foot button', '追加');
    await flush();

    assert.equal(appEl().querySelectorAll('.pchip').length, before + 1);
    const saved = await getChart(ch.id);
    const added = saved.pages[saved.pages.length - 1];
    assert.equal(added.name, '姿勢写真');
    assert.equal(added.kind, 'canvas');
  });

  test('複数ページあるときはページ削除ボタンが出て削除できる', async () => {
    const ch = await createChart(client.id, 'blank');
    ch.pages.push({ id: 'extra', name: '追加ページ', kind: 'note', skippable: true, skipped: false, bg: null, placeholder: '', fields: [], values: {}, text: '', strokes: [] });
    await (await import('../js/store.js')).saveChart(ch);
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('追加ページ');
    await flush();

    // 「削除」ボタンはクラム（カルテ全体削除）とページヘッダ（このページ削除）の
    // 2箇所にあるため、ページヘッダ側に絞る
    const pagesBefore = ch.pages.length; // 顧客データ + 白紙ページ + 追加ページ = 3
    clickByText(appEl().querySelector('.page-head'), 'button', '削除');
    clickByText(document.body, '.modal-foot button', 'OK');
    await waitSaved(); // ページ削除もdebounce保存なので反映を待つ

    const saved = await getChart(ch.id);
    assert.equal(saved.pages.length, pagesBefore - 1);
    assert.ok(!saved.pages.some((p) => p.name === '追加ページ'));
  });
});
