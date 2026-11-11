// Small DOM helpers for driving a React-controlled page from a content script.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});

  AF.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Poll until fn() returns something truthy; resolves null on timeout. */
  AF.waitFor = async function waitFor(fn, { timeout = 2000, interval = 50 } = {}) {
    const start = Date.now();
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() - start >= timeout) return null;
      await AF.sleep(interval);
    }
  };

  AF.text = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');

  AF.visible = function visible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  };

  /**
   * Write through the prototype's value setter. React shadows `value` on each
   * input to track changes; going through the prototype means the following
   * `input` event is seen as a real change instead of being swallowed.
   */
  AF.setValue = function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  };

  AF.typeInto = function typeInto(el, value) {
    el.focus();
    AF.setValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** Workday validates and commits most fields on blur. */
  AF.blur = function blur(el) {
    el.blur();
    // A real blur only fires if the tab has focus, so always send one explicitly too.
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  };

  /** The mouse-down half of a click, for controls that react to that instead of `click`. */
  AF.press = function press(el) {
    const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new PointerEvent('pointerup', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
  };

  /** Case-, spacing- and punctuation-insensitive comparison key ("(555) 010-2345" == "5550102345"). */
  AF.loose = (s) => String(s == null ? '' : s).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

  const SHAPE_ATTRS = [
    'role', 'type', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-owns', 'aria-multiselectable',
    'aria-selected', 'aria-checked', 'data-automation-id', 'data-automation-widget', 'data-uxi-widget-type',
    'data-uxi-element-id', 'data-associated-widget',
  ];

  /**
   * The structure of an element without any of its text: tags plus the
   * attributes that say what kind of control it is. Used in the field report
   * to show how a control that couldn't be filled is built.
   */
  AF.skeleton = function skeleton(el, depth = 5, budget = { left: 60 }) {
    if (!el || budget.left-- <= 0) return '';
    const attrs = SHAPE_ATTRS.filter((a) => el.hasAttribute(a))
      .map((a) => ` ${a}="${el.getAttribute(a).slice(0, 48)}"`)
      .join('');
    let out = `<${el.tagName.toLowerCase()}${attrs}>`;
    if (depth > 0) for (const child of el.children) out += AF.skeleton(child, depth - 1, budget);
    else if (el.children.length) out += '…';
    return out;
  };

  const KEY_CODES = { Enter: 13, Escape: 27, Tab: 9, ArrowUp: 38, ArrowDown: 40 };

  AF.key = function key(el, name) {
    const init = {
      key: name,
      code: name,
      keyCode: KEY_CODES[name],
      which: KEY_CODES[name],
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
  };
})(globalThis);
