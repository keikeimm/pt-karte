import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, getTemplate, instantiatePages, BODY_CHARTS } from '../js/templates.js';

describe('templates.js', () => {
  test('テンプレートは3種類のみ（counseling / precautions / karte）', () => {
    assert.deepEqual(
      TEMPLATES.map((t) => t.id).sort(),
      ['counseling', 'karte', 'precautions']
    );
  });

  test('role を持つのは counseling と precautions のみ。karte は role なし', () => {
    const roled = TEMPLATES.filter((t) => t.role).map((t) => t.id).sort();
    assert.deepEqual(roled, ['counseling', 'precautions']);
    assert.equal(getTemplate('karte').role, undefined);
  });

  test('getTemplate は id で引ける・存在しなければ null', () => {
    assert.equal(getTemplate('karte').name, 'カルテ');
    assert.equal(getTemplate('nope'), null);
  });

  test('instantiatePages: どのテンプレートも顧客データページを持たない（クライアント詳細・エディタ上部のサマリーに既出のため）', () => {
    for (const t of TEMPLATES) {
      const names = instantiatePages(t).map((p) => p.name);
      assert.ok(!names.includes('顧客データ'), `${t.id} に顧客データページが残っている`);
    }
  });

  test('karte のタブ構成: 本日の記録 / メニュー・測定記録 / 白紙（手書き・自由記述）', () => {
    const pages = instantiatePages(getTemplate('karte'));
    const names = pages.map((p) => p.name);
    assert.deepEqual(names, ['本日の記録', 'メニュー・測定記録', '白紙（手書き・自由記述）']);
    assert.equal(pages[0].skippable, false);
    assert.equal(pages.find((p) => p.name === '白紙（手書き・自由記述）').kind, 'canvas');
    assert.equal(pages.find((p) => p.name === 'メニュー・測定記録').fields[0].type, 'table');
  });

  test('precautions のタブ構成: 注意事項 / 免責・キャンセルポリシー（緊急連絡先は顧客の基本情報に移設済み）', () => {
    const names = instantiatePages(getTemplate('precautions')).map((p) => p.name);
    assert.deepEqual(names, ['運動参加の注意事項', '免責・キャンセルポリシー']);
  });

  test('counseling は4タブに集約されている（同意・署名は注意書きチャートと重複するため無い）', () => {
    const pages = instantiatePages(getTemplate('counseling'));
    const names = pages.map((p) => p.name);
    assert.deepEqual(names, ['目標・運動歴', '生活・食習慣', '医学スクリーニング（PAR-Q+）', '整形外科的既往・痛み']);
  });

  test('instantiatePages: 各ページは独立したid/values/strokesを持つ（テンプレ本体を汚染しない）', () => {
    const tpl = getTemplate('karte');
    const a = instantiatePages(tpl);
    const b = instantiatePages(tpl);
    assert.notEqual(a[0].id, b[0].id);
    a[0].values.condition = '良い';
    assert.equal(b[0].values.condition, undefined);
    assert.deepEqual(a[0].strokes, []);
  });

  test('全テンプレートのページは kind が form/note/canvas のいずれか', () => {
    for (const t of TEMPLATES) {
      for (const p of instantiatePages(t)) {
        assert.ok(['form', 'note', 'canvas'].includes(p.kind), `${t.id}/${p.name} kind=${p.kind}`);
      }
    }
  });

  test('table フィールドは columns を持つ', () => {
    for (const t of TEMPLATES) {
      for (const p of t.pages) {
        for (const f of p.fields || []) {
          if (f.type === 'table') {
            assert.ok(Array.isArray(f.columns) && f.columns.length > 0, `${t.id}/${p.name}/${f.key}`);
          }
        }
      }
    }
  });

  test('canvas ページに bg 指定があれば BODY_CHARTS に実体がある', () => {
    for (const t of TEMPLATES) {
      for (const p of t.pages) {
        if (p.kind === 'canvas' && p.bg) {
          assert.ok(BODY_CHARTS[p.bg], `unknown bg: ${p.bg}`);
        }
      }
    }
  });
});
