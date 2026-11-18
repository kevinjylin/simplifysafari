// Decides what to put in a field: maps a field's label and section to a value
// from the profile. Pure (no DOM), so it is covered by the node tests.
//
// resolve(field, profile) returns
//   { value }        – something to fill (string, boolean, date parts, list…)
//   { empty: true }  – we know what this field is, but the profile has no value
//   { ignore: true } – deliberately left alone
//   { extra: true }  – belongs to a job/school entry the profile doesn't have
//   null             – unrecognised; the user has to answer it
(function (root) {
  'use strict';
  const AF = (root.Applyfill = root.Applyfill || {});
  const { norm, DECLINE } = AF;

  const IGNORE = Symbol('ignore');
  const EXTRA = Symbol('extra');
  const ASK = Symbol('ask');

  const US_STATES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
    CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
    LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
    NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
    OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  };

  function stateAnswer(state) {
    const full = US_STATES[String(state).trim().toUpperCase()];
    return full ? [full, state] : state;
  }

  // Every spelling of the US, normalised: "U.S.A." is "u s a".
  const US_NAMES = new Set(['us', 'usa', 'u s', 'u s a', 'united states', 'united states of america']);

  /**
   * Forms list the US under different names: Workday says "United States of
   * America", Greenhouse's phone country says "United States +1". Neither
   * matches the other, so a US answer offers both.
   */
  function countryAnswer(country) {
    return US_NAMES.has(norm(country)) ? ['United States of America', 'United States'] : country;
  }

  /** "CA" for "CA" or "California"; '' outside the US list. */
  function stateCode(state) {
    const s = String(state).trim();
    if (US_STATES[s.toUpperCase()]) return s.toUpperCase();
    return Object.keys(US_STATES).find((code) => norm(US_STATES[code]) === norm(s)) || '';
  }

  /**
   * A single "Location (City)" answer, most specific first: Greenhouse and
   * Ashby suggest places like "Oakland, California, United States", Lever
   * lists "Oakland, CA, USA".
   */
  function locationAnswer(p) {
    const { city, state, country } = p.personal;
    if (!String(city).trim()) return '';
    const region = String(state).trim() ? [].concat(stateAnswer(state))[0] : '';
    const nation = String(country).trim() ? [].concat(countryAnswer(country)).pop() : '';
    const parts = (...xs) => xs.filter(Boolean).join(', ');
    return [...new Set([parts(city, region, nation), parts(city, region), parts(city, stateCode(state)), city])];
  }

  /**
   * Plain "Bachelor(s)" / "Master(s)" / "Associate(s)" options, with or without
   * "degree" or a note after it, but not a different named degree like
   * "Bachelor of Arts" or "Master of Business Administration". `query` is what
   * to type when the dropdown has to be searched.
   */
  const level = (word) => Object.assign(new RegExp(`^${word}( s|s)?\\b(?! of )`), { query: word });

  /** The profile's degree, then the generic names forms list it under. */
  function degreeAnswer(degree) {
    const d = norm(degree);
    if (!d) return '';
    const generic = [
      [/^(associate|a a|a s)\b/, ["Associate's Degree", level('associate')]],
      [/^(bachelor|b a|b s|ba|bs|bsc|beng|b eng|b tech|btech)\b/, ["Bachelor's Degree", level('bachelor')]],
      [/^(master of business|mba|m b a)\b/, ['Master of Business Administration']],
      [/^(master|m a|m s|ma|ms|msc|meng|m eng)\b/, ["Master's Degree", level('master')]],
      [/^(doctor of philosophy|phd|ph d|doctorate)\b/, ['Doctor of Philosophy']],
      [/^(juris doctor|jd|j d)\b/, ['Juris Doctor']],
      [/^(doctor of medicine|md|m d)\b/, ['Doctor of Medicine']],
      [/^high school|^ged\b/, ['High School']],
    ].filter(([re]) => re.test(d)).flatMap(([, names]) => names);
    return generic.length ? [degree, ...generic] : degree;
  }

  /** Workday wants the national number: digits only, no country prefix. */
  function phoneDigits(p) {
    const digits = String(p.personal.phone).replace(/\D/g, '');
    const us = /\+1\b/.test(p.personal.phoneCountryCode);
    return us && digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  }

  const num = (v) => (v == null || String(v).trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));

  function dateParts(month, year) {
    const y = num(year);
    if (y == null) return '';
    return { month: num(month), day: null, year: y };
  }

  function today() {
    const d = new Date();
    return { month: d.getMonth() + 1, day: d.getDate(), year: d.getFullYear() };
  }

  /** URLs for the generic "Websites" section, in the order they're filled. */
  AF.websiteList = function websiteList(profile, { includeLinkedin = true } = {}) {
    const { linkedin, github, portfolio, other } = profile.links;
    return [portfolio, github, other, includeLinkedin ? linkedin : ''].filter((u) => String(u).trim());
  };

  const GENDER = {
    Male: ['Male', /^man\b/],
    Female: ['Female', /^woman\b/],
    'Non-binary': [/non binary/, /\bother\b/],
    Decline: [DECLINE],
  };
  const VETERAN = {
    'Not a veteran': [/\b(am|are) not a (protected )?veteran\b/, /^no\b/],
    'Protected veteran': [/identify as one or more/, /\b(am|are) a (protected )?veteran\b/, /^yes\b/],
    'Veteran, not protected': [/veteran.*\bnot (a )?protected\b/, /^yes\b/],
    Decline: [DECLINE],
  };
  const DISABILITY = {
    Yes: [/^yes\b/],
    No: [/^no\b/],
    Decline: [/do not (want|wish) to answer/, DECLINE],
  };

  const entry = (list, f) => list[(f.index || 1) - 1];
  // An entry beyond what the profile lists (a résumé parser often invents
  // some) is not ours to fill, but is worth pointing out.
  const fromEntry = (list, get) => (p, f) => {
    const e = entry(p[list], f);
    if (e) return get(e);
    return p[list].length ? EXTRA : IGNORE;
  };

  /** The job marked current, for "Current company" outside a work-history section. */
  const currentJob = (p) => p.work.find((w) => w.current);

  const WORK = /^work experience|^employment|^experience$/;
  const EDU = /^education/;

  // First match wins. `short` rules only apply to short labels so that a long
  // free-form question mentioning "city" or "email" isn't mistaken for the field.
  const RULES = [
    // ── Work experience ──────────────────────────────────────────────
    { section: WORK, label: /currently work|current (position|job|employer|role)|^current$/, get: fromEntry('work', (e) => Boolean(e.current)) },
    { section: WORK, label: /job title|position|^title$|^role$/, get: fromEntry('work', (e) => e.title) },
    { section: WORK, label: /company|employer|organi[sz]ation/, get: fromEntry('work', (e) => e.company) },
    { section: WORK, label: /location/, get: fromEntry('work', (e) => e.location) },
    { section: WORK, label: /^from|^start/, get: fromEntry('work', (e) => dateParts(e.startMonth, e.startYear)) },
    { section: WORK, label: /^to\b|^end/, get: fromEntry('work', (e) => (e.current ? IGNORE : dateParts(e.endMonth, e.endYear))) },
    { section: WORK, label: /description|responsibilit|summary/, get: fromEntry('work', (e) => e.description) },

    // ── Education ────────────────────────────────────────────────────
    { section: EDU, label: /school|university|college|institution/, get: fromEntry('education', (e) => e.school) },
    { section: EDU, label: /degree/, get: fromEntry('education', (e) => degreeAnswer(e.degree)) },
    { section: EDU, label: /field of study|major|discipline/, get: fromEntry('education', (e) => e.field) },
    { section: EDU, label: /gpa|overall result|grade/, get: fromEntry('education', (e) => e.gpa) },
    { section: EDU, label: /^from|^start|first year/, get: fromEntry('education', (e) => dateParts(null, e.startYear)) },
    { section: EDU, label: /^to\b|^end|last year|graduat/, get: fromEntry('education', (e) => dateParts(null, e.endYear)) },
    // Outside an education section: "Which university are you currently attending or did you last attend?"
    {
      label: /^(school|university|college)( name)?$|\b(school|university|college) (are|did|do) you (currently |last )?(attend|graduate)/,
      get: (p) => p.education[0]?.school || '',
    },

    // ── Links, skills, résumé ────────────────────────────────────────
    { section: /^websites?/, label: /url|website|link/, get: (p, f, ctx) => AF.websiteList(p, ctx)[(f.index || 1) - 1] ?? IGNORE },
    { label: /linkedin/, get: (p) => p.links.linkedin },
    { label: /github/, get: (p) => p.links.github },
    { short: true, label: /^(personal |your )?(website|portfolio|blog)( url| link)?$/, get: (p) => p.links.portfolio || p.links.github || p.links.other },
    { short: true, label: /^other (website|url|link)s?( url)?$/, get: (p) => p.links.other },
    { label: /twitter|facebook|instagram/, get: () => IGNORE },
    { type: 'searchable', label: /skill/, get: (p) => (p.skills.length ? { multi: p.skills } : '') },
    { type: 'file', either: /resume|\bcv\b|curriculum/, not: /cover letter/, get: (p, f, ctx) => ctx.resume || '' },
    { type: 'file', label: /./, get: () => IGNORE },

    // Consent, terms and attestations are the applicant's to tick, whatever else they
    // mention ("I certify I am over 18"): listed as needing you, never ticked.
    { type: 'checkbox', label: /consent|i agree|agree to|acknowledg|terms|privacy|certify|attest|confirm that/, get: () => ASK },

    // ── Personal details ─────────────────────────────────────────────
    { short: true, label: /^current (company|employer|organi[sz]ation)( name)?$/, get: (p) => currentJob(p)?.company || '' },
    { short: true, label: /^current (job )?title$|^current (position|role)$/, get: (p) => currentJob(p)?.title || '' },
    { short: true, label: /preferred|local|phonetic|prefix|suffix|^title$|middle|extension|^county$/, get: () => IGNORE },
    { short: true, label: /first name|given name/, get: (p) => p.personal.firstName },
    { short: true, label: /last name|family name|surname/, get: (p) => p.personal.lastName },
    { short: true, label: /phone code|country code/, get: (p) => p.personal.phoneCountryCode },
    { short: true, label: /device type|phone type/, get: (p) => p.personal.phoneType },
    { short: true, label: /phone|mobile|telephone/, get: (p) => phoneDigits(p) },
    { short: true, label: /email/, get: (p) => p.personal.email },
    { short: true, label: /address line 2|apartment|suite|^unit/, get: (p) => p.personal.address2 || IGNORE },
    { short: true, label: /address line 1|street|^address$/, get: (p) => p.personal.address1 },
    { short: true, label: /^(current )?location( city)?$/, get: (p) => locationAnswer(p) },
    { short: true, label: /^city|^town/, get: (p) => p.personal.city },
    { short: true, label: /postal|zip/, get: (p) => p.personal.postalCode },
    { short: true, label: /^state|province|^region$|territory/, get: (p) => stateAnswer(p.personal.state) },
    { short: true, label: /^country( region)?$/, get: (p) => countryAnswer(p.personal.country) },

    // ── Common screening questions ───────────────────────────────────
    { label: /\bhow (did )?you (hear|heard|learn|learned|find|found)( out)? (about|of)\b|where did you (hear|learn|find)|^source\b|referral source/, get: (p) => p.questions.source },
    {
      // "…authorized to work without sponsorship?" is a yes for someone who needs none.
      label: /without (the need for |requiring |needing )?(visa |employer |company )?sponsor/,
      get: (p) => {
        const { authorized, sponsorship } = p.questions;
        if (!authorized || !sponsorship) return '';
        return authorized === 'Yes' && sponsorship === 'No' ? 'Yes' : 'No';
      },
    },
    { label: /sponsor/, get: (p) => p.questions.sponsorship },
    // Only authorization *to work*: "an authorized dealer of T-Mobile" is something else.
    {
      label: /authori[sz]ed to (work|be employed)|(work|employment) authori[sz]ation|legally (able|eligible|permitted|entitled)|eligible to work|right to work|legal right/,
      get: (p) => p.questions.authorized,
    },
    { label: /(at least|over|older than) (the age of )?18|18 years (of age )?or older|legal age/, get: (p) => p.questions.over18 },
    {
      label: /previously (worked|been employed)|former (employee|worker|contractor)|(have|did) you (ever )?(worked?|been employed) (for|at|by|with)|have you (ever )?been employed or (are|were) you (currently )?employed|current or (former|previous)/,
      id: /previous worker/,
      get: (p) => p.questions.previouslyEmployed,
    },
    { label: /non ?compete|restrictive covenant|non ?solicit/, get: (p) => p.questions.nonCompete },
    { label: /relocat/, get: (p) => p.questions.relocate },

    // ── Voluntary self-identification ────────────────────────────────
    // `byChoices`: also recognised from the option text, for groups whose only
    // label is "Please check one of the boxes below:".
    { label: /veteran/, byChoices: true, get: (p) => VETERAN[p.eeo.veteran] || '' },
    { label: /disabilit/, byChoices: true, get: (p) => DISABILITY[p.eeo.disability] || '' },
    { label: /hispanic|latino/, get: (p) => p.eeo.hispanic },
    { label: /ethnic|\brace\b/, get: (p) => (p.eeo.ethnicity === 'Decline' ? [DECLINE] : p.eeo.ethnicity) },
    { label: /gender|\bsex\b/, get: (p) => GENDER[p.eeo.gender] || p.eeo.gender },
    { short: true, type: 'text', label: /^(full |your )?name$/, get: (p) => `${p.personal.firstName} ${p.personal.lastName}`.trim() },
    { short: true, type: 'date', label: /^(today s )?date( signed)?$/, get: () => today() },
  ];

  const splitId = (id) =>
    norm(String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2'));

  function ruleMatches(rule, f, label, idText) {
    if (rule.type && rule.type !== f.type) return false;
    if (rule.section && !rule.section.test(f.section || '')) return false;
    if (rule.either) {
      const hay = `${label} | ${f.section || ''} | ${idText}`;
      return rule.either.test(hay) && !(rule.not && rule.not.test(hay));
    }
    if (label) {
      if (rule.short && label.split(' ').length > 6) return false;
      return rule.label.test(label);
    }
    // No readable label: fall back to Workday's own field id.
    return rule.label.test(idText) || Boolean(rule.id && rule.id.test(idText));
  }

  function customAnswer(profile, label) {
    if (!label) return undefined;
    for (const { question, answer } of profile.custom) {
      const q = norm(question);
      if (q && String(answer).trim() && label.includes(q)) return answer;
    }
    return undefined;
  }

  /**
   * @param field   { type, label, id, section, index, hint?, choices? } – `choices`: option texts of a radio/checkbox group
   * @param profile normalised profile
   * @param ctx     { resume, includeLinkedin } – page-level facts the rules need
   */
  AF.resolve = function resolve(field, profile, ctx = {}) {
    const label = norm(field.label);
    const idText = splitId(field.id || '');

    // Your own answers go by the question as asked; the built-in rules may go by
    // what the site says the field is (Ashby's `hint`), since employers reword those.
    let value = customAnswer(profile, label);
    if (value === undefined) {
      const ruleLabel = field.hint ? norm(field.hint) : label;
      const choices = norm((field.choices || []).join(' | '));
      const rule =
        RULES.find((r) => ruleMatches(r, field, ruleLabel, idText)) ||
        (choices && RULES.find((r) => r.byChoices && ruleMatches(r, field, choices, idText)));
      if (!rule) return null;
      value = rule.get(profile, field, ctx);
    }
    if (value === ASK) return null;
    if (value === IGNORE) return { ignore: true };
    if (value === EXTRA) return { extra: true };
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return { empty: true };
    return { value };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
