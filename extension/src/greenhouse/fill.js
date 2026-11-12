// Fills a Greenhouse application: one filler per kind of Greenhouse control.
// The pass over the page and the generic inputs live in ../engine.js.
//
// Greenhouse's dropdowns are react-select comboboxes whose open state the page
// keeps itself: they open on key-up or mouse-up (not mouse-down) and close on
// Escape or blur. Some (school, location) search a server as you type.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text, visible, norm, loose, filled } = AF;
  const { COMBO, TEXT_INPUT } = AF.gh;

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /**
   * Rules give dates as { month, day, year }; Greenhouse asks for each part in
   * its own box ("Start date month", "Start date year"). Returns the part this
   * field wants, or null when the profile doesn't have it.
   */
  function datePart(f, value) {
    const label = norm(f.label);
    const n = /\bmonth\b/.test(label) ? value.month : /\bday\b/.test(label) ? value.day : value.year;
    if (n == null) return null;
    return /\bmonth\b/.test(label) && f.type !== 'text' ? [MONTHS[n - 1], String(n)] : String(n);
  }

  const isDate = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'year' in v && !(v instanceof RegExp);

  // ── react-select dropdowns ─────────────────────────────────────────

  const combo = (f) => f.el.querySelector(COMBO);

  function menu(f) {
    const input = combo(f);
    const id = input && input.getAttribute('aria-controls');
    return (id && document.getElementById(id)) || f.el.querySelector('.select__menu, [role="listbox"]');
  }

  const isOpen = (f) => Boolean(menu(f)) || combo(f)?.getAttribute('aria-expanded') === 'true';
  const shownOptions = (f) => [...(menu(f)?.querySelectorAll('[role="option"]') || [])].filter(visible);
  const optionText = (o) => text(o);

  /** What the dropdown shows as chosen: one value, or the pills of a multi-select. */
  function chosen(f) {
    const pills = [...f.el.querySelectorAll('.select__multi-value__label')].map(text);
    if (pills.length) return pills;
    const single = text(f.el.querySelector('.select__single-value'));
    return single ? [single] : [];
  }

  /** Done loading: the menu shows options or says there are none. */
  function settled(f) {
    const m = menu(f);
    if (!m) return false;
    if (m.querySelector('[class*="loading"]') || /^loading/i.test(text(m))) return false;
    return true;
  }

  async function open(f) {
    const input = combo(f);
    if (!input) return false;
    if (isOpen(f)) return true;
    const attempts = [
      () => {
        input.focus();
        AF.key(input, 'ArrowDown');
      },
      () => {
        const control = f.el.querySelector('.select__control') || input;
        AF.press(control);
        control.click();
      },
      () => {
        const toggle = f.el.querySelector('button[aria-label*="flyout" i], .select__indicators button');
        if (toggle) toggle.click();
      },
    ];
    for (const attempt of attempts) {
      attempt();
      if (await waitFor(() => isOpen(f), { timeout: 700 })) return true;
    }
    return false;
  }

  async function close(f) {
    const input = combo(f);
    if (!input || !isOpen(f)) return;
    AF.key(input, 'Escape');
    await sleep(60);
    if (isOpen(f)) {
      AF.blur(input);
      await sleep(60);
    }
  }

  /** Type a search and wait for the (possibly remote) results. */
  async function search(f, query) {
    const input = combo(f);
    if (!input) return [];
    input.focus();
    AF.setValue(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // The page opens the menu on key-up of an ordinary key.
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', code: 'ShiftLeft', bubbles: true }));
    await sleep(350); // searches are debounced
    await waitFor(() => settled(f), { timeout: 4000 });
    // "No options" can be shown for a moment before a remote search starts.
    if (!shownOptions(f).length) {
      await sleep(500);
      await waitFor(() => settled(f), { timeout: 3000 });
    }
    return shownOptions(f);
  }

  async function clearSearch(f) {
    const input = combo(f);
    if (!input || !input.value) return;
    AF.setValue(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(60);
  }

  /** Strings worth typing for an answer: each literal candidate, then its parts. */
  function queries(want) {
    const out = [];
    for (const c of AF.candidates(want)) {
      if (typeof c !== 'string') continue;
      out.push(c);
      // "University of California, Berkeley" is listed as "University of California - Berkeley".
      for (const part of c.split(/\s*[,(–—]\s*|\s+-\s+/)) if (part.trim().length >= 3) out.push(part.trim());
    }
    return [...new Set(out)].slice(0, 6);
  }

  /** Click an option until the dropdown shows a new value. */
  async function choose(f, option) {
    const before = chosen(f).join('\n');
    const done = () => !f.el.isConnected || chosen(f).join('\n') !== before;
    const attempts = [
      (el) => el.click(),
      (el) => {
        AF.press(el);
        el.click();
      },
    ];
    for (const attempt of attempts) {
      if (!option.isConnected) break;
      attempt(option);
      if (await waitFor(done, { timeout: 900 })) return true;
    }
    return Boolean(await waitFor(done, { timeout: 300 }));
  }

  const isPicked = (o) => /--is-selected/.test(o.className) || o.getAttribute('aria-selected') === 'true';

  /** Pick one answer in the dropdown. */
  async function selectOne(f, want) {
    if (!(await open(f))) return { status: 'failed', diag: { control: AF.skeleton(f.el) } };
    await waitFor(() => settled(f), { timeout: 3000 });
    const listed = shownOptions(f).map(optionText);

    // First look through the list as it opens: fixed lists are complete.
    let options = shownOptions(f);
    let pick = AF.bestOption(options.map(optionText), want);
    // Otherwise search: long or remote lists only show a first page.
    if (pick < 0) {
      for (const query of queries(want)) {
        options = await search(f, query);
        pick = AF.bestOption(options.map(optionText), want);
        if (pick >= 0) break;
      }
    }
    if (pick < 0) {
      await clearSearch(f);
      await close(f);
      return { status: 'nomatch', options: listed.slice(0, 40) };
    }
    if (isPicked(options[pick])) {
      await close(f);
      return 'already';
    }
    const ok = await choose(f, options[pick]);
    await close(f);
    return ok ? 'filled' : { status: 'failed', diag: { control: AF.skeleton(f.el) } };
  }

  async function fillSelect(f, value) {
    const multi = Boolean(value && value.multi);
    const wants = multi ? value.multi : [typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value];
    const had = chosen(f).length > 0;
    const matches = (want) => {
      const have = chosen(f).map(norm);
      return AF.candidates(want).some((c) => have.some((h) => (c instanceof RegExp ? c.test(h) : norm(c) === h)));
    };

    const missing = [];
    let added = 0;
    let last = null;
    for (const want of wants) {
      if (!f.el.isConnected) break;
      if (matches(want)) continue;
      last = await selectOne(f, want);
      if (last === 'filled') added++;
      else if (last !== 'already') missing.push(AF.firstString(want));
    }

    if (!multi) {
      if (!last || last === 'already') return 'already';
      return last === 'filled' ? filled(had) : last;
    }
    if (missing.length) return { status: missing.length < wants.length ? 'partial' : 'nomatch', missing };
    return added ? 'filled' : 'already';
  }

  // ── Native <select> (older custom questions) ───────────────────────

  async function fillNative(f, value) {
    const select = f.el.querySelector('select');
    const options = [...select.options];
    const want = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
    const pick = AF.bestOption(options.map(text), want);
    if (pick < 0) return { status: 'nomatch', options: options.map(text).filter(Boolean).slice(0, 40) };
    if (select.selectedIndex === pick) return 'already';
    const had = select.selectedIndex > 0 && Boolean(select.value);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, options[pick].value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(30);
    return select.selectedIndex === pick ? filled(had) : 'failed';
  }

  // ── Résumé upload ──────────────────────────────────────────────────

  const attachedName = (f) => text(f.el.querySelector('[class*="filename"], [class*="file-name"], [class*="file__name"]'));

  /** Greenhouse swaps the Attach buttons for the file's name and a remove button once a file is in. */
  const hasFile = (f) =>
    !f.el.querySelector('input[type="file"]') ||
    Boolean(attachedName(f)) ||
    Boolean(f.el.querySelector('button[aria-label*="remove" i], button[aria-label*="delete" i]'));

  async function fillFile(f, resume) {
    const shows = () => !f.el.isConnected || loose(text(f.el)).includes(loose(resume.name));
    if (shows()) return 'already';
    // Never remove a file the user attached; just say so if it isn't the saved one.
    if (hasFile(f)) return { status: 'differs', attached: attachedName(f) || 'another file' };
    const input = f.el.querySelector('input[type="file"]');
    if (!input) return 'failed';
    AF.attachFile(input, resume);
    const ok = await waitFor(() => shows() || hasFile(f), { timeout: 6000 });
    return ok ? 'filled' : 'failed';
  }

  // ── One field ──────────────────────────────────────────────────────

  async function fillField(f, value) {
    if (isDate(value)) {
      value = datePart(f, value);
      if (value == null) return 'empty';
    }
    switch (f.type) {
      case 'text':
        return AF.fillInput(f.el.querySelector(TEXT_INPUT), value);
      case 'textarea':
        return AF.fillInput(f.el.querySelector('textarea'), value);
      case 'select':
        return fillSelect(f, value);
      case 'native':
        return fillNative(f, value);
      case 'radio':
        return AF.fillChoice(f.el, value, 'radio');
      case 'checkboxes':
        return AF.fillChoice(f.el, value, 'checkbox');
      case 'checkbox':
        return AF.fillCheckbox(f.el.querySelector('input[type="checkbox"]'), value);
      case 'file':
        return fillFile(f, value);
      default:
        return 'failed';
    }
  }

  function hasValue(f) {
    switch (f.type) {
      case 'text':
        return Boolean(f.el.querySelector(TEXT_INPUT)?.value.trim());
      case 'textarea':
        return Boolean(f.el.querySelector('textarea')?.value.trim());
      case 'select':
        return chosen(f).length > 0;
      case 'native': {
        const select = f.el.querySelector('select');
        return select.selectedIndex > 0 && Boolean(select.value);
      }
      case 'radio':
      case 'checkboxes':
      case 'checkbox':
        return [...f.el.querySelectorAll('input[type="radio"], input[type="checkbox"]')].some((i) => i.checked);
      case 'file':
        return hasFile(f);
      default:
        return false;
    }
  }

  // ── Repeating entries ──────────────────────────────────────────────

  async function ensureEntries(kind, wanted) {
    for (let guard = 0; guard < 12; guard++) {
      const info = AF.gh.entryInfo(kind);
      if (!info || info.count >= wanted || !info.addButton) return;
      info.addButton.click();
      const grew = await waitFor(() => (AF.gh.entryInfo(kind)?.count || 0) > info.count, { timeout: 2500 });
      if (!grew) return;
    }
  }

  const site = {
    discover: () => AF.discover(),
    fillField,
    hasValue,
    async prepare(profile) {
      await ensureEntries('education', profile.education.length);
      await ensureEntries('employment', profile.work.length);
    },
  };

  AF.fillPage = (profile, resume) => AF.runFill(site, profile, resume);
})(globalThis);
