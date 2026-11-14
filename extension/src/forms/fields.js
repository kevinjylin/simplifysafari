// Finds and describes the fields of an application form built from ordinary
// HTML controls (inputs, selects, textareas, radio and checkbox groups, ARIA
// comboboxes). Shared by the sites that don't need a discovery of their own:
// Ashby and Lever describe their question blocks in a small config
// (../ashby/site.js, ../lever/site.js); any other site goes through the
// generic config (../generic/site.js), which works out the blocks from the
// labels alone.
//
// A config may give:
//   form       selector for the form's root element(s); default: the page's
//              application-like <form>s, or the body
//   unit       selector for one question block; default: one block per control
//              (radio/checkbox groups count as one)
//   shadow     also look inside open shadow roots (web-component forms)
//   label(unit, control)    → the question text
//   section(unit)           → the section name
//   required(unit, control) → boolean, on top of the usual attributes
//   classify(unit)          → a site-specific type, or null for the usual ones
//   hint(unit, control)     → a stand-in label for matching (see rules.js)
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { norm, text, visible } = AF;

  const TEXT_INPUT =
    'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"]';
  const COMBO = 'input[role="combobox"], input[aria-autocomplete="list"], input[aria-autocomplete="both"]';
  const COMBO_BUTTON = '[role="combobox"]:not(input), button[aria-haspopup="listbox"]';
  const CONTROL = `input, select, textarea, ${COMBO_BUTTON}`;
  const SKIP_TYPES = /^(hidden|submit|button|reset|image|password|search)$/;
  // Bot checks, honeypots, page search boxes and the like are never questions.
  const SKIP_NAME = /captcha|honeypot|^search$|newsletter|csrf|authenticity_token/i;

  AF.forms = AF.forms || {};
  Object.assign(AF.forms, { TEXT_INPUT, COMBO, COMBO_BUTTON });

  /** Label text without the text of controls inside it (a wrapping <label> holds a select's options). */
  function labelText(el) {
    if (!el) return '';
    const copy = el.cloneNode(true);
    for (const junk of copy.querySelectorAll('select, option, textarea, input, [role="listbox"], svg, style, script')) junk.remove();
    return clean(text(copy));
  }
  const clean = (s) => String(s || '').replace(/[*✱]/g, '').replace(/\s+/g, ' ').trim();
  AF.forms.labelText = labelText;
  AF.forms.clean = clean;

  function fillable(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.matches('input') && SKIP_TYPES.test(el.type)) return false;
    if (SKIP_NAME.test(el.name || '') || SKIP_NAME.test(el.id || '')) return false;
    if (el.closest('[role="search"], nav, [aria-hidden="true"]')) return false;
    return true;
  }

  /** Radio, checkbox and file inputs are usually hidden behind a styled label; judge by what's around them. */
  function shown(el) {
    if (visible(el)) return true;
    if (!el.matches('input[type="radio"], input[type="checkbox"], input[type="file"]')) {
      // react-select and similar keep the real input tiny; its control box is what shows.
      return el.matches(COMBO) && visible(el.parentElement);
    }
    const root = el.getRootNode();
    const label = (el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
    return visible(label) || visible(el.parentElement);
  }

  /** Open shadow roots inside `scope`, however deep (not our own card's). */
  function shadowsIn(scope) {
    const out = [];
    const walk = (r) => {
      for (const el of r.querySelectorAll('*')) {
        if (el.shadowRoot && !el.hasAttribute('data-applyfill')) {
          out.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    };
    walk(scope);
    return out;
  }

  /** The element in the page itself that holds `el`: its outermost shadow host, or itself. */
  function anchorOf(el) {
    let a = el;
    while (a.getRootNode() instanceof ShadowRoot) a = a.getRootNode().host;
    return a;
  }

  function controlsIn(scope) {
    return [...scope.querySelectorAll(CONTROL)].filter(fillable);
  }

  /** The form element(s) to read. */
  function formRoots(config) {
    const roots = config.shadow ? [document, ...shadowsIn(document)] : [document];
    if (config.form) return roots.flatMap((r) => [...r.querySelectorAll(config.form)]);
    const forms = roots.flatMap((r) => [...r.querySelectorAll('form')]).filter((f) => controlsIn(f).filter(shown).length >= 2);
    if (forms.length) return forms;
    // Single-page apps often skip the <form>; use each root's top element instead.
    return roots.map((r) => (r === document ? document.body : r)).filter(Boolean);
  }

  // ── Types ──────────────────────────────────────────────────────────

  function classifyControls(controls) {
    const has = (sel) => controls.some((c) => c.matches(sel));
    if (has('input[type="file"]')) return 'file';
    if (has(COMBO) || has(COMBO_BUTTON)) return 'combobox';
    if (has('select')) return 'native';
    if (has('input[type="radio"]')) return 'radio';
    const boxes = controls.filter((c) => c.matches('input[type="checkbox"]')).length;
    if (boxes === 1) return 'checkbox';
    if (boxes > 1) return 'checkboxes';
    if (has('textarea')) return 'textarea';
    if (has('input[type="date"], input[type="month"]')) return 'date';
    if (has(TEXT_INPUT)) return 'text';
    return null;
  }

  const MAIN = {
    file: 'input[type="file"]',
    combobox: `${COMBO}, ${COMBO_BUTTON}`,
    native: 'select',
    radio: 'input[type="radio"]',
    checkbox: 'input[type="checkbox"]',
    checkboxes: 'input[type="checkbox"]',
    textarea: 'textarea',
    date: 'input[type="date"], input[type="month"]',
    text: TEXT_INPUT,
  };

  /** The control that carries the field's id and label. */
  function mainControl(controls, type) {
    return controls.find((c) => c.matches(MAIN[type] || CONTROL)) || controls[0] || null;
  }

  // ── Labels ─────────────────────────────────────────────────────────

  function byIds(rootNode, ids) {
    return ids
      .split(/\s+/)
      .map((id) => id && rootNode.getElementById && rootNode.getElementById(id))
      .filter(Boolean)
      .map(labelText)
      .join(' ');
  }

  /** Text of the labels that belong to one option of a group. */
  function optionLabels(group) {
    const out = new Set();
    for (const input of group) {
      const r = input.getRootNode();
      if (input.id) for (const l of r.querySelectorAll(`label[for="${CSS.escape(input.id)}"]`)) out.add(l);
      const wrap = input.closest('label');
      if (wrap) out.add(wrap);
    }
    return out;
  }

  const LABELISH = 'legend, label, [class*="label" i], [class*="question" i], [class*="title" i], [id*="label" i], h3, h4, h5, p, span';

  /** The first label-like element in the block that isn't an option and doesn't hold a control. */
  function headingIn(unit, controls) {
    const options = optionLabels(controls.filter((c) => c.matches('input[type="radio"], input[type="checkbox"]')));
    for (const el of unit.querySelectorAll(LABELISH)) {
      if (options.has(el) || [...options].some((o) => o.contains(el))) continue;
      if (controls.some((c) => el.contains(c))) continue;
      const t = labelText(el);
      if (t) return t;
    }
    return '';
  }

  function labelOf(unit, control, controls, type) {
    const rootNode = (control || unit).getRootNode();
    const group = type === 'radio' || type === 'checkboxes';
    if (group || !control) {
      const legend = unit.matches('fieldset') ? unit.querySelector(':scope > legend') : unit.querySelector('legend');
      if (legend) return labelText(legend);
      const g = unit.closest('[role="radiogroup"], [role="group"]') || unit.querySelector('[role="radiogroup"], [role="group"]');
      if (g?.getAttribute('aria-labelledby')) return byIds(rootNode, g.getAttribute('aria-labelledby'));
      if (g?.getAttribute('aria-label')) return clean(g.getAttribute('aria-label'));
      return headingIn(unit, controls);
    }
    if (type === 'checkbox') {
      // A lone checkbox is usually its own statement ("I currently work here").
      return headingIn(unit, controls) || AF.optionLabel(unit, control);
    }
    if (control.id) {
      const byFor = rootNode.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      if (byFor && labelText(byFor)) return labelText(byFor);
    }
    const labelledBy = control.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = byIds(rootNode, labelledBy);
      if (t) return t;
    }
    const wrap = control.closest('label');
    if (wrap && labelText(wrap)) return labelText(wrap);
    if (control.getAttribute('aria-label')) return clean(control.getAttribute('aria-label'));
    return headingIn(unit, controls) || clean(control.getAttribute('placeholder') || control.getAttribute('title') || '');
  }

  function isRequired(unit, control, controls, config) {
    if (config.required && config.required(unit, control)) return true;
    if (controls.some((c) => c.required || c.getAttribute('aria-required') === 'true')) return true;
    if (unit.matches('[aria-required="true"]') || unit.querySelector('[aria-required="true"]')) return true;
    return false;
  }

  // ── Blocks ─────────────────────────────────────────────────────────

  /** Radio buttons that share a name, and checkboxes that share a name or a group, form one question. */
  function groupKey(c) {
    if (c.matches('input[type="radio"]')) {
      return c.name ? `radio:${c.name}` : c.closest('fieldset, [role="radiogroup"]') || c.parentElement?.parentElement || null;
    }
    if (c.matches('input[type="checkbox"]')) {
      const box = c.closest('fieldset, [role="group"]');
      if (box) return box;
      if (c.name && /\[\]$/.test(c.name)) return `checkbox:${c.name}`;
    }
    return null;
  }

  function commonAncestor(els) {
    let a = els[0].parentElement;
    while (a && !els.every((e) => a.contains(e))) a = a.parentElement;
    return a;
  }

  /**
   * The block for a group of controls: their nearest common container,
   * widened while the wider box holds no other control, so the question
   * text sits inside it.
   */
  function blockFor(group, top) {
    // A control placed straight into a shadow root has no parent element: its host is the block.
    let el = (group.length > 1 ? commonAncestor(group) : group[0].parentElement) || group[0].getRootNode().host;
    if (!el) return null;
    const own = new Set(group);
    for (let i = 0; i < 4 && el !== top && el.parentElement && top.contains(el.parentElement); i++) {
      const up = el.parentElement;
      if (controlsIn(up).some((c) => !own.has(c))) break;
      el = up;
    }
    return el;
  }

  /** Blocks found from the controls themselves, for sites with no block selector. */
  function autoUnits(top) {
    const controls = controlsIn(top).filter(shown);
    const groups = new Map();
    for (const c of controls) {
      const key = groupKey(c) || c;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const out = [];
    for (const group of groups.values()) {
      const el = blockFor(group, top);
      if (el) out.push({ el, controls: group });
    }
    return out;
  }

  function configUnits(top, config) {
    const all = [...top.querySelectorAll(config.unit)];
    const set = new Set(all);
    return all
      // A block that holds smaller blocks is just a container.
      .filter((el) => ![...el.querySelectorAll(config.unit)].some((inner) => set.has(inner)))
      .filter((el) => visible(el))
      .map((el) => ({ el, controls: controlsIn(el).filter((c) => shown(c) || c.matches('input[type="file"]')) }));
  }

  const precedes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const HEADS = 'h1, h2, h3, h4, h5, [role="heading"]';

  function sectionOf(el, heads) {
    const anchor = anchorOf(el);
    let nearest = null;
    for (const h of heads) {
      if (h.contains(anchor) || h.getRootNode() !== anchor.getRootNode()) continue;
      if (precedes(h, anchor)) nearest = h;
    }
    return norm(text(nearest)) || 'application';
  }

  /** Every field on the page, described for rules.js and the fillers. */
  AF.forms.discover = function discover(config) {
    const fields = [];
    const done = new Set();
    for (const top of formRoots(config)) {
      const heads = [...top.querySelectorAll(HEADS)].filter(visible);
      // Fields inside web components live in shadow roots the form's own query can't see.
      const scopes = config.shadow ? [top, ...shadowsIn(top)] : [top];
      const units = scopes.flatMap((scope) => (config.unit ? configUnits(scope, config) : autoUnits(scope)));
      for (const { el, controls } of units) {
        if (done.has(el)) continue;
        done.add(el);
        const type = (config.classify && config.classify(el)) || classifyControls(controls);
        if (!type) continue;
        const control = mainControl(controls, type);
        const label = clean((config.label && config.label(el, control)) || labelOf(el, control, controls, type));
        const field = {
          el,
          control,
          id: (control && (control.id || control.name)) || '',
          type,
          label,
          required: isRequired(el, control, controls, config),
          section: config.section ? norm(config.section(el)) || 'application' : sectionOf(el, heads),
          index: null,
        };
        const hint = config.hint && config.hint(el, control);
        if (hint) field.hint = hint;
        fields.push(field);
      }
    }
    // The same question asked again in one section is a repeating entry
    // (a second job, a second school): number them in page order.
    const seen = new Map();
    for (const f of fields) {
      const key = `${f.section}\n${norm(f.label)}`;
      seen.set(key, (seen.get(key) || 0) + 1);
      f.index = seen.get(key);
    }
    for (const f of fields) if (seen.get(`${f.section}\n${norm(f.label)}`) === 1) f.index = null;
    return fields;
  };
})(globalThis);
