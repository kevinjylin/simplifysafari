// Fills the Workday page: one filler per kind of Workday control. The pass over
// the page and the generic inputs live in ../engine.js.
//
// Workday's résumé parser pre-fills a lot and gets a lot wrong, which is why
// existing values are checked rather than kept.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text, visible, sel, norm, loose, firstString, filled } = AF;

  // ── Option lists (shared by dropdowns and search prompts) ──────────

  const OPTION = '[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]';
  // How long to wait for options a control is still loading.
  const LOAD_TIMEOUT = 8000;

  /** Visible option elements, innermost only when they nest. */
  function shownOptions() {
    const all = [...document.querySelectorAll(OPTION)].filter(visible);
    return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
  }

  /**
   * Runs `attempts` one at a time until new options appear on the page.
   * Options are recognised by having appeared since the call started, so it
   * doesn't matter where in the document Workday renders the list.
   *
   * `settled` lets the caller stop early when the control resolved itself
   * without showing a list (a search with exactly one match). `loading` says
   * the control is still fetching, so its results are worth waiting for.
   */
  async function revealOptions(trigger, attempts, { settled = () => false, loading = () => false } = {}) {
    const prior = new Set(shownOptions());
    const fresh = () => {
      const now = shownOptions().filter((o) => !prior.has(o));
      return now.length ? now : null;
    };
    const pending = () => trigger.getAttribute('aria-expanded') === 'true' || loading();
    for (const attempt of attempts) {
      if (!trigger.isConnected || settled()) return null;
      attempt(trigger);
      let options = await waitFor(() => fresh() || settled(), { timeout: 800 });
      if (options === true) return null;
      // The control opened but its options are still loading: searches go to
      // Workday's server and can take several seconds on a slow tenant.
      if (!options && pending()) {
        options = await waitFor(() => fresh() || settled() || (pending() ? null : 'done'), { timeout: LOAD_TIMEOUT });
        if (options === true) return null;
        // "No Items." can show for a moment before the results replace it.
        if (options === 'done') options = await waitFor(fresh, { timeout: 500 });
      }
      if (options) {
        await sleep(100); // let the list finish rendering
        return fresh() || options;
      }
    }
    return null;
  }

  /** Select an option, escalating from a plain click, until `isDone` holds. */
  async function choose(option, isDone) {
    const attempts = [
      (el) => el.click(),
      (el) => {
        AF.press(el);
        el.click();
      },
      (el) => AF.key(el, 'Enter'),
    ];
    for (const attempt of attempts) {
      if (!option.isConnected) break; // the list closed, so something was chosen
      attempt(option);
      if (await waitFor(isDone, { timeout: 900 })) return true;
    }
    return Boolean(await waitFor(isDone, { timeout: 300 }));
  }

  async function dismiss(trigger, options) {
    const open = () => options.some((o) => o.isConnected && visible(o));
    const steps = [
      () => AF.key(options.find((o) => o.isConnected) || trigger, 'Escape'),
      () => AF.key(trigger, 'Escape'),
      () => trigger.isConnected && trigger.click(),
      () => {
        AF.press(document.body);
        document.body.click();
      },
    ];
    for (const step of steps) {
      if (!open()) return;
      step();
      await sleep(60);
    }
  }

  /** Records what Workday added to the page while we tried, for the field report. */
  function watchPopups() {
    const before = new Set(document.body.children);
    return () => [...document.body.children].filter((c) => !before.has(c)).slice(0, 3).map((c) => AF.skeleton(c));
  }

  // ── Plain dropdown: a button that opens a listbox ──────────────────

  const dropdownButton = (f) => f.el.querySelector('button[aria-haspopup="listbox"]');

  function dropdownValue(f) {
    const shown = text(dropdownButton(f));
    return /^select( one)?$/i.test(shown) ? '' : shown;
  }

  async function fillDropdown(f, value) {
    const had = dropdownValue(f);
    // Exactly the wanted answer: no need to open the list.
    if (had && AF.candidates(value).some((c) => typeof c === 'string' && norm(c) === norm(had))) return 'already';

    const popups = watchPopups();
    const options = await revealOptions(dropdownButton(f), [
      (el) => el.click(),
      (el) => AF.press(el),
      (el) => {
        el.focus();
        AF.key(el, 'Enter');
      },
      (el) => AF.key(el, 'ArrowDown'),
    ]);
    if (!options) return { status: 'failed', diag: { control: AF.skeleton(f.el), appeared: popups() } };

    const labels = options.map(text);
    const pick = AF.bestOption(labels, value);
    if (pick < 0) {
      await dismiss(dropdownButton(f), options);
      return { status: 'nomatch', options: labels.filter((l) => !/^select( one)?$/i.test(l)).slice(0, 40) };
    }
    // The best option on offer is the one already chosen.
    if (had && norm(labels[pick]) === norm(had)) {
      await dismiss(dropdownButton(f), options);
      return 'already';
    }

    const before = text(dropdownButton(f));
    // Choosing a value can re-render the whole section, so a vanished field counts as done.
    const ok = await choose(options[pick], () => {
      const button = f.el.isConnected && dropdownButton(f);
      return !button || text(button) !== before;
    });
    if (!ok) {
      const diag = { control: AF.skeleton(f.el), appeared: popups() };
      await dismiss(dropdownButton(f) || document.body, options);
      return { status: 'failed', diag };
    }
    return filled(had);
  }

  // ── Search-as-you-type prompt (school, field of study, skills, source…) ──

  function selectedItems(f) {
    const inList = [...f.el.querySelectorAll('[data-automation-id="selectedItemList"] li')];
    return inList.length ? inList : [...f.el.querySelectorAll('[data-automation-id="selectedItem"]')];
  }

  /** A selected pill's own label, without its "remove" control. */
  function itemText(item) {
    const label = item.querySelector('[data-automation-id="promptOption"]');
    return text(label || item);
  }

  const selectedTexts = (f) => selectedItems(f).map(itemText);

  function itemMatches(item, want) {
    const have = norm(itemText(item));
    return AF.candidates(want).some((c) => (c instanceof RegExp ? c.test(have) : norm(c) === have));
  }

  const isSelected = (f, want) => selectedItems(f).some((item) => itemMatches(item, want));

  const openPopups = () => [...document.querySelectorAll('[data-automation-widget="wd-popup"]')].filter(visible);
  const NO_RESULTS = /\bno (items|results|matches)\b/i;

  /** A search with no results still leaves its "No Items" popup up; close it. */
  async function closeEmptyPrompt(input, popupsBefore) {
    const stray = () => openPopups().some((p) => !popupsBefore.has(p));
    if (!stray()) return;
    AF.key(input, 'Escape');
    await sleep(60);
    if (!stray()) return;
    AF.press(document.body);
    document.body.click();
  }

  const promptInput = (f) => f.el.querySelector('[data-automation-id="multiSelectContainer"] input, input');

  async function searchAndPick(f, want) {
    // Literal strings are typed as they are; a regex candidate is typed by its
    // `query` ("BS" for the abbreviation) and still helps choose among results.
    const queries = AF.candidates(want).map((c) => (typeof c === 'string' ? c : c.query)).filter(Boolean);
    for (const query of [...new Set(queries)]) {
      const input = promptInput(f);
      if (!input) return false;
      const before = selectedTexts(f).join('\n');
      const changed = () => selectedTexts(f).join('\n') !== before;
      const popupsBefore = new Set(openPopups());
      let picked = false;

      // A popup that opened for this search and shows neither results nor
      // "No Items." is still waiting on the server.
      const searching = () => openPopups().some((p) => !popupsBefore.has(p) && !NO_RESULTS.test(text(p)));

      // Typing and pressing Enter either selects a unique match outright or
      // shows a list of results; failing that, try opening the prompt by click.
      const options = await revealOptions(
        input,
        [
          (el) => {
            AF.typeInto(el, query);
            AF.key(el, 'Enter');
          },
          (el) => el.click(),
        ],
        { settled: changed, loading: searching }
      );
      if (options && !changed()) {
        const pick = AF.bestOption(options.map(text), want);
        const chosen = pick >= 0 ? options[pick] : options.length === 1 ? options[0] : null;
        if (chosen) picked = await choose(chosen, changed);
      }
      if (options) await dismiss(input, options);
      else await closeEmptyPrompt(input, popupsBefore);
      if (picked || changed() || isSelected(f, want)) return true;
      if (input.isConnected) AF.typeInto(input, '');
    }
    return false;
  }

  /** A single-choice prompt that kept its old value alongside the new one: drop the old. */
  function removeStale(f, want) {
    const items = selectedItems(f);
    if (items.length < 2) return;
    const keep = items.findLast((item) => itemMatches(item, want)) || items[items.length - 1];
    for (const item of items) {
      if (item === keep) continue;
      const remove = item.querySelector('[data-automation-id="DELETE_charm"], [data-automation-id*="delete" i]');
      if (remove) remove.click();
    }
  }

  async function fillSearchable(f, value) {
    const multi = Boolean(value && value.multi);
    const wants = multi ? value.multi : [value];
    const had = selectedItems(f).length > 0;
    const popups = watchPopups();
    const missing = [];
    let added = 0;
    for (const want of wants) {
      if (!f.el.isConnected) break;
      if (isSelected(f, want)) continue;
      if (await searchAndPick(f, want)) added++;
      else missing.push(firstString(want));
    }
    if (!multi && added && f.el.isConnected) removeStale(f, wants[0]);

    if (missing.length) {
      const status = missing.length < wants.length ? 'partial' : 'nomatch';
      return { status, missing, diag: { control: AF.skeleton(f.el), appeared: popups() } };
    }
    return added ? filled(had && !multi) : 'already';
  }

  // ── Dates: separate Month / Day / Year spin inputs ─────────────────

  async function fillDatePart(input, n) {
    const shows = () => parseInt(input.value, 10) === n;
    // Workday's date boxes ignore typed text events but do handle the arrow
    // keys, so put the previous number in and step up by one.
    input.focus();
    AF.setValue(input, String(n - 1));
    AF.key(input, 'ArrowUp');
    input.click();
    await sleep(40);
    if (shows()) return true;
    // Fallback for tenants whose date boxes behave like ordinary inputs.
    AF.typeInto(input, String(n));
    await sleep(40);
    return shows();
  }

  const dateInputs = (f) =>
    ['Month', 'Day', 'Year'].map((name) => ({ name, input: f.el.querySelector(sel.datePart(name)) })).filter((p) => p.input);

  async function fillDate(f, value) {
    if (!value || typeof value !== 'object') return 'failed';
    const parts = dateInputs(f).map((p) => ({ ...p, n: value[p.name.toLowerCase()] }));
    if (!parts.length) return 'failed';
    // The page asks for a part (usually the day) that the profile doesn't have.
    if (parts.some((p) => p.n == null && !p.input.value.trim())) return 'failed';
    const wrong = parts.filter((p) => p.n != null && parseInt(p.input.value, 10) !== p.n);
    if (!wrong.length) return 'already';

    const had = parts.some((p) => p.input.value.trim());
    let ok = true;
    for (const p of wrong) ok = (await fillDatePart(p.input, p.n)) && ok;
    AF.blur(wrong[wrong.length - 1].input);
    return ok ? filled(had) : 'failed';
  }

  // ── Résumé upload ──────────────────────────────────────────────────

  const UPLOADED = '[data-automation-id="file-upload-item"], [data-automation-id="file-upload-successful"]';

  async function fillFile(f, resume) {
    if (f.el.querySelector(UPLOADED)) {
      // Never delete a file the user attached; just say so if it isn't the saved one.
      const name = text(f.el.querySelector('[data-automation-id="file-upload-item-name"]'));
      return !name || loose(name) === loose(resume.name) ? 'already' : { status: 'differs', attached: name };
    }
    const input = f.el.querySelector('input[type="file"]');
    if (!input) return 'failed';
    AF.attachFile(input, resume);
    const shown = await waitFor(() => !f.el.isConnected || f.el.querySelector(UPLOADED), { timeout: 4000 });
    return shown ? 'filled' : 'failed';
  }

  // ── One field ──────────────────────────────────────────────────────

  function fillField(f, value) {
    switch (f.type) {
      case 'text':
        return AF.fillInput(f.el.querySelector(sel.TEXT_INPUT), value);
      case 'textarea':
        return AF.fillInput(f.el.querySelector('textarea'), value);
      case 'dropdown':
        return fillDropdown(f, value);
      case 'searchable':
        return fillSearchable(f, value);
      case 'radio':
        return AF.fillChoice(f.el, value, 'radio');
      case 'checkboxes':
        return AF.fillChoice(f.el, value, 'checkbox');
      case 'checkbox':
        return AF.fillCheckbox(f.el.querySelector('input[type="checkbox"]'), value);
      case 'date':
        return fillDate(f, value);
      case 'file':
        return fillFile(f, value);
      default:
        return 'failed';
    }
  }

  /** Does the field hold an answer right now? */
  function hasValue(f) {
    switch (f.type) {
      case 'text':
        return Boolean(f.el.querySelector(sel.TEXT_INPUT)?.value.trim());
      case 'textarea':
        return Boolean(f.el.querySelector('textarea')?.value.trim());
      case 'dropdown':
        return Boolean(dropdownValue(f));
      case 'searchable':
        return selectedItems(f).length > 0;
      case 'radio':
      case 'checkboxes':
        return [...f.el.querySelectorAll('input[type="radio"], input[type="checkbox"]')].some((i) => i.checked);
      case 'date':
        return dateInputs(f).some((p) => p.input.value.trim());
      case 'file':
        return Boolean(f.el.querySelector(UPLOADED));
      case 'checkbox':
        return f.el.querySelector('input[type="checkbox"]').checked;
      default:
        return false;
    }
  }

  // ── Repeating sections ─────────────────────────────────────────────

  function entries(nameRe) {
    const info = AF.sectionInfo(nameRe);
    // Count from the fields too, in case the entry headings aren't numbered:
    // adding entries a résumé parser already created would duplicate them.
    const indices = AF.discover().filter((f) => nameRe.test(f.section)).map((f) => f.index || 1);
    return { count: Math.max(info ? info.count : 0, 0, ...indices), addButton: info && info.addButton };
  }

  async function ensureEntries(nameRe, wanted) {
    for (let guard = 0; guard < 12; guard++) {
      const { count, addButton } = entries(nameRe);
      if (count >= wanted || !addButton) return;
      addButton.click();
      const grew = await waitFor(() => entries(nameRe).count > count, { timeout: 2500 });
      if (!grew) return;
    }
  }

  // ── The whole page ─────────────────────────────────────────────────

  const site = {
    discover: () => AF.discover(),
    fillField,
    hasValue,
    async prepare(profile, ctx) {
      await ensureEntries(/^work experience$/, profile.work.length);
      await ensureEntries(/^education$/, profile.education.length);
      await ensureEntries(/^websites?$/, AF.websiteList(profile, ctx).length);
    },
  };

  AF.fillPage = (profile, resume) => AF.runFill(site, profile, resume);
})(globalThis);
