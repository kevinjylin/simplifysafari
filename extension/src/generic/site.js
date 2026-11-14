// Any other application form: Workable, SmartRecruiters, BambooHR, JazzHR,
// Breezy, Jobvite, iCIMS, Recruitee, Teamtailor, Rippling and the like, or
// any page the toolbar popup is asked to try. There's no site knowledge here:
// questions are found from their labels (label[for], aria-labelledby,
// wrapping labels, fieldset legends), including inside web components.
//
// Left alone if a site-specific filler is already loaded in this frame.
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  if (AF.fillPage) return;

  const LOOKS_LIKE_APPLICATION = /\be ?mail\b|\bfirst name\b|\bfull name\b|\blast name\b|\bresume\b|\bcv\b|\bphone\b/;

  AF.forms.install({
    shadow: true,
    // A job search box and two filter dropdowns aren't an application: only show
    // the card when the page asks for the things every application asks for.
    hasFields: () => {
      const fields = AF.discover();
      return fields.length >= 3 && fields.some((f) => LOOKS_LIKE_APPLICATION.test(AF.norm(f.label)) || f.control?.type === 'email');
    },
  });
})(globalThis);
