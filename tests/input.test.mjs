import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/core/input.ts';
import { mockGlobal } from './browser-globals.mjs';

function setup(t) {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  let locks = 0;
  doc.body = { classList: { toggle() {} } };
  canvas.setPointerCapture = () => {};
  canvas.hasPointerCapture = () => false;
  canvas.requestPointerLock = () => { locks++; };
  mockGlobal(t, 'window', win);
  mockGlobal(t, 'document', doc);
  const input = new Input(canvas);
  return { win, doc, canvas, input, locks: () => locks };
}
function pointer(type, values = {}) {
  return Object.assign(new Event(type), { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 0, clientY: 0, ...values });
}

test('blur clears held keys, pending presses, mouse/wheel and touch input', (t) => {
  const { win, input } = setup(t);
  input.setKey('KeyW', true);
  input.setKey('Space', true);
  input.inject(80, -40, 100);
  input.touchAxis.x = 1;
  win.dispatchEvent(new Event('blur'));
  assert.equal(input.isDown('KeyW'), false);
  assert.equal(input.justPressed('Space'), false);
  assert.deepEqual(input.moveAxis(), { x: 0, y: 0 });
  assert.deepEqual(input.consumeMouseDelta(), { x: 0, y: 0 });
  assert.equal(input.consumeWheel(), 0);
});

test('cancelled drag cannot rotate the camera or request a lock on a late release', (t) => {
  const { canvas, input, locks } = setup(t);
  canvas.dispatchEvent(pointer('pointerdown'));
  assert.equal(input.isDown('Mouse0'), true);
  canvas.dispatchEvent(pointer('pointercancel'));
  canvas.dispatchEvent(pointer('pointermove', { clientX: 80, clientY: 40 }));
  canvas.dispatchEvent(pointer('pointerup'));
  assert.equal(input.isDown('Mouse0'), false);
  assert.deepEqual(input.consumeMouseDelta(), { x: 0, y: 0 });
  assert.equal(locks(), 0);
});

test('ordinary click still requests pointer lock, drag does not', (t) => {
  const { canvas, locks } = setup(t);
  canvas.dispatchEvent(pointer('pointerdown'));
  canvas.dispatchEvent(pointer('pointerup'));
  assert.equal(locks(), 1);
  canvas.dispatchEvent(pointer('pointerdown'));
  canvas.dispatchEvent(pointer('pointermove', { clientX: 20 }));
  canvas.dispatchEvent(pointer('pointerup'));
  assert.equal(locks(), 1);
});
