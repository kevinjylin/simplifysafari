// Lever (jobs.lever.co/<company>/<job>/apply).
//
// As measured on live postings: a server-rendered <form id="application-form">
// with one `li.application-question` per question, its text in
// `.application-label` (required ones end in "✱"), and section titles in <h4>.
// Custom questions are plain radios, checkboxes, selects and textareas.
//
// Two controls need handling of their own:
//   - Current location searches as you type (on keydown, after 500 ms) and
//     lists `.dropdown-location` results, chosen on mousedown. Leaving the box
//     while the list is open empties it.
//   - Attaching a résumé makes Lever read it and fill in name, email, phone,
//     company and links. That's done first and waited for, so the pass after
//     it checks Lever's guesses instead of racing them.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text, visible } = AF;

  const FORM = '#application-form';
  const UNIT = 'li.application-question';

  // ── Current location ───────────────────────────────────────────────

  const locationInput = (f) => f.el.querySelector('input.location-input');
  const chosenPlace = (f) => f.el.querySelector('input[name="selectedLocation"]');
  const results = (f) => [...f.el.querySelectorAll('.dropdown-location')];
  const noResults = (f) => visible(f.el.querySelector('.dropdown-no-results'));

  async function fillLocation(f, value) {
    const input = locationInput(f);
    if (!input) return 'failed';
    const had = input.value.trim();
    const confirmed = !chosenPlace(f) || Boolean(chosenPlace(f).value);
    if (had && confirmed && AF.bestOption([had], value) >= 0) return 'already';

    let seen = [];
    for (const query of AF.forms.queries(value)) {
      input.focus();
      AF.setValue(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }));
      await sleep(600); // the search is debounced by 500 ms
      await waitFor(() => results(f).length || noResults(f), { timeout: 5000 });
      const options = results(f);
      seen = options.map(text);
      const pick = AF.bestOption(seen, value);
      if (pick < 0) continue;
      options[pick].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      const ok = await waitFor(() => input.value === seen[pick], { timeout: 1000 });
      return ok ? AF.filled(had) : 'failed';
    }
    // Put back what was there, and hide the list without leaving the box (that would empty it).
    AF.setValue(input, had);
    const list = f.el.querySelector('.dropdown-container');
    if (list) list.style.display = 'none';
    return { status: 'nomatch', options: seen.slice(0, 40) };
  }

  // ── Résumé first ───────────────────────────────────────────────────

  let attachedHere = null;

  async function attachResumeFirst(resume) {
    const unit = document.querySelector(`${FORM} ${UNIT}.resume`) || document.querySelector(`${FORM} #resume-upload-input`)?.closest(UNIT);
    if (!resume || !unit) return;
    const f = { el: unit, control: unit.querySelector('input[type="file"]') };
    if (await AF.forms.fillFile(f, resume) !== 'filled') return;
    attachedHere = unit;
    // Give the reader a moment to start, then let it finish.
    await sleep(800);
    await waitFor(() => !visible(unit.querySelector('.resume-upload-working')), { timeout: 20000 });
    await sleep(300);
  }

  async function fillResume(f, resume) {
    if (attachedHere === f.el) {
      attachedHere = null;
      return 'filled';
    }
    return AF.forms.fillFile(f, resume);
  }

  AF.forms.install({
    form: FORM,
    unit: UNIT,
    label: (unit) => AF.forms.labelText(unit.querySelector('.application-label')),
    section: (unit) => {
      let heading = null;
      for (const h of document.querySelectorAll(`${FORM} h4`)) {
        if (h.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING) heading = h;
      }
      return text(heading);
    },
    required: (unit) => /✱|\*/.test(text(unit.querySelector('.application-label'))),
    classify: (unit) => (unit.querySelector('input.location-input') ? 'location' : null),
    fillers: { location: fillLocation, file: fillResume },
    hasValue: { location: (f) => Boolean(locationInput(f)?.value.trim()) },
    prepare: (profile, ctx) => attachResumeFirst(ctx.resume),
    hasFields: () => Boolean(document.querySelector(`${FORM} ${UNIT}`)),
  });
})(globalThis);
