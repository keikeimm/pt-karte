// app.js は export を持たない副作用モジュール（hashchangeで自走するSPA）なので、
// 実際のブラウザ利用に近い形で jsdom 上にDOMを用意し、hash遷移とクリック/入力
// イベントを発火させて検証する結合テスト。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, fireClick, fireInput, fireChange, byText, clickByText, flush } from './setup/dom-env.js';

installDom();
document.body.innerHTML = '<header><span id="netBadge"></span></header><main id="app"></main>';

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart, getClient, getChart, listCharts } = await import('../js/store.js');
await import('../js/app.js'); // 副作用: hashchangeを購読し、初回renderを実行

function nav(hash) {
  // location.hash が既に同じ値だと hashchange が発火せず再描画されないため、
  // 一度ダミーの hash を経由して確実に render() を呼ばせる。
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

beforeEach(async () => {
  await db.clear('clients');
  await db.clear('charts');
  cleanupOverlays();
  await nav('#/');
});

describe('クライアント一覧', () => {
  test('クライアントが居ない場合は空状態メッセージ', async () => {
    await nav('#/');
    assert.match(appEl().textContent, /まだクライアントがいません/);
  });

  test('登録したクライアントがカードとして一覧に出る（更新順）', async () => {
    const a = newClient({ name: 'Aさん', kana: 'エー', goal: '減量' });
    await saveClient(a);
    await new Promise((r) => setTimeout(r, 5));
    const b = newClient({ name: 'Bさん', kana: 'ビー', goal: '増量' });
    await saveClient(b);

    await nav('#/');
    const cards = appEl().querySelectorAll('.file-card');
    assert.equal(cards.length, 2);
    assert.match(cards[0].textContent, /Bさん/);
    assert.match(cards[1].textContent, /Aさん/);
  });

  test('検索で一致しないカードは非表示になる', async () => {
    await saveClient(newClient({ name: '山田太郎', kana: 'ヤマダ' }));
    await saveClient(newClient({ name: '鈴木花子', kana: 'スズキ' }));
    await nav('#/');

    const search = appEl().querySelector('.search');
    fireInput(search, '鈴木');
    const visible = [...appEl().querySelectorAll('.file-card')].filter((c) => c.style.display !== 'none');
    assert.equal(visible.length, 1);
    assert.match(visible[0].textContent, /鈴木花子/);

    fireInput(search, '');
    const allVisible = [...appEl().querySelectorAll('.file-card')].filter((c) => c.style.display !== 'none');
    assert.equal(allVisible.length, 2);
  });
});

describe('クライアント新規作成', () => {
  test('必須項目が空だとトーストが出て作成されない', async () => {
    await nav('#/');
    clickByText(appEl(), 'button', '＋ クライアント');
    clickByText(document.body, '.modal-foot button', '作成');
    await flush();

    assert.match(document.body.textContent, /未入力の必須項目があります/);
    assert.equal((await db.getAll('clients')).length, 0);
    cleanupOverlays();
  });

  test('必須項目を埋めて作成すると保存され詳細画面に遷移する', async () => {
    await nav('#/');
    clickByText(appEl(), 'button', '＋ クライアント');
    const modal = document.querySelector('.modal');

    fireInput(modal.querySelector('#cf_name'), '田中一郎');
    fireInput(modal.querySelector('#cf_kana'), 'タナカ');
    fireInput(modal.querySelector('#cf_birthday'), '1990-01-01');
    fireChange(modal.querySelector('#cf_sex'), '男');
    fireInput(modal.querySelector('#cf_phone'), '090-1234-5678');
    fireInput(modal.querySelector('#cf_email'), 'a@example.com');
    fireInput(modal.querySelector('#cf_startDate'), '2026-01-01');

    // 電話は数字以外が自動除去される
    assert.equal(modal.querySelector('#cf_phone').value, '09012345678');

    clickByText(document.body, '.modal-foot button', '作成');
    await flush();

    const all = await db.getAll('clients');
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '田中一郎');
    assert.equal(all[0].sex, '男');
    assert.equal(location.hash, '#/client/' + all[0].id);
  });
});

