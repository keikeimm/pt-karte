// カルテエディタ（ページ＝タブ描画・各フィールド種別・手書き・スキップ送り・
// 記入日の変更・削除）の結合テスト。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  installDom, fireClick, fireInput, fireChange, firePointer, stubRect, byText, clickByText,
  flush, navForce, saveNow, appRoot,
} from './setup/dom-env.js';

installDom();
document.body.innerHTML = '<header><span id="netBadge"></span></header><main id="app"></main>';

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart, saveChart, getChart, todayISO } = await import('../js/store.js');
await import('../js/app.js');

const nav = navForce;
const appEl = appRoot;
function cleanupOverlays() {
  document.querySelectorAll('.overlay, .toast').forEach((n) => n.remove());
}
function pageTitle() {
  return appEl().querySelector('.page-h-title').textContent;
}
function gotoPageByName(name) {
  return clickByText(appEl(), '.pchip-name', name);
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
  test('karte は白紙1ページのみ。ページナビ・前後ボタン・スキップ設定は表示されない', async () => {
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    assert.equal(ch.pages.length, 1);
    assert.equal(appEl().querySelector('#pageNav'), null);
    assert.equal(appEl().querySelector('.page-move'), null);
    assert.equal(appEl().querySelector('.skip-toggle'), null);
    assert.match(appEl().querySelector('.client-strip').textContent, /編集太郎/);
    assert.equal(pageTitle(), '白紙（手書き・自由記述）');
  });

  test('counseling（複数ページ）はページナビが表示され、先頭がactive', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    const chips = appEl().querySelectorAll('.pchip');
    assert.equal(chips.length, ch.pages.length);
    assert.ok(chips[0].classList.contains('active'));
  });

  test('ページ送り・戻りとページ数表示（counseling）', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.equal(appEl().querySelector('#pageCount').textContent, `1 / ${ch.pages.length}`);

    clickByText(appEl(), 'button', '次のページ →');
    await flush();
    assert.equal(appEl().querySelector('#pageCount').textContent, `2 / ${ch.pages.length}`);

    clickByText(appEl(), 'button', '← 前のページ');
    await flush();
    assert.equal(appEl().querySelector('#pageCount').textContent, `1 / ${ch.pages.length}`);
  });

  test('ページを飛ばす設定にすると、送りボタンでスキップされる（counseling）', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    gotoPageByName('生活・食習慣'); // index 1
    await flush();
    appEl().querySelector('.skip-toggle input').click();
    await flush();
    assert.ok(appEl().querySelectorAll('.pchip')[1].classList.contains('skipped'));

    gotoPageByName('目標・運動歴'); // index 0
    await flush();
    clickByText(appEl(), 'button', '次のページ →'); // 2番目(index1)はスキップされ3番目(index2)へ
    await flush();
    assert.equal(pageTitle(), '医学スクリーニング（PAR-Q+）');
  });

  test('記入日はその場で変更でき、保存される', async () => {
    const ch = await createChart(client.id, 'karte', '2026-04-01');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.match(appEl().querySelector('.editor-title').textContent, /カルテ/);

    const dateInput = appEl().querySelector('.date-edit input[type=date]');
    assert.equal(dateInput.value, '2026-04-01');
    fireChange(dateInput, '2026-04-15');
    await saveNow();

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
  test('select/number/textarea を入力すると保存される（counseling: 生活・食習慣）', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('生活・食習慣');
    await flush();

    const grid = appEl().querySelector('.field-grid');
    fireChange(grid.querySelector('select'), 'あり'); // 喫煙
    fireInput(grid.querySelector('input[type=number]'), '7'); // 睡眠時間
    fireInput(grid.querySelector('textarea'), '甲殻類'); // アレルギー
    await saveNow();

    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '生活・食習慣');
    assert.equal(p.values.smoke, 'あり');
    assert.equal(p.values.sleepHours, '7');
    assert.equal(p.values.allergy, '甲殻類');
  });

  test('テーブルフィールドは行の追加・削除ができる（将来のテンプレ拡張向けの描画確認）', async () => {
    // 現行3テンプレに table フィールドは無いが、レンダラは汎用なので直接ページを足して検証する
    const ch = await createChart(client.id, 'karte');
    ch.pages.push({
      id: 'table1', name: '測定記録', kind: 'form', skippable: true, skipped: false, bg: null,
      placeholder: '', values: {}, text: '', strokes: [],
      fields: [{
        type: 'table', key: 'items', label: '種目・測定項目',
        columns: [{ key: 'name', label: '種目・項目', type: 'text' }, { key: 'value', label: '数値', type: 'text' }],
        rows: Array.from({ length: 3 }, () => ({})),
      }],
    });
    await saveChart(ch);
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    gotoPageByName('測定記録');
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

    await saveNow();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '測定記録');
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
    await saveNow();

    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '医学スクリーニング（PAR-Q+）');
    assert.equal(p.values.parq1, 'はい');
  });

  test('checkbox フィールドと静的文（注意事項）が描画され、チェックが保存される（precautions）', async () => {
    const ch = await createChart(client.id, 'precautions');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.equal(pageTitle(), '運動参加の注意事項');
    assert.match(appEl().querySelector('.static-text').textContent, /体調不良/);

    const cb = appEl().querySelector('.field-inline input[type=checkbox]');
    cb.click();
    await saveNow();

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
    await saveNow();

    let saved = await getChart(ch.id);
    let p = saved.pages.find((x) => x.name === '免責・キャンセルポリシー');
    assert.equal(p.values.signature.length, 1);

    clickByText(appEl(), 'button', '署名クリア');
    clickByText(document.body, '.modal-foot button', 'OK');
    await saveNow();
    saved = await getChart(ch.id);
    p = saved.pages.find((x) => x.name === '免責・キャンセルポリシー');
    assert.equal(p.values.signature.length, 0);
  });
});

