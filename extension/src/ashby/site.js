// Ashby (jobs.ashbyhq.com, including the /embed frame career sites show).
//
// As measured on live postings: each question is an
// `.ashby-application-form-field-entry` (a `fieldset` for radio and checkbox
// groups) whose `.ashby-application-form-question-title` label has a
// `_required_` class when the question is required. Sections sit in
// `.ashby-application-form-section-container`. Yes/No questions are two
// toggle buttons (`data-option="yes|no"`, `aria-pressed`) over a hidden
// checkbox; pressing the chosen one again clears it. Location is a
// type-to-search combobox whose box shows the chosen place once it loses focus.
// Built-in questions carry `_systemfield_*` ids, which say what a question is
// even when the employer reworded it ("Which country do you intend to work from?").
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { sleep, waitFor, text } = AF;

  const FORM = '.ashby-application-form-container';
  const UNIT = '.ashby-application-form-field-entry, fieldset[class*="fieldEntry"]';
  const TITLE = '.ashby-application-form-question-title';
  const YESNO = '.ashby-application-form-input-yesno';

  const SYSTEM = {
    _systemfield_name: 'Name',
    _systemfield_email: 'Email',
    _systemfield_phone: 'Phone',
    _systemfield_location: 'Location',
    _systemfield_resume: 'Resume',
    _systemfield_cover_letter: 'Cover letter',
  };

  const title = (unit) => unit.querySelector(`:scope > ${TITLE}`) || unit.querySelector(TITLE);
  const buttons = (f) => [...f.el.querySelectorAll(`${YESNO} button`)];
  const pressed = (b) => b.getAttribute('aria-pressed') === 'true';

  async function fillYesNo(f, value) {
    const list = buttons(f);
    const labels = list.map(text);
    const pick = AF.bestOption(labels, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value);
    if (pick < 0) return { status: 'nomatch', options: labels };
    // Pressing the chosen button again would clear the answer.
    if (pressed(list[pick])) return 'already';
    const had = list.some(pressed);
    list[pick].click();
    const ok = await waitFor(() => !list[pick].isConnected || pressed(list[pick]), { timeout: 900 });
    await sleep(30);
    return ok ? AF.filled(had) : 'failed';
  }

  AF.forms.install({
    form: FORM,
    unit: UNIT,
    label: (unit) => AF.forms.labelText(title(unit)),
    required: (unit) => /_required_/.test(title(unit)?.className || ''),
    section: (unit) =>
      text(unit.closest('.ashby-application-form-section-container')?.querySelector('.ashby-application-form-section-header-title')),
    classify: (unit) => (unit.querySelector(YESNO) ? 'yesno' : null),
    hint: (unit) => {
      const id = title(unit)?.getAttribute('for') || unit.querySelector('[id^="_systemfield_"]')?.id || '';
      return SYSTEM[id] || null;
    },
    fillers: { yesno: fillYesNo },
    hasValue: { yesno: (f) => buttons(f).some(pressed) },
    hasFields: () => Boolean(document.querySelector(`${FORM} ${UNIT}`)),
  });
})(globalThis);
