// Fills the fields that ./fields.js found: plain inputs, native <select>s,
// radio and checkbox groups, ARIA comboboxes (type-to-search or click-to-open
// lists), date inputs and résumé uploads. A site config can add fillers for
// controls of its own (Ashby's Yes/No buttons, Lever's location search).
//
// AF.forms.install(config) makes this the page's filler: it defines
// AF.discover, AF.hasFields and AF.fillPage, which content.js uses.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text, visible, norm, loose, filled } = AF;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = (n) => String(n).padStart(2, '0');
  const yesNo = (value) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value);

  AF.forms.isDate = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'year' in v && !(v instanceof RegExp);

  /** A { month, day, year } answer written the way this field asks for it, or null. */
  function dateText(f, value) {
    if (f.type === 'date') {
      const month = f.control.type === 'month';
      return month ? `${value.year}-${pad(value.month || 1)}` : `${value.year}-${pad(value.month || 1)}-${pad(value.day || 1)}`;
    }
    const label = norm(f.label);
    if (/\bmonth\b/.test(label)) {
      if (value.month == null) return null;
      return f.type === 'text' ? String(value.month) : [MONTHS[value.month - 1], String(value.month), pad(value.month)];
    }
    if (/\byear\b/.test(label)) return String(value.year);
    return value.month ? `${pad(value.month)}/${value.year}` : String(value.year);
  }

  /** Strings worth typing into a search box for an answer: each literal candidate, then its parts. */
  AF.forms.queries = function queries(want) {
    const out = [];
    for (const c of AF.candidates(want)) {
      if (typeof c !== 'string') {
        if (c instanceof RegExp && c.query) out.push(c.query);
        continue;
      }
      out.push(c);
      for (const part of c.split(/\s*[,(–—]\s*|\s+-\s+/)) if (part.trim().length >= 3) out.push(part.trim());
    }
    return [...new Set(out)].slice(0, 6);
  };

  // ── Native <select> ────────────────────────────────────────────────

  async function fillNative(f, value) {
    const select = f.control;
    const options = [...select.options];
    const pick = AF.bestOption(options.map(text), yesNo(value));
    if (pick < 0) return { status: 'nomatch', options: options.map(text).filter(Boolean).slice(0, 40) };
    if (select.selectedIndex === pick) return 'already';
    const had = select.selectedIndex > 0 && Boolean(select.value);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, options[pick].value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(30);
    return select.selectedIndex === pick ? filled(had) : 'failed';
  }

  // ── ARIA comboboxes ────────────────────────────────────────────────
  // Two shapes: a text input you type into (role="combobox" or
  // aria-autocomplete), and a button-like element that opens a list.

  const isInput = (el) => el instanceof HTMLInputElement;

  function listbox(f) {
    const c = f.control;
    const rootNode = c.getRootNode();
    for (const attr of ['aria-controls', 'aria-owns']) {
      const id = c.getAttribute(attr);
      const el = id && rootNode.getElementById && rootNode.getElementById(id);
      if (el) return el;
    }
    const inside = f.el.querySelector('[role="listbox"]');
    if (inside && visible(inside)) return inside;
    // Many libraries render the list at the end of <body>; take the one that's showing.
    return [...rootNode.querySelectorAll('[role="listbox"]')].filter(visible).pop() || null;
  }

  const shownOptions = (f) => [...(listbox(f)?.querySelectorAll('[role="option"]') || [])].filter(visible);
  const current = (f) => (isInput(f.control) ? f.control.value.trim() : text(f.control));
  const expanded = (f) => f.control.getAttribute('aria-expanded') === 'true' || Boolean(listbox(f) && visible(listbox(f)));

  /**
   * Wait for search results. Searches are debounced and often remote, and the
   * list may say "No results" for the old text in the meantime, so give
   * options a while to appear, and longer while the list says it's loading.
   */
  async function settle(f, ms) {
    await sleep(ms);
    if (await waitFor(() => shownOptions(f).length, { timeout: 1500 })) return shownOptions(f);
    if (/loading|searching/i.test(text(listbox(f)))) await waitFor(() => shownOptions(f).length, { timeout: 4000 });
    return shownOptions(f);
  }

  async function openList(f) {
    if (expanded(f) && shownOptions(f).length) return true;
    const c = f.control;
    c.focus();
    AF.key(c, 'ArrowDown');
    if (await waitFor(() => shownOptions(f).length, { timeout: 600 })) return true;
    AF.press(c);
    c.click();
    return Boolean(await waitFor(() => shownOptions(f).length, { timeout: 900 }));
  }

  async function closeList(f) {
    if (!expanded(f)) return;
    AF.key(f.control, 'Escape');
    await sleep(60);
  }

  async function typeQuery(f, query) {
    const c = f.control;
    c.focus();
    AF.setValue(c, query);
    c.dispatchEvent(new Event('input', { bubbles: true }));
    // Some lists search on key events rather than `input`.
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', bubbles: true }));
    c.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', bubbles: true }));
    return settle(f, 350);
  }

  async function choose(f, option) {
    const before = current(f);
    AF.press(option);
    option.click();
    const changed = await waitFor(() => !f.el.isConnected || current(f) !== before || !expanded(f), { timeout: 1200 });
    return Boolean(changed);
  }

  /** Does the box already show this answer? */
  const shows = (f, want) => Boolean(current(f)) && AF.bestOption([current(f)], want) >= 0;

  async function fillCombobox(f, value) {
    const want = yesNo(value);
    if (shows(f, want)) return 'already';
    const had = current(f);
    let options = [];
    let pick = -1;
    let listed = [];
    // A fixed list shows everything once opened.
    if (await openList(f)) {
      options = shownOptions(f);
      listed = options.map(text);
      pick = AF.bestOption(listed, want);
    }
    // Otherwise type to search; long or remote lists only show a first page.
    if (pick < 0 && isInput(f.control)) {
      for (const query of AF.forms.queries(want)) {
        options = await typeQuery(f, query);
        pick = AF.bestOption(options.map(text), want);
        if (pick >= 0) break;
      }
    }
    if (pick < 0) {
      if (isInput(f.control)) {
        AF.setValue(f.control, had);
        f.control.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await closeList(f);
      return { status: 'nomatch', options: listed.slice(0, 40) };
    }
    const ok = await choose(f, options[pick]);
    await closeList(f);
    if (isInput(f.control)) AF.blur(f.control);
    await sleep(60);
    return ok ? filled(had) : { status: 'failed', diag: { control: AF.skeleton(f.el) } };
  }

  // ── Résumé upload ──────────────────────────────────────────────────

  const FILE_NAME = /[\w-][\w .-]*\.(pdf|docx?|rtf|txt|odt|pages)\b/i;
  const fileInput = (f) => (f.control && f.control.matches('input[type="file"]') ? f.control : f.el.querySelector('input[type="file"]'));

  /** The name of a file the block shows as attached, if any. */
  function attachedName(f) {
    const input = fileInput(f);
    if (input && input.files && input.files.length) return input.files[0].name;
    const copy = f.el.cloneNode(true);
    for (const l of copy.querySelectorAll('label, legend, [class*="label" i], [class*="description" i], [class*="instructions" i]')) l.remove();
    const m = FILE_NAME.exec(text(copy));
    return m ? m[0].trim() : '';
  }
  AF.forms.attachedName = attachedName;

  async function fillFile(f, resume) {
    const showsResume = () => !f.el.isConnected || loose(text(f.el)).includes(loose(resume.name)) || attachedName(f) === resume.name;
    if (showsResume()) return 'already';
    // Never remove a file the user attached; just say so if it isn't the saved one.
    const other = attachedName(f);
    if (other) return { status: 'differs', attached: other };
    const input = fileInput(f);
    if (!input) return 'failed';
    AF.attachFile(input, resume);
    const ok = await waitFor(() => showsResume() || attachedName(f), { timeout: 6000 });
    return ok ? 'filled' : 'failed';
  }
  AF.forms.fillFile = fillFile;

  // ── One field ──────────────────────────────────────────────────────

  async function fillField(config, f, value) {
    if (AF.forms.isDate(value)) {
      value = dateText(f, value);
      if (value == null) return 'empty';
    }
    if (config.fillers && config.fillers[f.type]) return config.fillers[f.type](f, value);
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'date':
        return AF.fillInput(f.control, value);
      case 'native':
        return fillNative(f, value);
      case 'combobox':
        return fillCombobox(f, value);
      case 'radio':
        return AF.fillChoice(f.el, yesNo(value), 'radio');
      case 'checkboxes':
        return AF.fillChoice(f.el, yesNo(value), 'checkbox');
      case 'checkbox':
        return AF.fillCheckbox(f.control, value);
      case 'file':
        return fillFile(f, value);
      default:
        return 'failed';
    }
  }

  function hasValue(config, f) {
    if (config.hasValue && config.hasValue[f.type]) return config.hasValue[f.type](f);
    switch (f.type) {
      case 'text':
      case 'textarea':
      case 'date':
        return Boolean(f.control?.value.trim());
      case 'combobox':
        return Boolean(current(f));
      case 'native':
        return f.control.selectedIndex > 0 && Boolean(f.control.value);
      case 'radio':
      case 'checkboxes':
      case 'checkbox':
        return [...f.el.querySelectorAll('input[type="radio"], input[type="checkbox"]')].some((i) => i.checked);
      case 'file':
        return Boolean(attachedName(f));
      default:
        return false;
    }
  }

  /** Make `config` the filler for this page. */
  AF.forms.install = function install(config) {
    const discover = () => AF.forms.discover(config);
    const site = {
      discover,
      fillField: (f, value) => fillField(config, f, value),
      hasValue: (f) => hasValue(config, f),
      prepare: config.prepare,
    };
    AF.discover = discover;
    AF.hasFields = config.hasFields || (() => discover().length > 0);
    AF.fillPage = (profile, resume) => AF.runFill(site, profile, resume);
  };

})(globalThis);
