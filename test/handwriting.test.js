import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, firePointer, stubRect } from './setup/dom-env.js';

installDom();
const { HandwritingPad } = await import('../js/handwriting.js');

function makePad(opts) {
  const container = document.createElement('div');
  document.body.append(container);
  const pad = new HandwritingPad(container, opts);
  // jsdomにはレイアウトが無いため、固定サイズを返すようにして正規化座標を安定させる
  stubRect(pad.wrap, { width: 300, height: 300 });
  stubRect(pad.canvas, { width: 300, height: 300 });
  pad.load([], null);
  return pad;
}

function draw(pad, points) {
  firePointer(pad.canvas, 'pointerdown', points[0]);
  for (const p of points.slice(1)) firePointer(pad.canvas, 'pointermove', p);
  firePointer(pad.canvas, 'pointerup', points[points.length - 1]);
}

describe('handwriting.js: HandwritingPad', () => {
  test('コンストラクタで pad-bg / pad-canvas を container に構築する', () => {
    const container = document.createElement('div');
    const pad = new HandwritingPad(container);
    assert.ok(container.querySelector('.pad-bg'));
    assert.ok(container.querySelector('.pad-canvas'));
    pad.destroy();
  });

  test('ペンで描くとストロークが1本記録され、onChangeが呼ばれる', () => {
    const changes = [];
    const pad = makePad({ color: '#111111', width: 4, onChange: (s) => changes.push(s) });

    draw(pad, [
      { x: 10, y: 10, pointerId: 1 },
      { x: 60, y: 20, pointerId: 1 },
      { x: 90, y: 40, pointerId: 1 },
    ]);

    assert.equal(pad.strokes.length, 1);
    const s = pad.strokes[0];
    assert.equal(s.tool, 'pen');
    assert.equal(s.color, '#111111');
    assert.ok(s.points.length >= 2);
    assert.ok(changes.length >= 1);
    assert.equal(changes[changes.length - 1].length, 1);
  });

  test('setTool("eraser") で描くと tool=eraser のストロークになる', () => {
    const pad = makePad({});
    pad.setTool('eraser');
    draw(pad, [{ x: 5, y: 5, pointerId: 2 }, { x: 50, y: 50, pointerId: 2 }]);
    assert.equal(pad.strokes.length, 1);
    assert.equal(pad.strokes[0].tool, 'eraser');
  });

  test('setColor はツールをpenに戻す', () => {
    const pad = makePad({});
    pad.setTool('eraser');
    pad.setColor('#ff0000');
    assert.equal(pad.tool, 'pen');
    assert.equal(pad.color, '#ff0000');
  });

  test('undo/redo でストロークの出し入れができる', () => {
    const pad = makePad({});
    draw(pad, [{ x: 1, y: 1, pointerId: 1 }, { x: 20, y: 20, pointerId: 1 }]);
    draw(pad, [{ x: 2, y: 2, pointerId: 1 }, { x: 30, y: 30, pointerId: 1 }]);
    assert.equal(pad.strokes.length, 2);

    pad.undo();
    assert.equal(pad.strokes.length, 1);
    pad.undo();
    assert.equal(pad.strokes.length, 0);
    pad.undo(); // 空のundoは何も起きない
    assert.equal(pad.strokes.length, 0);

    pad.redo();
    pad.redo();
    assert.equal(pad.strokes.length, 2);
  });

  test('新しく描くと redoスタックは破棄される', () => {
    const pad = makePad({});
    draw(pad, [{ x: 1, y: 1, pointerId: 1 }, { x: 20, y: 20, pointerId: 1 }]);
    pad.undo();
    assert.equal(pad.strokes.length, 0);
    draw(pad, [{ x: 5, y: 5, pointerId: 1 }, { x: 25, y: 25, pointerId: 1 }]);
    assert.equal(pad.strokes.length, 1);
    pad.redo();
    assert.equal(pad.strokes.length, 1); // redo対象がないので変化しない
  });

  test('clear() で全消去され、getStrokes()は空配列を返す', () => {
    const changes = [];
    const pad = makePad({ onChange: (s) => changes.push(s) });
    draw(pad, [{ x: 1, y: 1, pointerId: 1 }, { x: 20, y: 20, pointerId: 1 }]);
    pad.clear();
    assert.deepEqual(pad.getStrokes(), []);
    assert.deepEqual(changes[changes.length - 1], []);
  });

  test('load() は既存ストロークを取り込み、setBackground()でBODY_CHARTSのSVGを差し込む', () => {
    const pad = makePad({});
    const existing = [{ tool: 'pen', color: '#000', width: 0.01, points: [[0.1, 0.1, 0.5], [0.2, 0.2, 0.5]] }];
    pad.load(existing, 'body-front');
    assert.equal(pad.getStrokes().length, 1);
    assert.ok(pad.bgLayer.innerHTML.includes('<svg'));

    pad.setBackground(null);
    assert.equal(pad.bgLayer.innerHTML, '');
  });

  test('getStrokes() はストローク配列のコピーを返す（内部状態を汚染しない）', () => {
    const pad = makePad({});
    draw(pad, [{ x: 1, y: 1, pointerId: 1 }, { x: 20, y: 20, pointerId: 1 }]);
    const copy = pad.getStrokes();
    copy[0].color = 'tampered';
    assert.notEqual(pad.strokes[0].color, 'tampered');
  });

  test('destroy() は例外を投げない', () => {
    const pad = makePad({});
    assert.doesNotThrow(() => pad.destroy());
  });
});