describe('カルテエディタ: 白紙（手書き・自由記述）ページ', () => {
  test('ペン/消しゴム切替・色・太さ・undo/redo・背景選択・クリア・メモが一通り動く', async () => {
    const ch = await createChart(client.id, 'karte');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    // karte は白紙1ページのみなのでタブ切替は不要、そのまま表示されている

    const canvas = appEl().querySelector('.pad-canvas');
    stubRect(canvas, { width: 300, height: 300 });
    stubRect(canvas.closest('.pad-wrap'), { width: 300, height: 300 });

    firePointer(canvas, 'pointerdown', { x: 10, y: 10, pointerId: 5 });
    firePointer(canvas, 'pointermove', { x: 60, y: 40, pointerId: 5 });
    firePointer(canvas, 'pointerup', { x: 60, y: 40, pointerId: 5 });
    await saveNow();
    let saved = await getChart(ch.id);
    assert.equal(saved.pages[0].strokes.length, 1);
    assert.equal(saved.pages[0].strokes[0].tool, 'pen');

    clickByText(appEl(), 'button', '⌫ 消しゴム');
    firePointer(canvas, 'pointerdown', { x: 5, y: 5, pointerId: 6 });
    firePointer(canvas, 'pointerup', { x: 5, y: 5, pointerId: 6 });
    await saveNow();
    saved = await getChart(ch.id);
    assert.equal(saved.pages[0].strokes[1].tool, 'eraser');

    fireClick(appEl().querySelector('.swatches .sw')); // 色を選ぶとpenツールに戻る
    fireInput(appEl().querySelector('.width-range'), '8');
    fireClick(byText(appEl(), 'button', '↶ 取消'));
    await saveNow();
    saved = await getChart(ch.id);
    assert.equal(saved.pages[0].strokes.length, 1);

    fireChange(appEl().querySelector('.bg-select'), 'body-front');
    await saveNow();
    saved = await getChart(ch.id);
    assert.equal(saved.pages[0].bg, 'body-front');

    fireInput(appEl().querySelector('.page-content textarea'), '姿勢がやや前傾');
    clickByText(appEl(), 'button', 'クリア');
    clickByText(document.body, '.modal-foot button', 'OK');
    await saveNow();
    saved = await getChart(ch.id);
    assert.equal(saved.pages[0].strokes.length, 0);
    assert.equal(saved.pages[0].values.note, '姿勢がやや前傾');
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
    await saveNow();
    const saved = await getChart(ch.id);
    const p = saved.pages.find((x) => x.name === '振り返り');
    assert.equal(p.text, '次回は下半身メニュー中心に');
  });
});

