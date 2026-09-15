import test from 'node:test';
import assert from 'node:assert/strict';
import { ModalInput } from '../src/ui/modalInput.ts';
import { mockGlobal } from './browser-globals.mjs';

function setup(t) {
  const win = new EventTarget();
  const doc = { activeElement: null };
  class Element {
    constructor(parent = null) { this.parent = parent; this.attributes = new Map(); this.tabIndex = 0; this.isConnected = true; }
    setAttribute(k, v) { this.attributes.set(k, v); }
    getAttribute(k) { return this.attributes.get(k) ?? null; }
    removeAttribute(k) { this.attributes.delete(k); }
    querySelectorAll() { return this.controls ?? []; }
    focus() { doc.activeElement = this; }
    contains(node) { return node === this || node?.parent === this; }
    closest() { return this.inert ? this : null; }
    matches() { return false; }
    getClientRects() { return [1]; }
  }
  mockGlobal(t, 'window', win);
  mockGlobal(t, 'document', doc);
  mockGlobal(t, 'Node', Element);
  const keys = (target, code, options = {}) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    Object.assign(event, { code, ...options });
    win.dispatchEvent(event);
    return event;
  };
  return { doc, Element, keys };
}

test('topmost modal owns input and closing it restores focus to the previous modal', (t) => {
  const { doc, Element } = setup(t), input = new ModalInput();
  const pause = new Element(), confirm = new Element();
  const slider = new Element(pause), cancel = new Element(confirm);
  pause.controls = [slider]; confirm.controls = [cancel];
  input.open(pause);
  assert.equal(doc.activeElement, slider);
  input.open(confirm);
  assert.equal(pause.inert, true);
  assert.equal(input.allows(pause), false);
  assert.equal(input.allows(), false);
  assert.equal(doc.activeElement, cancel);
  input.close(confirm);
  assert.equal(pause.inert, false);
  assert.equal(doc.activeElement, slider);
  input.close(pause);
  assert.equal(input.allows(), true);
});

test('menu controls keep native arrows, Tab stays within the modal, Escape closes only the top', (t) => {
  const { doc, Element, keys } = setup(t), input = new ModalInput();
  const root = new Element(), first = new Element(root), last = new Element(root);
  root.controls = [first, last];
  input.open(root, () => input.close(root));
  assert.equal(keys(first, 'ArrowRight').defaultPrevented, false);
  last.focus();
  assert.equal(keys(last, 'Tab').defaultPrevented, true);
  assert.equal(doc.activeElement, first);
  keys(first, 'Tab', { shiftKey: true });
  assert.equal(doc.activeElement, last);
  assert.equal(keys(last, 'Escape').defaultPrevented, true);
  assert.equal(input.active, false);
});
