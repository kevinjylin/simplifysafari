// Finds the form fields on a Workday application page and describes each one:
// what kind of control it is, its label, and which section/entry it belongs to.
//
// Workday wraps every field in <div data-automation-id="formField-…">. The part
// after the prefix differs between tenants and releases, so fields are
// identified mainly by label text and section heading, not by that id.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { norm, text, visible } = AF;

  const FIELD = '[data-automation-id^="formField-"]';
  const TEXT_INPUT =
    'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"]';
  const DROP_ZONE = '[data-automation-id="file-upload-drop-zone"]';

  AF.sel = {
    FIELD,
    TEXT_INPUT,
    DROP_ZONE,
    datePart: (part) => `input[aria-label="${part}"], input[data-automation-id="dateSection${part}-input"]`,
  };

  function classify(w) {
    if (w.querySelector(`input[type="file"], ${DROP_ZONE}`)) return 'file';
    if (w.querySelector(['Month', 'Day', 'Year'].map(AF.sel.datePart).join(', '))) return 'date';
    if (w.querySelector('[data-automation-id="multiSelectContainer"]')) return 'searchable';
    if (w.querySelector('button[aria-haspopup="listbox"]')) return 'dropdown';
    if (w.querySelector('input[type="radio"]')) return 'radio';
    const boxes = w.querySelectorAll('input[type="checkbox"]').length;
    if (boxes === 1) return 'checkbox';
    if (boxes > 1) return 'checkboxes';
    if (w.querySelector('textarea')) return 'textarea';
    if (w.querySelector('input[type="password"]')) return null; // left to Safari's password manager
    if (w.querySelector(TEXT_INPUT)) return 'text';
    return null;
  }

  const clean = AF.cleanLabel;

  function labelOf(w, type) {
    const legend = w.querySelector('legend');
    if (legend && text(legend)) return clean(text(legend));

    if (type === 'checkbox') return AF.optionLabel(w, w.querySelector('input[type="checkbox"]'));

    if (type === 'radio' || type === 'checkboxes') {
      // Skip the labels that belong to individual options.
      const optionIds = new Set([...w.querySelectorAll('input[type="radio"], input[type="checkbox"]')].map((i) => i.id));
      const own = [...w.querySelectorAll('label')].find((l) => !optionIds.has(l.htmlFor) && !l.querySelector('input'));
      return clean(text(own) || text(w.querySelector('[data-automation-id="richText"]')));
    }

    const label = w.querySelector('label');
    if (label && text(label)) return clean(text(label));
    const control = w.querySelector('input, textarea, button');
    const labelledBy = control && control.getAttribute('aria-labelledby');
    const byId = labelledBy && document.getElementById(labelledBy.split(' ')[0]);
    return clean(text(byId) || (control && control.getAttribute('aria-label')) || '');
  }

  function isRequired(w) {
    if (w.querySelector('[aria-required="true"], [required]')) return true;
    return /\*/.test(text(w.querySelector('legend, label')));
  }

  function headings() {
    return [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')].filter(visible);
  }

  const precedes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  /**
   * Section and entry number, read off the nearest heading above the field:
   * "Work Experience 2" -> { section: 'work experience', index: 2 }.
   */
  function contextOf(el, heads) {
    let nearest = null;
    for (const h of heads) {
      if (precedes(h, el)) nearest = h;
      else break;
    }
    const name = norm(text(nearest));
    const numbered = /^(.*\D)\s*(\d+)$/.exec(name);
    return numbered ? { section: numbered[1].trim(), index: Number(numbered[2]) } : { section: name, index: null };
  }

  /** All visible fields on the page, in document order. */
  AF.discover = function discover() {
    const heads = headings();
    const wrappers = [...document.querySelectorAll(FIELD)].filter((w) => !w.querySelector(FIELD));
    // Some tenants render the résumé drop zone outside any formField wrapper.
    for (const zone of document.querySelectorAll(DROP_ZONE)) {
      if (!zone.closest(FIELD)) wrappers.push(zone.parentElement || zone);
    }

    const fields = [];
    for (const el of wrappers) {
      if (!visible(el)) continue;
      const type = classify(el);
      if (!type) continue;
      const id = (el.getAttribute('data-automation-id') || 'formField-').slice('formField-'.length);
      const f = { el, id, type, label: labelOf(el, type), required: isRequired(el), ...contextOf(el, heads) };
      if (type === 'radio' || type === 'checkboxes') {
        f.choices = [...el.querySelectorAll('input[type="radio"], input[type="checkbox"]')].map((i) => AF.optionLabel(el, i));
      }
      fields.push(f);
    }

    // Where entry headings aren't numbered, tell repeated entries apart by
    // order: the second "Job Title" in a section belongs to entry 2.
    const repeats = new Map();
    for (const f of fields) {
      if (f.index != null) continue;
      const key = `${f.section}|${f.type}|${norm(f.label) || f.id}`;
      const nth = (repeats.get(key) || 0) + 1;
      repeats.set(key, nth);
      if (nth > 1) f.index = nth;
    }
    return fields;
  };

  AF.hasFields = () => Boolean(document.querySelector(`${FIELD}, ${DROP_ZONE}`));

  /**
   * Repeating sections ("Work Experience", "Education", "Websites") start with
   * zero or one entry and an Add button. Returns how many entries exist and
   * the button that adds another.
   */
  AF.sectionInfo = function sectionInfo(nameRe) {
    const heads = headings();
    const names = heads.map((h) => norm(text(h)));
    const at = names.findIndex((n) => nameRe.test(n));
    if (at < 0) return null;
    const head = heads[at];
    const next = heads.slice(at + 1).find((h) => h.tagName === head.tagName);
    const count = names.filter((n) => {
      const m = /^(.*\D)\s*\d+$/.exec(n);
      return m && nameRe.test(m[1].trim());
    }).length;
    const addButton = [...document.querySelectorAll('button')]
      .filter((b) => visible(b) && precedes(head, b) && (!next || precedes(b, next)))
      .filter((b) => /^add( another)?$/i.test(text(b)) || /^add/i.test(b.getAttribute('data-automation-id') || ''))
      .pop();
    return { count, addButton };
  };
})(globalThis);
