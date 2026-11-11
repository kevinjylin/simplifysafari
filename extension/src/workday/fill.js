// Fills the Workday page: one filler per kind of control, plus the pass that
// walks the page and collects a report. Never clicks Next, Save or Submit.
//
// A field that already holds a value is compared with the profile: left alone
// if it matches, replaced if it doesn't. (Workday's résumé parser pre-fills a
// lot, and gets a lot wrong.)
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text, visible, sel, norm, loose } = AF;

  const firstString = (value) => String(AF.candidates(value).find((c) => typeof c === 'string') ?? '');
  /** Result for a successful fill; `had` says a previous value was overwritten. */
  const filled = (had) => (had ? { status: 'filled', replaced: true } : 'filled');

  // ── Text ───────────────────────────────────────────────────────────

  async function fillText(f, value, selector) {
    const input = f.el.querySelector(selector);
    if (!input) return 'failed';
    const wanted = firstString(value);
    const had = input.value.trim();
    if (loose(had) === loose(wanted)) return 'already';
    AF.typeInto(input, wanted);
    AF.blur(input);
    await sleep(30);
    // If the page's own state rejected the change, React will have reverted it.
    // Compared loosely because Workday reformats some values (phone numbers) on blur.
    return loose(input.value) === loose(wanted) ? filled(had) : 'failed';
  }

  // ── Option lists (shared by dropdowns and search prompts) ──────────

  const OPTION = '[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]';

  /** Visible option elements, innermost only when they nest. */
  function shownOptions() {
    const all = [...document.querySelectorAll(OPTION)].filter(visible);
    return all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
  }

  /**
   * Runs `attempts` one at a time until new options appear on the page.
   * Options are recognised by having appeared since the call started, so it
   * doesn't matter where in the document Workday renders the list.
   */
  async function revealOptions(trigger, attempts) {
    const prior = new Set(shownOptions());
    const fresh = () => {
      const now = shownOptions().filter((o) => !prior.has(o));
      return now.length ? now : null;
    };
    for (const attempt of attempts) {
      if (!trigger.isConnected) return null;
      attempt(trigger);
      let options = await waitFor(fresh, { timeout: 800 });
      // The control says it opened; its options may still be loading.
      if (!options && trigger.getAttribute('aria-expanded') === 'true') options = await waitFor(fresh, { timeout: 2500 });
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

  function isSelected(f, want) {
    const have = selectedTexts(f).map(norm);
    return AF.candidates(want).some((c) => have.some((h) => (c instanceof RegExp ? c.test(h) : norm(c) === h)));
  }

  const promptInput = (f) => f.el.querySelector('[data-automation-id="multiSelectContainer"] input, input');

  async function searchAndPick(f, want) {
    // Only literal strings can be typed; regex candidates still help choose among results.
    for (const query of AF.candidates(want).filter((c) => typeof c === 'string')) {
      const input = promptInput(f);
      if (!input) return false;
      const before = selectedTexts(f).join('\n');
      const changed = () => selectedTexts(f).join('\n') !== before;
      let picked = false;

      // Typing and pressing Enter either selects a unique match outright or
      // shows a list of results; failing that, try opening the prompt by click.
      const options = await revealOptions(input, [
        (el) => {
          AF.typeInto(el, query);
          AF.key(el, 'Enter');
        },
        (el) => !changed() && el.click(),
      ]);
      if (options && !changed()) {
        const pick = AF.bestOption(options.map(text), want);
        const chosen = pick >= 0 ? options[pick] : options.length === 1 ? options[0] : null;
        if (chosen) picked = await choose(chosen, changed);
      }
      if (options) await dismiss(input, options);
      if (picked || changed() || isSelected(f, want)) return true;
      if (input.isConnected) AF.typeInto(input, '');
    }
    return false;
  }

  /** A single-choice prompt that kept its old value alongside the new one: drop the old. */
  function removeStale(f, want) {
    const items = selectedItems(f);
    if (items.length < 2) return;
    const keep = items.findLast((item) => isSelected({ el: item.parentElement, ...f }, want)) || items[items.length - 1];
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

  // ── Radio groups and checkboxes ────────────────────────────────────

  async function fillChoice(f, value, kind) {
    const inputs = [...f.el.querySelectorAll(`input[type="${kind}"]`)];
    const labels = inputs.map((i) => AF.optionLabel(f.el, i));
    const want = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
    const pick = AF.bestOption(labels, want);
    if (pick < 0) return { status: 'nomatch', options: labels };
    if (inputs[pick].checked) return 'already';
    const had = inputs.some((i) => i.checked);
    inputs[pick].click();
    await sleep(30);
    return inputs[pick].checked || !inputs[pick].isConnected ? filled(had) : 'failed';
  }

  async function fillCheckbox(f, value) {
    const input = f.el.querySelector('input[type="checkbox"]');
    const want = typeof value === 'boolean' ? value : /^(yes|true|checked)$/i.test(String(value).trim());
    if (input.checked === want) return 'already';
    input.click();
    await sleep(30);
    return input.checked === want || !input.isConnected ? filled(!want) : 'failed';
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

  function toFile(resume) {
    const base64 = resume.dataUrl.slice(resume.dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], resume.name, { type: resume.type || 'application/pdf' });
  }

  const UPLOADED = '[data-automation-id="file-upload-item"], [data-automation-id="file-upload-successful"]';

  async function fillFile(f, resume) {
    if (f.el.querySelector(UPLOADED)) {
      // Never delete a file the user attached; just say so if it isn't the saved one.
      const name = text(f.el.querySelector('[data-automation-id="file-upload-item-name"]'));
      return !name || loose(name) === loose(resume.name) ? 'already' : { status: 'differs', attached: name };
    }
    const input = f.el.querySelector('input[type="file"]');
    if (!input) return 'failed';
    const transfer = new DataTransfer();
    transfer.items.add(toFile(resume));
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const shown = await waitFor(() => !f.el.isConnected || f.el.querySelector(UPLOADED), { timeout: 4000 });
    return shown ? 'filled' : 'failed';
  }

  // ── One field ──────────────────────────────────────────────────────

  function fillField(f, value) {
    switch (f.type) {
      case 'text':
        return fillText(f, value, sel.TEXT_INPUT);
      case 'textarea':
        return fillText(f, value, 'textarea');
      case 'dropdown':
        return fillDropdown(f, value);
      case 'searchable':
        return fillSearchable(f, value);
      case 'radio':
        return fillChoice(f, value, 'radio');
      case 'checkboxes':
        return fillChoice(f, value, 'checkbox');
      case 'checkbox':
        return fillCheckbox(f, value);
      case 'date':
        return fillDate(f, value);
      case 'file':
        return fillFile(f, value);
      default:
        return 'failed';
    }
  }

  /** Does the field hold an answer right now? (A lone checkbox always "has" one.) */
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

  const RANK = { filled: 6, partial: 5, failed: 4, nomatch: 4, differs: 4, extra: 3, empty: 3, unknown: 3, already: 2, kept: 2, ignored: 1 };
  const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  /**
   * Fill everything recognisable on the current page.
   * Returns one report row per field:
   *   { label, id, type, section, index, required, status, replaced?, options?, missing?, diag?, el }
   */
  AF.fillPage = async function fillPage(profile, resume) {
    const ctx = {
      resume,
      // LinkedIn goes in its own field when the page has one, otherwise into Websites.
      includeLinkedin: !AF.discover().some((f) => /linkedin/i.test(f.label)),
    };

    await ensureEntries(/^work experience$/, profile.work.length);
    await ensureEntries(/^education$/, profile.education.length);
    await ensureEntries(/^websites?$/, AF.websiteList(profile, ctx).length);

    const rows = new Map();
    const seen = new WeakSet();
    const extras = new Set();
    // Filling one field can reveal others (choosing a country shows the state
    // list), so keep sweeping until a pass finds nothing new.
    for (let pass = 0; pass < 6; pass++) {
      const fresh = AF.discover().filter((f) => !seen.has(f.el));
      if (!fresh.length) break;
      for (const f of fresh) {
        seen.add(f.el);
        if (!f.el.isConnected) continue;
        const row = { ...f, status: 'unknown' };
        const answer = AF.resolve(f, profile, ctx);
        if (!answer || answer.empty) {
          // Nothing to compare against, so an existing answer stands.
          row.status = hasValue(f) ? 'kept' : answer ? 'empty' : 'unknown';
        } else if (answer.ignore) {
          row.status = 'ignored';
        } else if (answer.extra) {
          // One line per surplus entry, not one per field in it.
          const entry = `${f.section} ${f.index}`;
          row.status = extras.has(entry) ? 'ignored' : 'extra';
          if (!extras.has(entry)) row.label = titleCase(entry);
          extras.add(entry);
        } else {
          try {
            const result = await fillField(f, answer.value);
            if (typeof result === 'string') row.status = result;
            else Object.assign(row, result);
          } catch (err) {
            row.status = 'failed';
            row.error = String(err && err.message ? err.message : err);
          }
        }
        // A re-rendered field shows up again as a new element; keep its best outcome.
        const key = `${f.section}#${f.index}#${f.id}#${row.label}`;
        const prior = rows.get(key);
        if (!prior || RANK[row.status] > RANK[prior.status]) rows.set(key, row);
        else prior.el = row.el;
      }
      await sleep(350);
    }
    return [...rows.values()];
  };

  const ATTENTION = ['unknown', 'empty', 'nomatch', 'failed', 'partial', 'extra', 'differs'];

  AF.summarize = function summarize(rows) {
    const done = rows.filter((r) => r.status === 'filled' || r.status === 'partial');
    return {
      filled: done.filter((r) => !r.replaced).length,
      corrected: done.filter((r) => r.replaced).length,
      already: rows.filter((r) => r.status === 'already' || r.status === 'kept').length,
      attention: rows.filter((r) => ATTENTION.includes(r.status)),
    };
  };
})(globalThis);
