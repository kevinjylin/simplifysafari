// Finds the form fields on a Greenhouse application (job-boards.greenhouse.io,
// including the /embed/job_app frame that company career sites show) and
// describes each one: what kind of control it is, its label, and which
// section/entry it belongs to.
//
// Greenhouse builds every question from a few blocks: `.text-input-wrapper`
// (input or textarea), `.select` (a react-select combobox), `.file-upload`,
// and `fieldset` for checkbox/radio groups. Education and employment entries
// carry their number in the control id: `school--0`, `start-year--1`.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { norm, text, visible } = AF;
  const clean = AF.cleanLabel;

  const FORM = '#application-form, form.application--form';
  const UNIT = '.select, .text-input-wrapper, .file-upload, fieldset, .field-wrapper';
  // Scoped to react-select: the phone box's flag picker has a combobox of its own.
  const COMBO = 'input.select__input, .select__control input[role="combobox"]';
  const TEXT_INPUT =
    'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"]';

  AF.gh = { FORM, COMBO, TEXT_INPUT };

  function classify(w) {
    if (w.matches('.file-upload') || w.querySelector('input[type="file"]')) return 'file';
    if (w.querySelector(COMBO)) return 'select';
    if (w.querySelector('select')) return 'native';
    if (w.querySelector('input[type="radio"]')) return 'radio';
    const boxes = w.querySelectorAll('input[type="checkbox"]').length;
    if (boxes === 1) return 'checkbox';
    if (boxes > 1) return 'checkboxes';
    if (w.querySelector('textarea')) return 'textarea';
    if (w.querySelector('input[type="password"]')) return null;
    if (w.querySelector(TEXT_INPUT)) return 'text';
    return null;
  }

  /** The control that carries the field's id and label. */
  function controlOf(w, type) {
    if (type === 'file') return w.querySelector('input[type="file"]');
    if (type === 'select') return w.querySelector(COMBO);
    if (type === 'native') return w.querySelector('select');
    if (type === 'textarea') return w.querySelector('textarea');
    if (type === 'text') return w.querySelector(TEXT_INPUT);
    return w.querySelector('input');
  }

  function labelOf(w, type, control) {
    if (type === 'file') {
      const id = w.getAttribute('aria-labelledby');
      return clean(text((id && document.getElementById(id)) || w.querySelector('.upload-label, label')));
    }
    const legend = w.querySelector('legend');
    if ((type === 'radio' || type === 'checkboxes' || !control) && legend) return clean(text(legend));
    if (type === 'checkbox') return clean(text(legend) || AF.optionLabel(w, control));
    const byFor = control.id && w.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    const labelledBy = control.getAttribute('aria-labelledby');
    const byId = labelledBy && document.getElementById(labelledBy.split(' ')[0]);
    return clean(text(byFor || byId || w.querySelector('label')) || control.getAttribute('aria-label') || '');
  }

  function isRequired(w, control) {
    if (w.matches('[aria-required="true"]') || (control && control.getAttribute('aria-required') === 'true')) return true;
    if (w.querySelector('[aria-required="true"], .required')) return true;
    return /\*/.test(text(w.querySelector('legend, label, .upload-label')));
  }

  const precedes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  /** Section name and entry number: "education" + 2 for `degree--1`. */
  function contextOf(w, control, heads) {
    const m = control && /--(\d+)$/.exec(control.id || '');
    const index = m ? Number(m[1]) + 1 : null;
    if (w.closest('[class*="education--"]')) return { section: 'education', index };
    if (w.closest('[class*="employment--"]')) return { section: 'employment', index };
    let nearest = null;
    for (const h of heads) {
      if (precedes(h, w)) nearest = h;
      else break;
    }
    return { section: norm(text(nearest)) || 'application', index };
  }

  /** Smallest blocks that hold one question each. */
  function units(form) {
    const all = [...form.querySelectorAll(UNIT)];
    const set = new Set(all);
    return all.filter((el) => {
      // The phone fieldset holds the dial-code select and the number: two fields.
      for (const other of el.querySelectorAll(UNIT)) if (set.has(other) && classify(other)) return false;
      return true;
    });
  }

  AF.discover = function discover() {
    const form = document.querySelector(FORM);
    if (!form) return [];
    const heads = [...form.querySelectorAll('h1, h2, h3, h4, [role="heading"]')].filter(visible);
    const fields = [];
    for (const el of units(form)) {
      if (!visible(el)) continue;
      const type = classify(el);
      if (!type) continue;
      const control = controlOf(el, type);
      // react-select inputs and file inputs are visually hidden; judge by the block instead.
      fields.push({
        el,
        id: (control && control.id) || '',
        type,
        label: labelOf(el, type, control),
        required: isRequired(el, control),
        ...contextOf(el, control, heads),
      });
    }
    return fields;
  };

  AF.hasFields = () => Boolean(document.querySelector(FORM));

  /**
   * Education and employment start with one entry and an "Add another"
   * button. Returns how many entries exist and that button.
   */
  AF.gh.entryInfo = function entryInfo(kind) {
    const box = document.querySelector(`[class*="${kind}--container"]`);
    if (!box) return null;
    const indices = new Set(
      [...box.querySelectorAll('[id*="--"]')].map((el) => /--(\d+)$/.exec(el.id)).filter(Boolean).map((m) => m[1])
    );
    const addButton = [...box.querySelectorAll('button')]
      .filter(visible)
      .find((b) => b.matches('.add-another-button') || /^add( another)?\b/i.test(text(b)));
    return { count: indices.size, addButton };
  };
})(globalThis);