describe('クライアント詳細（ファイルを開いた状態）', () => {
  let client;
  beforeEach(async () => {
    client = newClient({
      name: '被験者A', kana: 'ヒケンシャ', goal: '姿勢改善', birthday: '1990-05-05',
      sex: '女', phone: '09011112222', email: 'a@example.com', startDate: '2026-01-01',
    });
    await saveClient(client);
  });

  test('顧客データが上部に表示され、カルテはまだ無い旨が出る', async () => {
    await nav('#/client/' + client.id);
    assert.match(appEl().querySelector('.client-card').textContent, /被験者A/);
    assert.match(appEl().textContent, /カルテはまだありません/);
  });

  test('カウンセリングシートボタンは初回「新規作成」、作成後は「開く」になる', async () => {
    await nav('#/client/' + client.id);
    const btn = [...appEl().querySelectorAll('.btn-tile')].find((b) => b.textContent.includes('カウンセリングシート'));
    assert.match(btn.textContent, /新規作成/);

    fireClick(btn);
    await flush();
    assert.match(location.hash, /\/chart\//);

    const charts = await listCharts(client.id);
    assert.equal(charts.length, 1);
    assert.equal(charts[0].role, 'counseling');

    await nav('#/client/' + client.id);
    const btn2 = [...appEl().querySelectorAll('.btn-tile')].find((b) => b.textContent.includes('カウンセリングシート'));
    assert.match(btn2.textContent, /開く/);
  });

  test('カウンセリング/注意書きチャートはカルテ一覧に重複表示されない', async () => {
    await createChart(client.id, 'counseling');
    await createChart(client.id, 'precautions');
    await createChart(client.id, 'session');
    await nav('#/client/' + client.id);

    const cards = appEl().querySelectorAll('.chart-card');
    assert.equal(cards.length, 1);
    assert.match(cards[0].textContent, /トレーニングセッション記録/);
  });

  test('新規カルテのテンプレ選択にカウンセリング/注意書きは出ない', async () => {
    await nav('#/client/' + client.id);
    clickByText(appEl(), 'button', '＋ 新規カルテ');
    const names = [...document.querySelectorAll('.tpl-card .tpl-name')].map((n) => n.textContent);
    assert.ok(!names.includes('初回カウンセリングシート'));
    assert.ok(!names.includes('注意事項・免責同意書'));
    assert.ok(names.includes('トレーニングセッション記録'));
  });

  test('テンプレを選ばず作成しようとするとトースト', async () => {
    await nav('#/client/' + client.id);
    clickByText(appEl(), 'button', '＋ 新規カルテ');
    clickByText(document.body, '.modal-foot button', '作成');
    await flush();
    assert.match(document.body.textContent, /種類を選んでください/);
    cleanupOverlays();
  });

  test('テンプレを選んで作成するとエディタへ遷移する', async () => {
    await nav('#/client/' + client.id);
    clickByText(appEl(), 'button', '＋ 新規カルテ');
    // .tpl-name（子要素）をクリック → button.tpl-card までバブリングしてonclickが発火する
    clickByText(document.body, '.tpl-name', '体組成・身体測定記録');
    clickByText(document.body, '.modal-foot button', '作成');
    await flush();
    assert.match(location.hash, /\/chart\//);
    const charts = await listCharts(client.id);
    assert.equal(charts[0].templateId, 'body-composition');
  });

  test('顧客データを編集すると保存され画面に反映される', async () => {
    await nav('#/client/' + client.id);
    clickByText(appEl(), 'button', '顧客データを編集');
    const modal = document.querySelector('.modal');
    fireInput(modal.querySelector('#cf_goal'), '体脂肪率-5%');
    clickByText(document.body, '.modal-foot button', '保存');
    await flush();

    assert.match(appEl().querySelector('.client-card').textContent, /体脂肪率-5%/);
    assert.equal((await getClient(client.id)).goal, '体脂肪率-5%');
  });

  test('クライアント削除で一覧に戻り、データが消える', async () => {
    await nav('#/client/' + client.id);
    clickByText(appEl(), 'button', '削除');
    clickByText(document.body, '.modal-foot button', 'OK');
    await flush();

    assert.equal(location.hash, '#/');
    assert.equal(await getClient(client.id), undefined);
  });

  test('存在しないクライアントIDは一覧にリダイレクトされる', async () => {
    await nav('#/client/does-not-exist');
    assert.equal(location.hash, '#/');
  });
});
