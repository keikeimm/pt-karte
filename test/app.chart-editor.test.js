// カルテエディタ（ページ＝タブ描画・各フィールド種別・手書き・スキップ送り・
// 記入日の変更・削除）の結合テスト。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireClick, fireInput, fireChange, firePointer, stubRect, byText, clickByText, flush } from './setup/dom-env.js';

installDom();
document.body.innerHTML = '<header><span id="netBadge"></span></header><main id="app"></main>';

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart, saveChart, getChart, todayISO } = await import('../js/store.js');
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
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    const chips = appEl().querySelectorAll('.pchip');
    assert.equal(chips.length, ch.pages.length);
    assert.ok(chips[0].classList.contains('active'));
    assert.match(appEl().querySelector('.client-strip').textContent, /編集太郎/);
    assert.match(appEl().querySelector('.client-summary').textContent, /編集太郎/);
  });

  test('ページ送り・戻りとページ数表示', async () => {
    const ch = await createChart(client.id, 'karte');
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
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    // 「顧客データ」「本日の記録」は skippable:false なのでスキップ不可な別ページを使う
    gotoPageByName('メニュー・測定記録'); // index 2
    await flush();
    appEl().querySelector('.skip-toggle input').click();
    await flush();
    assert.ok(appEl().querySelectorAll('.pchip')[2].classList.contains('skipped'));

    gotoPageByName('本日の記録'); // index 1
    await flush();
    clickByText(appEl(), 'button', '次のページ →'); // 2番目(index2)はスキップされ3番目(index3)へ
    await flush();
    assert.equal(pageTitle(), '白紙（手書き・自由記述）');
  });

  test('記入日はその場で変更でき、保存される', async () => {
    const ch = await createChart(client.id, 'karte', '2026-04-01');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.match(appEl().querySelector('.editor-title').textContent, /カルテ/);

    const dateInput = appEl().querySelector('.date-edit input[type=date]');
    assert.equal(dateInput.value, '2026-04-01');
    fireChange(dateInput, '2026-04-15');
    await waitSaved();

    assert.equal((await getChart(ch.id)).date, '2026-04-15');
  });

  test('counseling/precautions はテンプレ名固定で表示（日付編集は出ない）', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.match(appEl().querySelector('.editor-title').textContent, /初回カウンセリングシート/);
    assert.equal(appEl().querySelector('.date-edit'), null);
  });

  test('削除でクライアント詳細に戻り、カルテが消える', async () => {
    const ch = await createChart(client.id, 'karte');
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
  test('select/number/textarea を入力すると保存される（本日の記録）', async () => {
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('本日の記録');
    await flush();

    const grid = appEl().querySelector('.field-grid');
    fireChange(grid.querySelector('select'), '良い'); // 体調
    const numbers = grid.querySelectorAll('input[type=number]');
    fireInput(numbers[0], '7'); // 睡眠時間
    fireInput(numbers[1], '65.5'); // 体重
    fireInput(numbers[2], '18.2'); // 体脂肪率
    fireInput(grid.querySelector('textarea'), '絶好調');
    await waitSaved();

    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '本日の記録');
    assert.equal(p.values.condition, '良い');
    assert.equal(p.values.sleepHours, '7');
    assert.equal(p.values.weight, '65.5');
    assert.equal(p.values.bodyFat, '18.2');
    assert.equal(p.values.memo, '絶好調');
  });

  test('テーブルフィールドは行の追加・削除ができる（メニュー・測定記録）', async () => {
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('メニュー・測定記録');
    await flush();

    const rowsBefore = appEl().querySelectorAll('.grid-table tr.data').length;
    fireInput(appEl().querySelector('.grid-table tr.data input'), 'スクワット');
    clickByText(appEl(), 'button', '＋ 行を追加');
    await flush();
    assert.equal(appEl().querySelectorAll('.grid-table tr.data').length, rowsBefore + 1);

    // 追加した末尾の（空の）行だけを削除し、先頭の「スクワット」行は残す
    const delButtons = appEl().querySelectorAll('.row-del');
    fireClick(delButtons[delButtons.length - 1]);
    await flush();
    assert.equal(appEl().querySelectorAll('.grid-table tr.data').length, rowsBefore);

    await waitSaved();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === 'メニュー・測定記録');
    assert.ok(p.values.items.some((r) => r.name === 'スクワット'));
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

describe('カルテエディタ: 白紙（手書き・自由記述）ページ', () => {
  test('ペン/消しゴム切替・色・太さ・undo/redo・背景選択・クリア・メモが一通り動く', async () => {
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('白紙（手書き・自由記述）');
    await flush();

    const canvas = appEl().querySelector('.pad-canvas');
    stubRect(canvas, { width: 300, height: 300 });
    stubRect(canvas.closest('.pad-wrap'), { width: 300, height: 300 });

    firePointer(canvas, 'pointerdown', { x: 10, y: 10, pointerId: 5 });
    firePointer(canvas, 'pointermove', { x: 60, y: 40, pointerId: 5 });
    firePointer(canvas, 'pointerup', { x: 60, y: 40, pointerId: 5 });
    await waitSaved();
    let saved = await getChart(ch.id);
    let p = saved.pages.find((x) => x.name === '白紙（手書き・自由記述）');
    assert.equal(p.strokes.length, 1);
    assert.equal(p.strokes[0].tool, 'pen');

    clickByText(appEl(), 'button', '⌫ 消しゴム');
    firePointer(canvas, 'pointerdown', { x: 5, y: 5, pointerId: 6 });
    firePointer(canvas, 'pointerup', { x: 5, y: 5, pointerId: 6 });
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '白紙（手書き・自由記述）');
    assert.equal(p.strokes[1].tool, 'eraser');

    fireClick(appEl().querySelector('.swatches .sw')); // 色を選ぶとpenツールに戻る
    fireInput(appEl().querySelector('.width-range'), '8');
    fireClick(byText(appEl(), 'button', '↶ 取消'));
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '白紙（手書き・自由記述）');
    assert.equal(p.strokes.length, 1);

    fireChange(appEl().querySelector('.bg-select'), 'body-front');
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '白紙（手書き・自由記述）');
    assert.equal(p.bg, 'body-front');

    fireInput(appEl().querySelector('.page-content textarea'), '姿勢がやや前傾');
    clickByText(appEl(), 'button', 'クリア');
    clickByText(document.body, '.modal-foot button', 'OK');
    await waitSaved();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '白紙（手書き・自由記述）');
    assert.equal(p.strokes.length, 0);
    assert.equal(p.values.note, '姿勢がやや前傾');
  });
});

describe('カルテエディタ: note ページ（将来のテンプレ拡張向けの描画確認）', () => {
  test('kind:note のページは自由記入テキストとして描画・保存される', async () => {
    // 現行3テンプレに note ページは無いが、レンダラは汎用なので直接ページを足して検証する
    const ch = await createChart(client.id, 'karte');
    ch.pages.push({
      id: 'note1', name: '振り返り', kind: 'note', skippable: true, skipped: false,
      bg: null, placeholder: '振り返りを書いてください', fields: [], values: {}, text: '', strokes: [],
    });
    await saveChart(ch);
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('振り返り');
    await flush();

    fireInput(appEl().querySelector('.note-area'), '次回は下半身メニュー中心に');
    await waitSaved();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '振り返り');
    assert.equal(p.text, '次回は下半身メニュー中心に');
  });
});
