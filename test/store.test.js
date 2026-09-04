// fake-indexeddb で本物同等の IndexedDB を用意し、adapter.js 経由で
// store.js を実際に動かす結合テスト（local-adapter.js の実コードも通る）。
import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  newClient,
  listClients,
  getClient,
  saveClient,
  deleteClient,
  listCharts,
  listKartes,
  getChart,
  createChart,
  saveChart,
  deleteChart,
  findChartByRole,
  todayISO,
} from '../js/store.js';
import { db } from '../js/data/adapter.js';

beforeEach(async () => {
  // テストごとに全ストアをクリアして独立させる
  await db.clear('clients');
  await db.clear('charts');
  await db.clear('settings');
});

describe('store.js（clients）', () => {
  test('newClient はデフォルト値と createdAt/updatedAt を持つ', () => {
    const c = newClient({ name: '山田太郎' });
    assert.equal(c.name, '山田太郎');
    assert.equal(c.goal, '');
    assert.ok(c.id.length > 0);
    assert.equal(typeof c.createdAt, 'number');
  });

  test('saveClient → listClients で保存・一覧取得できる', async () => {
    const c = newClient({ name: '佐藤花子' });
    await saveClient(c);
    const all = await listClients();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '佐藤花子');
  });

  test('listClients は updatedAt 降順', async () => {
    const c1 = newClient({ name: 'A' });
    await saveClient(c1);
    await new Promise((r) => setTimeout(r, 5));
    const c2 = newClient({ name: 'B' });
    await saveClient(c2);
    const all = await listClients();
    assert.equal(all[0].name, 'B');
    assert.equal(all[1].name, 'A');
  });

  test('getClient: 存在しないIDはundefined', async () => {
    assert.equal(await getClient('nope'), undefined);
  });

  test('deleteClient は紐づくカルテも削除する（カスケード）', async () => {
    const c = newClient({ name: '削除太郎' });
    await saveClient(c);
    await createChart(c.id, 'karte');
    await createChart(c.id, 'karte', '2026-01-01');
    assert.equal((await listCharts(c.id)).length, 2);

    await deleteClient(c.id);
    assert.equal(await getClient(c.id), undefined);
    assert.equal((await listCharts(c.id)).length, 0);
  });
});

describe('store.js（charts: counseling / precautions）', () => {
  let client;
  beforeEach(async () => {
    client = newClient({ name: 'テスト太郎' });
    await saveClient(client);
  });

  test('createChart はテンプレの role / title を引き継ぎ、日付は持たない', async () => {
    const ch = await createChart(client.id, 'counseling');
    assert.equal(ch.clientId, client.id);
    assert.equal(ch.role, 'counseling');
    assert.equal(ch.title, '初回カウンセリングシート');
    assert.equal(ch.date, null);
    assert.ok(ch.pages.length > 1);
  });

  test('createChart は未知のtemplateIdでエラー', async () => {
    await assert.rejects(() => createChart(client.id, 'no-such-template'));
  });

  test('findChartByRole は role で1件見つける・無ければnull', async () => {
    assert.equal(await findChartByRole(client.id, 'counseling'), null);
    const ch = await createChart(client.id, 'counseling');
    const found = await findChartByRole(client.id, 'counseling');
    assert.equal(found.id, ch.id);
  });
});

describe('store.js（charts: karte、記入日で管理）', () => {
  let client;
  beforeEach(async () => {
    client = newClient({ name: 'テスト太郎' });
    await saveClient(client);
  });

  test('todayISO は YYYY-MM-DD 形式', () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('createChart(karte) は role/title なし、日付は今日がデフォルト', async () => {
    const ch = await createChart(client.id, 'karte');
    assert.equal(ch.role, null);
    assert.equal(ch.title, null);
    assert.equal(ch.date, todayISO());
  });

  test('createChart(karte, date) で任意の記入日を指定できる', async () => {
    const ch = await createChart(client.id, 'karte', '2026-01-15');
    assert.equal(ch.date, '2026-01-15');
  });

  test('createChart はクライアントの updatedAt を更新する', async () => {
    const before = (await getClient(client.id)).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await createChart(client.id, 'karte');
    const after = (await getClient(client.id)).updatedAt;
    assert.ok(after > before);
  });

  test('saveChart で値・ページのスキップ状態が永続化される', async () => {
    const ch = await createChart(client.id, 'karte');
    ch.pages[1].values.condition = '良い';
    ch.pages[2].skipped = true;
    await saveChart(ch);

    const reloaded = await getChart(ch.id);
    assert.equal(reloaded.pages[1].values.condition, '良い');
    assert.equal(reloaded.pages[2].skipped, true);
  });

  test('listCharts は指定クライアントのカルテのみ返す', async () => {
    const other = newClient({ name: '別人' });
    await saveClient(other);
    await createChart(client.id, 'karte');
    await createChart(other.id, 'karte');

    const mine = await listCharts(client.id);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].clientId, client.id);
  });

  test('listKartes は role付きチャートを除外し、記入日の新しい順で返す', async () => {
    await createChart(client.id, 'counseling');
    await createChart(client.id, 'precautions');
    await createChart(client.id, 'karte', '2026-01-01');
    await createChart(client.id, 'karte', '2026-03-01');
    await createChart(client.id, 'karte', '2026-02-01');

    const kartes = await listKartes(client.id);
    assert.equal(kartes.length, 3);
    assert.deepEqual(kartes.map((k) => k.date), ['2026-03-01', '2026-02-01', '2026-01-01']);
  });

  test('deleteChart 後は一覧から消え、クライアントは残る', async () => {
    const ch = await createChart(client.id, 'karte');
    await deleteChart(ch);
    assert.equal((await listCharts(client.id)).length, 0);
    assert.ok(await getClient(client.id));
  });
});