describe('カルテエディタ: 保存ボタン（カウンセリング/同意書/カルテすべてに存在する）', () => {
  test('karte: 保存ボタンが表示され、押すと保存済みになる', async () => {
    const ch = await createChart(client.id, 'karte', '2026-06-01');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.ok(byText(appEl(), '.crumbs button', '保存'), '保存ボタンが見当たらない');

    fireInput(appEl().querySelector('.page-content textarea'), '本日は絶好調');
    assert.match(appEl().querySelector('#savedTag').textContent, /未保存/);

    await saveNow();
    assert.match(appEl().querySelector('#savedTag').textContent, /保存済み/);
    assert.match(document.body.textContent, /保存しました/);
    assert.equal((await getChart(ch.id)).pages[0].values.note, '本日は絶好調');
  });

  test('counseling: 保存ボタンが表示され、押すと保存済みになる', async () => {
    const ch = await createChart(client.id, 'counseling');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.ok(byText(appEl(), '.crumbs button', '保存'), '保存ボタンが見当たらない');

    fireInput(appEl().querySelector('textarea'), 'ベンチプレス120kg'); // 「目標・運動歴」ページのmainGoal
    assert.match(appEl().querySelector('#savedTag').textContent, /未保存/);

    await saveNow();
    assert.match(appEl().querySelector('#savedTag').textContent, /保存済み/);
    assert.equal((await getChart(ch.id)).pages[0].values.mainGoal, 'ベンチプレス120kg');
  });

  test('precautions: 保存ボタンが表示され、押すと保存済みになる', async () => {
    const ch = await createChart(client.id, 'precautions');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    assert.ok(byText(appEl(), '.crumbs button', '保存'), '保存ボタンが見当たらない');

    appEl().querySelector('.field-inline input[type=checkbox]').click();
    assert.match(appEl().querySelector('#savedTag').textContent, /未保存/);

    await saveNow();
    assert.match(appEl().querySelector('#savedTag').textContent, /保存済み/);
    assert.equal((await getChart(ch.id)).pages[0].values.readPrecautions, true);
  });
});

describe('カルテエディタ: 保存せず離れようとすると確認する', () => {
  test('未保存のまま離れようとすると確認が出る。キャンセルで留まり編集内容は保持、OKで移動すると保存されない', async () => {
    const ch = await createChart(client.id, 'karte', '2026-07-01');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    fireInput(appEl().querySelector('.page-content textarea'), '保存してない編集');
    assert.match(appEl().querySelector('#savedTag').textContent, /未保存/);

    // 「戻る」に相当するハッシュ変更（リンククリックでも browser back でも同じ経路を通る）。
    // location.hash 自体は即座に書き換わる（hashchangeの性質上ここでは戻せない）ため、
    // 確認ダイアログが出ていることだけをまず見る
    location.hash = '#/client/' + client.id;
    await flush();
    assert.match(document.body.textContent, /保存されていない変更があります/);

    // キャンセル（留まる）: ガードが直前のハッシュ（エディタ）へ戻す。編集内容もメモリ上に残ったまま
    clickByText(document.body, '.modal-foot button', 'キャンセル');
    await flush();
    assert.match(location.hash, /\/chart\//);
    assert.equal(appEl().querySelector('.page-content textarea').value, '保存してない編集');

    // もう一度離れようとして、今度はOK（保存せず移動）
    location.hash = '#/client/' + client.id;
    await flush();
    clickByText(document.body, '.modal-foot button', 'OK');
    await flush();

    assert.equal(location.hash, '#/client/' + client.id);
    const saved = await getChart(ch.id);
    assert.notEqual(saved.pages[0].values.note, '保存してない編集');
  });

  test('保存してから離れると確認は出ない', async () => {
    const ch = await createChart(client.id, 'karte', '2026-07-02');
    await nav(`#/client/${client.id}/chart/${ch.id}`);
    fireInput(appEl().querySelector('.page-content textarea'), '保存する編集');
    await saveNow();

    location.hash = '#/client/' + client.id;
    await flush();

    assert.equal(location.hash, '#/client/' + client.id); // 確認なしで即移動
    assert.doesNotMatch(document.body.textContent, /保存されていない変更があります/);
    assert.equal((await getChart(ch.id)).pages[0].values.note, '保存する編集');
  });

  test('日付を他のカルテと重複させて保存しようとすると失敗し、未保存のままになる', async () => {
    await createChart(client.id, 'karte', '2026-08-01');
    const ch = await createChart(client.id, 'karte', '2026-08-02');
    await nav(`#/client/${client.id}/chart/${ch.id}`);

    fireChange(appEl().querySelector('.date-edit input[type=date]'), '2026-08-01');
    await saveNow();

    assert.match(document.body.textContent, /既に存在します/);
    assert.match(appEl().querySelector('#savedTag').textContent, /未保存/); // 保存できていない
    assert.equal((await getChart(ch.id)).date, '2026-08-02'); // DB上は変更されていない
  });
});
