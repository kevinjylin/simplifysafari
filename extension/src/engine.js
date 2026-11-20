// The parts of filling that don't depend on which applicant-tracking site the
// page belongs to: plain inputs, checkboxes and radios, résumé files, and the
// pass that walks the page and collects a report. Each site (workday/,
// greenhouse/) supplies discover(), fillField(), hasValue() and, optionally,
// prepare() for adding repeating entries.
//
// A field that already holds a value is compared with the profile: left alone
// if it matches, replaced if it doesn't. Never clicks Next, Save or Submit.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, text, loose } = AF;

  /** The text to type for an answer: its first literal candidate, or else what a pattern says to type (`query`). */
  AF.firstString = function firstString(value, maxLength = Infinity) {
    const strings = AF.candidates(value).map((c) => (typeof c === 'string' ? c : c.query)).filter(Boolean);
    // A two-character "State" box wants "CA", not "California".
    return String(strings.find((s) => s.length <= maxLength) ?? strings[0] ?? '');
  };
  /** Result for a successful fill; `had` says a previous value was overwritten. */
  AF.filled = (had) => (had ? { status: 'filled', replaced: true } : 'filled');

  const clean = (s) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  AF.cleanLabel = clean;

  /** Label text of one radio/checkbox option inside wrapper `w`. */
  AF.optionLabel = function optionLabel(w, input) {
    const label = (input.id && w.querySelector(`label[for="${CSS.escape(input.id)}"]`)) || input.closest('label');
    return clean(text(label) || input.getAttribute('aria-label') || text(input.parentElement));
  };

  // ── Text ───────────────────────────────────────────────────────────

  AF.fillInput = async function fillInput(input, value) {
    if (!input) return 'failed';
    const wanted = AF.firstString(value, input.maxLength > 0 ? input.maxLength : Infinity);
    // An answer that only describes an option to pick has nothing to type; never blank the box for it.
    if (!wanted.trim()) return 'failed';
    const had = input.value.trim();
    if (loose(had) === loose(wanted)) return 'already';
    AF.typeInto(input, wanted);
    AF.blur(input);
    await sleep(30);
    // If the page's own state rejected the change, React will have reverted it.
    // Compared loosely because some sites reformat values (phone numbers) on blur.
    return loose(input.value) === loose(wanted) ? AF.filled(had) : 'failed';
  };

  // ── Radio groups and checkboxes ────────────────────────────────────

  AF.fillChoice = async function fillChoice(w, value, kind) {
    const inputs = [...w.querySelectorAll(`input[type="${kind}"]`)];
    const labels = inputs.map((i) => AF.optionLabel(w, i));
    const want = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
    const pick = AF.bestOption(labels, want);
    if (pick < 0) return { status: 'nomatch', options: labels };
    if (inputs[pick].checked) return 'already';
    const had = inputs.some((i) => i.checked);
    inputs[pick].click();
    await sleep(30);
    return inputs[pick].checked || !inputs[pick].isConnected ? AF.filled(had) : 'failed';
  };

  AF.fillCheckbox = async function fillCheckbox(input, value) {
    if (!input) return 'failed';
    const want = typeof value === 'boolean' ? value : /^(yes|true|checked)$/i.test(String(value).trim());
    if (input.checked === want) return 'already';
    input.click();
    await sleep(30);
    return input.checked === want || !input.isConnected ? AF.filled(!want) : 'failed';
  };

  // ── Files ──────────────────────────────────────────────────────────

  AF.toFile = function toFile(resume) {
    const base64 = resume.dataUrl.slice(resume.dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], resume.name, { type: resume.type || 'application/pdf' });
  };

  /** Put the résumé into a file input as if it had been chosen in the file picker. */
  AF.attachFile = function attachFile(input, resume) {
    const transfer = new DataTransfer();
    transfer.items.add(AF.toFile(resume));
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // ── The whole page ─────────────────────────────────────────────────

  const RANK = { filled: 6, partial: 5, failed: 4, nomatch: 4, differs: 4, extra: 3, empty: 3, unknown: 3, already: 2, kept: 2, ignored: 1 };
  const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  /**
   * Fill everything recognisable on the current page using `site`.
   * Returns one report row per field:
   *   { label, id, type, section, index, required, status, replaced?, options?, missing?, diag?, el }
   */
  AF.runFill = async function runFill(site, profile, resume) {
    const present = site.discover();
    const ctx = {
      resume,
      // LinkedIn goes in its own field when the page has one, otherwise into Websites.
      includeLinkedin: !present.some((f) => /linkedin/i.test(f.label)),
      // The country phone code has a field of its own, so the number goes in without it.
      phoneCodeField: present.some((f) => /phone code|country code|dial(l?ing)? code|calling code/i.test(f.label)),
    };
    if (site.prepare) await site.prepare(profile, ctx);

    const rows = new Map();
    const seen = new WeakSet();
    const extras = new Set();
    // Filling one field can reveal others (choosing a country shows the state
    // list), so keep sweeping until a pass finds nothing new.
    for (let pass = 0; pass < 6; pass++) {
      const fresh = site.discover().filter((f) => !seen.has(f.el));
      if (!fresh.length) break;
      for (const f of fresh) {
        seen.add(f.el);
        if (!f.el.isConnected) continue;
        const row = { ...f, status: 'unknown' };
        const answer = AF.resolve(f, profile, ctx);
        if (!answer || answer.empty) {
          // Nothing to compare against, so an existing answer stands.
          row.status = site.hasValue(f) ? 'kept' : answer ? 'empty' : 'unknown';
        } else if (answer.ignore) {
          row.status = 'ignored';
        } else if (answer.extra) {
          // One line per surplus entry, not one per field in it.
          const entry = `${f.section} ${f.index}`;
          row.status = extras.has(entry) ? 'ignored' : 'extra';
          if (!extras.has(entry)) Object.assign(row, { label: titleCase(entry), required: false });
          extras.add(entry);
        } else {
          try {
            const result = await site.fillField(f, answer.value);
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
