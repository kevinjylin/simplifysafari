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

  /** A US state under both its names, whichever way the profile spells it; anything else as typed. */
  function stateAnswer(state) {
    const code = stateCode(state);
    return code ? [US_STATES[code], code] : state;
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
    const named = [parts(city, region, nation), parts(city, region), parts(city, stateCode(state))].filter((x) => x !== city);
    // The city on its own is a last resort: fine for a list that says just
    // "Oakland" or has one Oakland, a guess between "Oakland, MI" and "Oakland, NJ".
    const c = norm(city).replace(/\+/g, '\\+');
    const exactly = Object.assign(new RegExp(`^${c}$`), { query: city });
    const theOnly = Object.assign(new RegExp(`^${c}\\b`), { query: city, unique: true });
    return [...new Set(named), exactly, theOnly];
  }

  /**
   * Plain "Bachelor(s)" / "Master(s)" / "Associate(s)" options, with or without
   * "degree" or a note after it, but not a different named degree like
   * "Bachelor of Arts" or "Master of Business Administration". `query` is what
   * to type when the dropdown has to be searched.
   */
  const level = (word) => Object.assign(new RegExp(`^${word}( s|s)?\\b(?! of )`), { query: word });

  /** An option that is just the abbreviation: "BS", "B.S.", "BSc - Bachelor of Science". */
  const abbr = (re, query) => Object.assign(new RegExp(`^(${re})\\b`), { query });

  // Specific degrees: their abbreviation, for lists like "BA / BS / MS / PhD",
  // and their full name, for a profile that says "B.S." and a list that doesn't.
  const DEGREE_ABBR = [
    [/^(bachelor of science|bs|b s|bsc|b sc)\b/, abbr('bs|b s|bsc|b sc', 'BS'), 'Bachelor of Science'],
    [/^(bachelor of arts|ba|b a)\b/, abbr('ba|b a', 'BA'), 'Bachelor of Arts'],
    [/^(bachelor of engineering|beng|b eng)\b/, abbr('beng|b eng', 'BEng'), 'Bachelor of Engineering'],
    [/^(master of science|ms|m s|msc|m sc)\b/, abbr('ms|m s|msc|m sc', 'MS'), 'Master of Science'],
    [/^(master of arts|ma|m a)\b/, abbr('ma|m a', 'MA'), 'Master of Arts'],
    [/^(master of engineering|meng|m eng)\b/, abbr('meng|m eng', 'MEng'), 'Master of Engineering'],
    [/^(master of business|mba|m b a)\b/, abbr('mba|m b a', 'MBA'), 'Master of Business Administration'],
    [/^(associate of arts|aa|a a)\b/, abbr('aa|a a', 'AA'), 'Associate of Arts'],
    [/^(associate of science|as|a s)\b/, abbr('as|a s', 'AS'), 'Associate of Science'],
    [/^(doctor of philosophy|phd|ph d|doctorate)\b/, abbr('phd|ph d', 'PhD'), 'Doctor of Philosophy'],
    [/^(juris doctor|jd|j d)\b/, abbr('jd|j d', 'JD'), 'Juris Doctor'],
    [/^(doctor of medicine|md|m d)\b/, abbr('md|m d', 'MD'), 'Doctor of Medicine'],
  ];

  /** The profile's degree, its abbreviation and full name, then the generic names forms list it under. */
  function degreeAnswer(degree) {
    const d = norm(degree);
    if (!d) return '';
    const specific = DEGREE_ABBR.filter(([re]) => re.test(d)).flatMap(([, a, full]) => [a, full]);
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
    const all = [...new Set([degree, ...specific, ...generic])];
    return all.length > 1 ? all : degree;
  }

  /** "44" out of "United Kingdom (+44)". */
  const dialDigits = (p) => (/\+\s*(\d{1,4})/.exec(p.personal.phoneCountryCode) || [])[1] || '';

  /** The country phone code for a box you type it into: "+1", not "United States of America (+1)". */
  const dialCode = (p) => (dialDigits(p) ? `+${dialDigits(p)}` : p.personal.phoneCountryCode);

  /**
   * Workday wants the national number: digits only, no country prefix. A US
   * number always loses its leading 1; any other loses its prefix only where
   * the form asks for the country code in a field of its own.
   */
  function phoneDigits(p, ctx) {
    const raw = String(p.personal.phone);
    const digits = raw.replace(/\D/g, '');
    const code = dialDigits(p);
    if (code === '1') return digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
    const international = /^\s*\+/.test(raw) && code && digits.startsWith(code);
    return international && ctx.phoneCodeField ? digits.slice(code.length) : digits;
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
    'Non-binary': [Object.assign(/non binary/, { query: 'Non-binary' }), /\bother\b/],
    Decline: [DECLINE],
  };
  // A plain "Yes"/"No" comes last, for forms that just ask "Are you a veteran?".
  const VETERAN = {
    'Not a veteran': [/\b(am|are) not a (protected )?veteran\b/, 'No'],
    'Protected veteran': [/identify as one or more/, /\b(am|are) a (protected )?veteran\b/, 'Yes'],
    'Veteran, not protected': [/veteran.*\bnot (a )?protected\b/],
    Decline: [DECLINE],
  };
  function veteranAnswer(p, label) {
    const status = p.eeo.veteran;
    if (!VETERAN[status]) return '';
    // For a veteran who isn't a protected one, Yes or No depends on which of the two is asked.
    if (status === 'Veteran, not protected') return [...VETERAN[status], /protected/.test(label) ? 'No' : 'Yes'];
    return VETERAN[status];
  }
  const DISABILITY = {
    Yes: ['Yes'],
    No: ['No'],
    Decline: [/do not (want|wish) to answer/, DECLINE],
  };

  // The option that *is* Hispanic, not "White (Not Hispanic or Latino)".
  const HISPANIC_OPTION = Object.assign(/^(hispanic|latin[aoxe]?)\b/, { query: 'Hispanic' });
  const NOT_HISPANIC_OPTION = /^(not|non) (of )?(hispanic|latin)/;

  /** "Are you Hispanic or Latino?", answered Yes/No or with the two options named. */
  function hispanicAnswer(eeo) {
    const answer = norm(eeo.hispanic);
    if (answer === 'yes') return ['Yes', HISPANIC_OPTION];
    if (answer === 'no') return ['No', NOT_HISPANIC_OPTION];
    return eeo.hispanic;
  }

  /**
   * Many race lists (EEO-1 style, e.g. "Asian (Not Hispanic or Latino)") count
   * Hispanic as its own choice that takes precedence over race. Someone who
   * answered Hispanic "Yes" gets that option when the list has one, and their
   * race otherwise.
   */
  function ethnicityAnswer(eeo) {
    if (eeo.ethnicity === 'Decline') return [DECLINE];
    if (norm(eeo.hispanic) !== 'yes') return eeo.ethnicity;
    return [HISPANIC_OPTION, eeo.ethnicity].filter(Boolean);
  }

  const MILITARY = String.raw`(militar(y|ies)|armed forces|veterans?|service ?members?|served|active duty|national guard)`;
  const SPOUSE = String.raw`(spouse|domestic partner|husband|wife)`;
  const SPOUSE_MILITARY = new RegExp(String.raw`\b${SPOUSE}\b.*\b${MILITARY}\b|\b${MILITARY}\b.*\b${SPOUSE}\b`);

  // Export-control and "protected individual" (8 U.S.C. 1324b(a)(3)) questions
  // list statuses, or just ask Yes/No. Citizens, permanent residents, refugees
  // and asylees all count as U.S. persons, so all of those answer Yes. Status
  // options are matched before the Yes/No fallback, and an option that negates
  // a status ("No, I am not a U.S. citizen") never counts as that status.
  const notNegated = '^(?!(no|none|neither|non)\\b)(?!.*\\b(not|non)\\b)';
  const US_STATUS = {
    Citizen: [new RegExp(`${notNegated}.*\\b(united states|u s|us|american) (citizen|national)|${notNegated}.*\\bcitizen (or national )?of the (united states|u s)`), 'Yes'],
    'Permanent resident': [new RegExp(`${notNegated}.*(permanent resident|green card)`), 'Yes'],
    'Refugee or asylee': [new RegExp(`${notNegated}.*\\b(refugee|asylee|asylum)`), 'Yes'],
    None: [/\bnone of (the|these)\b/, /^neither\b/, /\bnot (a |an )?(u s |united states )?(person|citizen)\b/, 'No'],
  };

  // Yes/No only answers a question that asks whether you *are* a U.S. person.
  // "Are you a foreign person?", "Will you need an export licence?" and "Are you
  // a citizen of an embargoed country?" mention the same law and mean the opposite.
  const ASKS_US_PERSON = /\b(u s|us|united states) (person|citizen)|protected individual|1324b|citizen or national|permanent resident/;
  const OTHER_POLARITY =
    /foreign (person|national)|licen[sc]e|embargo|sanction|restricted (countr|part|person|entit)|\bnot (a |an )?(u s|us|united states)\b|citizen of (a|an|any|one|another)\b|countr(y|ies) (subject|listed|such as|including)/;

  function usStatusAnswer(p, label) {
    const options = US_STATUS[p.questions.usStatus];
    if (!options) return '';
    if (ASKS_US_PERSON.test(label) && !OTHER_POLARITY.test(label)) return options;
    return options.filter((c) => c instanceof RegExp);
  }

  // ── Work authorization and sponsorship ─────────────────────────────
  // The saved answers are about the country you live in. A question that
  // names somewhere else is yours to answer.
  const PLACES = [
    ['canada'], ['mexico'], ['united kingdom', 'uk', 'u k', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland'],
    ['ireland'], ['germany'], ['france'], ['spain'], ['italy'], ['portugal'], ['netherlands'], ['belgium'], ['luxembourg'],
    ['switzerland'], ['austria'], ['sweden'], ['norway'], ['denmark'], ['finland'], ['poland'], ['czech republic', 'czechia'],
    ['romania'], ['hungary'], ['greece'], ['bulgaria'], ['croatia'], ['serbia'], ['ukraine'], ['estonia'], ['latvia'], ['lithuania'],
    ['israel'], ['united arab emirates', 'uae'], ['saudi arabia'], ['qatar'], ['egypt'], ['nigeria'], ['kenya'], ['south africa'],
    ['india'], ['pakistan'], ['bangladesh'], ['china'], ['hong kong'], ['taiwan'], ['japan'], ['south korea', 'korea'], ['singapore'],
    ['malaysia'], ['indonesia'], ['thailand'], ['vietnam'], ['philippines'], ['australia'], ['new zealand'],
    ['brazil'], ['argentina'], ['colombia'], ['chile'], ['peru'], ['costa rica'],
    ['european union', 'eu', 'europe', 'eea', 'emea', 'schengen'], ['apac', 'asia'], ['latin america', 'latam'],
  ].map((names) => ({ names, re: new RegExp(`\\b(${names.join('|')})\\b`) }));
  const US_MENTION = /\b(united states|u s a|u s|usa|america)\b|\b(in|within|for) the us\b/;

  function elsewhere(label, p) {
    const country = norm(p.personal.country);
    if (!country) return false;
    if (!US_NAMES.has(country) && US_MENTION.test(label.replace(/\blatin america\b/g, ''))) return true;
    return PLACES.some(({ names, re }) => !names.includes(country) && re.test(label));
  }

  const ASKS_AUTHORIZED =
    /authori[sz]ed to (work|be employed)|legally (able|eligible|permitted|entitled|allowed|authori[sz]ed) (to (work|be employed|accept employment)|for employment)|eligible (to work|for employment)|right to work|legal right to (work|be employed|live and work)/;
  const HAS_WORK_AUTHORIZATION = /\b(have|hold|possess) (\w+ ){0,3}(work|employment) authori[sz]ation/;
  // "…without sponsorship", but not "…without restriction? Do you require sponsorship?".
  const WITHOUT_SPONSOR = /\b(without|with no)\b(?:(?! (do|will|would|does|did) (you|your)\b).){0,60}\bsponsor/;
  // The employer saying it won't sponsor, next to a question about something else.
  const NO_SPONSOR_OFFERED =
    /\b(unable to|not able to|cannot|can t|can not|do not|don t|does not|doesn t|will not|won t|not) (offer|provide|sponsor)|sponsorship is not (available|offered|provided)|\bno sponsorship (is )?(available|offered|provided)/;
  // "I will not require sponsorship": a Yes here is a No to "Do you need sponsorship?".
  const SPONSOR_NEGATED =
    /\b(not|never|no longer|won t|don t|doesn t) (now or in the future |currently |ever |be )?(require|need|requiring|needing)\b.{0,50}\bsponsor|\bno (visa |work |employer |employment )*sponsorship\b.{0,20}\b(required|needed|necessary)/;

  function sponsorshipAnswer(p, label) {
    const { authorized, sponsorship } = p.questions;
    if (elsewhere(label, p)) return ASK;
    // "…authorized to work without sponsorship?" is a yes for someone who needs none.
    if (WITHOUT_SPONSOR.test(label)) {
      if (!authorized || !sponsorship) return '';
      return authorized === 'Yes' && sponsorship === 'No' ? 'Yes' : 'No';
    }
    // "Are you authorized to work here? (We do not sponsor visas.)" asks about
    // authorization; "Are you authorized, and will you need sponsorship?" asks two things.
    if (ASKS_AUTHORIZED.test(label)) return NO_SPONSOR_OFFERED.test(label) ? authorized : ASK;
    if (HAS_WORK_AUTHORIZATION.test(label) || SPONSOR_NEGATED.test(label)) return ASK;
    return sponsorship;
  }

  function authorizedAnswer(p, label) {
    if (elsewhere(label, p)) return ASK;
    // "Do you have any restrictions on your right to work?" turns the answer round.
    if (/restrict|limitation|expir/.test(label)) return ASK;
    return p.questions.authorized;
  }

  // "Worked for … before", where … is this employer: "us", "Acme", "this
  // company". Not a kind of employer ("a startup"), and not a tool ("with Python").
  const EMPLOYER = '(here\\b|(for|at|by)(?! (a|an|any|another|other|some|one|multiple|several)\\b)|with (us|our|this (company|organi[sz]ation|firm)|the (company|firm))\\b)';
  const WORKED_HERE = new RegExp(
    [
      `(previously|formerly) (worked|been employed|employed) ${EMPLOYER}`,
      `been (previously|formerly) (worked|employed) ${EMPLOYER}`,
      `(have|did|were) you (ever |previously )?(worked?|been employed|employed) ${EMPLOYER}`,
      'have you (ever )?been employed or (are|were) you (currently )?employed',
      'former (employee|worker|contractor|intern)\\b',
      'current or (former|previous|past) (employee|worker|contractor|intern|team member|associate)',
    ].join('|')
  );
  // The same words about somebody else, or about another employer.
  const NOT_THIS_EMPLOYER = /government|federal|military|public (official|sector|office)|auditor|audit firm|competitor|client|customer|vendor|supplier|relative|family|friend|spouse|household/;

  const NON_COMPETE_NEGATED = /\bnot (currently |presently )?(be )?(bound|subject|party|a party|restricted|under)\b|\bno (active |current |existing )?(non ?compete|restrictive covenant)|\bfree (of|from)\b/;

  function relocateAnswer(p, label) {
    // "Will you need relocation assistance?" is a different question.
    if (/assist|support|package|reimburs|expense|allowance|bonus|benefit|cost|stipend/.test(label)) return ASK;
    // "Do you live in Austin or are you willing to relocate?" is a yes either way.
    if (/\b(do you|are you|you) (currently |already )?(live|reside|located|based)\b|\b(currently|already) (live|living|reside|residing|located|based)\b|commut/.test(label)) return ASK;
    return p.questions.relocate;
  }

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

  // A section that lists jobs or schools, one entry each. Not every heading
  // that starts with "Employment": a form titled "Employment Application" is
  // not a list of jobs.
  const WORK = /^(work|employment|professional|job|career|relevant|prior|previous|past) (experience|history)\b|^(employment|experience|previous employment)$/;
  const EDU = /^education/;

  // Your name, phone and address don't belong in a field about somebody or
  // something else: a referee, an emergency contact, a past employer, a school.
  const OTHERS_SECTION = /\breferences?\b|\breferees?\b|emergency|next of kin|\breferr(al|er|ed)\b|recommend|guardian|\bparents?\b|spouse|dependent|beneficiar/;
  const NOT_YOURS =
    /\b(emergency|references?|referees?|referr(al|er|ed)|supervisor|manager|recruiter|guardian|parents?|spouse|partner|friend|relative|employer|company|school|university|college|next of kin|contact person|birth|born|alternate|alternative|secondary|additional|other|second|work|business|office|fax)\b/;

  // "Company address", "Employer phone", "School location": about the entry, but not its name.
  const ENTRY_DETAIL = /address|phone|city|state|zip|postal|country|location|website|url|e ?mail|contact|supervisor|manager|industry|reason|leaving|type/;

  // A link field names the site and, when it's a long question, says it wants a link.
  const LINK_WORD = /\b(url|link|profile|page|account|handle|username)\b/;
  // "How did you hear about us? (LinkedIn, …)", "Describe your experience with GitHub Actions".
  const NOT_A_LINK = /\b(experience|familiar|proficien|hear|heard|learn|find|found|source|recruit|refer|connect|follow|post|advert)/;

  const RESUME = /resume|\bcv\b|curriculum/;
  const OTHER_DOCUMENT = /cover letter|transcript|portfolio|writing sample|work sample|certificat|reference|recommendation|additional|supporting|\bother\b|photo|headshot|licen[sc]e/;

  /** Is this upload the résumé? The label says so, or, when it's just "Upload a file", the section or id does. */
  function wantsResume(f, label, idText) {
    if (RESUME.test(label)) return true;
    if (OTHER_DOCUMENT.test(label) || OTHER_DOCUMENT.test(idText)) return false;
    return RESUME.test(`${f.section || ''} | ${idText}`);
  }

  // Shared by the fields that hold your own details as free text.
  const MINE = { short: true, personal: true, text: true };

  // First match wins. Besides `label`, a rule may say:
  //   section   only inside a section whose heading matches
  //   type      only for this kind of control
  //   short     only for labels of at most six words, so that a long free-form
  //             question mentioning "city" or "email" isn't mistaken for the field
  //   long      a label of more than six words must also match this
  //   not       never for a label that matches this
  //   when      a function that decides instead of `label`
  //   personal  your own details: not inside a job, school or reference entry
  //   text      free text: never the answer to a radio, checkbox or Yes/No control
  //   choice    picks an option: never typed into a text box
  //   yesno     answers Yes or No: not for "What…", "Which…", "Please describe…"
  //   byChoices also recognised from the option text (see below)
  //   id        Workday's own field id for the question, however it is worded
  const RULES = [
    // ── Work experience ──────────────────────────────────────────────
    {
      section: WORK,
      label: /currently work|current (position|job|employer|role)|^current$/,
      not: /contact|reach out|reference|may we|can we/,
      get: fromEntry('work', (e) => Boolean(e.current)),
    },
    { section: WORK, label: /job title|position|^title$|^role$/, not: /descri|responsib|dut(y|ies)|summary|reason|leaving|salary|\bpay\b|type|level/, get: fromEntry('work', (e) => e.title) },
    { section: WORK, label: /company|employer|organi[sz]ation/, not: ENTRY_DETAIL, get: fromEntry('work', (e) => e.company) },
    { section: WORK, label: /location/, get: fromEntry('work', (e) => e.location) },
    { section: WORK, label: /^from|^start/, get: fromEntry('work', (e) => dateParts(e.startMonth, e.startYear)) },
    { section: WORK, label: /^to\b|^end/, get: fromEntry('work', (e) => (e.current ? IGNORE : dateParts(e.endMonth, e.endYear))) },
    { section: WORK, label: /description|responsibilit|summary/, get: fromEntry('work', (e) => e.description) },

    // ── Education ────────────────────────────────────────────────────
    { section: EDU, label: /school|university|college|institution/, not: ENTRY_DETAIL, get: fromEntry('education', (e) => e.school) },
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

    // ── Source, links, skills, résumé ────────────────────────────────
    // Ahead of the links: "How did you hear about us? (LinkedIn, Twitter, …)".
    {
      label: /\bhow (did )?you (first )?(hear|heard|learn|learned|find|found)( out)? (about|of)\b|where did you (first )?(hear|learn|find)|^source(?! code)\b|referral source/,
      get: (p) => p.questions.source,
    },
    { section: /^websites?/, label: /url|website|link/, get: (p, f, ctx) => AF.websiteList(p, ctx)[(f.index || 1) - 1] ?? IGNORE },
    { text: true, label: /linkedin/, long: LINK_WORD, not: NOT_A_LINK, get: (p) => p.links.linkedin },
    { text: true, label: /github/, long: LINK_WORD, not: NOT_A_LINK, get: (p) => p.links.github },
    { short: true, text: true, label: /^(personal |your )?(website|portfolio|blog)( url| link)?$/, get: (p) => p.links.portfolio || p.links.github || p.links.other },
    { short: true, text: true, label: /^other (website|url|link)s?( url)?$/, get: (p) => p.links.other },
    { text: true, label: /twitter|facebook|instagram/, long: LINK_WORD, not: NOT_A_LINK, get: () => IGNORE },
    { type: 'searchable', label: /skill/, get: (p) => (p.skills.length ? { multi: p.skills } : '') },
    { type: 'file', when: wantsResume, get: (p, f, ctx) => ctx.resume || '' },
    { type: 'file', label: /./, get: () => IGNORE },

    // Consent, terms and attestations are the applicant's to tick, whatever else they
    // mention ("I certify I am over 18"): listed as needing you, never ticked.
    { type: 'checkbox', label: /consent|i agree|agree to|acknowledg|terms|privacy|certify|attest|confirm that/, get: () => ASK },

    // ── Personal details ─────────────────────────────────────────────
    { short: true, text: true, label: /^current (company|employer|organi[sz]ation)( name)?$/, get: (p) => currentJob(p)?.company || '' },
    { short: true, text: true, label: /^current (job )?title$|^current (position|role)$/, get: (p) => currentJob(p)?.title || '' },
    {
      short: true,
      text: true,
      label: /^(current or |most recent |current or most recent )(most recent |previous |former |last )?(company|employer|organi[sz]ation)( name)?$/,
      get: (p) => (currentJob(p) || p.work[0])?.company || '',
    },
    {
      short: true,
      text: true,
      label: /^(current or |most recent |current or most recent )(most recent |previous |former |last )?((job )?title|position|role)$/,
      get: (p) => (currentJob(p) || p.work[0])?.title || '',
    },
    { short: true, label: /preferred|local|phonetic|prefix|suffix|^title$|middle|extension|^county$/, get: () => IGNORE },
    { ...MINE, label: /^first (and |or )?last name$|^name first (and )?last$/, get: (p) => fullName(p) },
    { ...MINE, label: /first name|given name/, get: (p) => p.personal.firstName },
    { ...MINE, label: /last name|family name|surname/, get: (p) => p.personal.lastName },
    {
      short: true,
      personal: true,
      label: /phone code|country code|dial(l?ing)? code|calling code/,
      get: (p, f) => (TYPED.has(f.type) ? dialCode(p) : p.personal.phoneCountryCode),
    },
    { short: true, personal: true, label: /device type|phone type/, get: (p) => p.personal.phoneType },
    // "Mobile" is a phone; "Mobile development experience" and "microphone" are not.
    { ...MINE, label: /\bphone\b|telephone|^(mobile|cell)( number| no)?$|\b(mobile|cell) (phone|number)\b|^contact (number|no)$/, get: (p, f, ctx) => phoneDigits(p, ctx) },
    { ...MINE, label: /\be ?mail\b/, get: (p) => p.personal.email },
    { ...MINE, label: /address line 2|^address 2$|apartment|suite|^unit/, get: (p) => p.personal.address2 || IGNORE },
    { ...MINE, label: /address line 1|^address 1$|street|^(home |mailing |current |residential )?address$/, get: (p) => p.personal.address1 },
    { short: true, personal: true, text: true, label: /^(current )?location( city)?$/, get: (p) => locationAnswer(p) },
    { ...MINE, label: /^city (and |or )?state$/, get: (p) => [p.personal.city, stateCode(p.personal.state) || p.personal.state].filter((x) => String(x).trim()).join(', ') },
    { ...MINE, label: /^city\b|^town\b/, get: (p) => p.personal.city },
    { ...MINE, label: /postal|\bzip\b|zipcode|post ?code/, get: (p) => p.personal.postalCode },
    {
      // "State", "State / Province", "State of residence": not "Statement of purpose" or "State your salary".
      short: true,
      personal: true,
      label: /^((us|u s|current|home|your) )?(state|province)( (or |and )?(state|province|region|territory|county))*( of residence| us only| if applicable)?$|^region$|^territory$/,
      get: (p) => stateAnswer(p.personal.state),
    },
    { short: true, personal: true, label: /^country( region| or region)?( of residence)?$/, get: (p) => countryAnswer(p.personal.country) },

    // ── Common screening questions ───────────────────────────────────
    // Ahead of the work-authorization rules: these mention "eligibility under U.S. law".
    {
      choice: true,
      label: /export control|\bitar\b|deemed export|\bu s person\b|protected individual|1324b/,
      get: (p, f, ctx, label) => usStatusAnswer(p, label),
    },
    { yesno: true, label: /sponsor/, get: (p, f, ctx, label) => sponsorshipAnswer(p, label) },
    // Only authorization *to work*: "an authorized dealer of T-Mobile" and "legally able to drive" are something else.
    {
      yesno: true,
      label: new RegExp(`${ASKS_AUTHORIZED.source}|(work|employment) authori[sz]ation`),
      get: (p, f, ctx, label) => authorizedAnswer(p, label),
    },
    { yesno: true, label: /(at least|over|older than) (the age of )?18|18 years (of age )?or older|legal age/, get: (p) => p.questions.over18 },
    { yesno: true, label: WORKED_HERE, not: NOT_THIS_EMPLOYER, id: /previous worker/, get: (p) => p.questions.previouslyEmployed },
    {
      yesno: true,
      label: /non ?compete|restrictive covenant|non ?solicit/,
      // "Confirm you are not bound by a non-compete" turns the answer round.
      get: (p, f, ctx, label) => (NON_COMPETE_NEGATED.test(label) ? ASK : p.questions.nonCompete),
    },
    { yesno: true, label: /relocat/, get: (p, f, ctx, label) => relocateAnswer(p, label) },
    // "Are you willing to work in-person for 12 weeks?", "Can you work on-site 3 days a week?"
    {
      yesno: true,
      label:
        /\b(willing|able|open|comfortable|available|agree|prepared|can you|could you|will you)\b.*\b(in person|on ?site|(in|at|to|from) (the |our |an |a )?(\w+ ){0,3}office)\b/,
      not: /accommodat|\bunable\b|\bnot able\b|cannot|can t\b|restriction|prevent|interview/,
      get: (p) => p.questions.inPerson,
    },

    // "Has your spouse or domestic partner ever served in the U.S. Military?",
    // "Are you the spouse of a veteran or active service member?"
    {
      yesno: true,
      label: SPOUSE_MILITARY,
      get: (p) => p.questions.spouseMilitary,
    },

    // ── Voluntary self-identification ────────────────────────────────
    // `byChoices`: also recognised from the option text, for groups whose only
    // label is "Please check one of the boxes below:". These are about your own
    // status: not a veteran's spouse, not an accommodation for a disability.
    {
      choice: true,
      label: /veteran/,
      not: /spouse|partner|family|dependent|child|relative|owned/,
      byChoices: true,
      get: (p, f, ctx, label) => veteranAnswer(p, label),
    },
    {
      choice: true,
      label: /disabilit/,
      not: /\baccommodat|\bessential (function|dut)|\bperform\b|\bable to\b|\binsurance\b|\bleave\b/,
      byChoices: true,
      get: (p) => DISABILITY[p.eeo.disability] || '',
    },
    { label: /hispanic|latino/, get: (p) => hispanicAnswer(p.eeo) },
    { label: /ethnic|\brace\b/, get: (p) => ethnicityAnswer(p.eeo) },
    { label: /gender|\bsex\b/, not: /transgender|pronoun|orientation/, get: (p) => GENDER[p.eeo.gender] || p.eeo.gender },
    { ...MINE, type: 'text', label: /^(full |your |legal |full legal )?name$/, get: (p) => fullName(p) },
    { short: true, type: 'date', label: /^(today s )?date( signed)?$/, get: () => today() },
  ];

  const TYPED = new Set(['text', 'textarea']);
  const TICKED = new Set(['radio', 'checkboxes', 'checkbox', 'yesno']);
  const fullName = (p) => `${p.personal.firstName} ${p.personal.lastName}`.trim();

  // "If yes, please explain": a follow-up to another question, never answered from the profile.
  const FOLLOW_UP = /^if (yes|no|so|not|other|applicable|none|you (answered|selected|responded|checked|said|indicated|chose))\b/;
  // Questions a Yes or No doesn't answer…
  const OPEN_QUESTION = /^(what|which|when|where|why|who|how (many|much|long|often|far|soon))\b|^(please )?(describe|explain|specify|list|elaborate|tell us)\b/;
  // …and, in a box you type into, ones that want more than that.
  const WANTS_DETAIL = /\b(describe|explain|specify|elaborate|details?)\b/;

  const splitId = (id) =>
    norm(String(id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2'));

  function ruleMatches(rule, f, label, idText) {
    if (rule.type && rule.type !== f.type) return false;
    if (rule.section && !rule.section.test(f.section || '')) return false;
    if (rule.text && TICKED.has(f.type)) return false;
    if (rule.choice && TYPED.has(f.type)) return false;
    if (rule.personal) {
      const section = f.section || '';
      if (WORK.test(section) || EDU.test(section) || OTHERS_SECTION.test(section) || NOT_YOURS.test(label || idText)) return false;
    }
    if (rule.when) return rule.when(f, label, idText);
    // Workday's own field id names a few standard questions however the tenant words them.
    if (rule.id && rule.id.test(idText)) return true;
    // No readable label: fall back to the field id.
    const text = label || idText;
    if (rule.not && rule.not.test(text)) return false;
    if (label) {
      const words = label.split(' ').length;
      if (rule.short && words > 6) return false;
      if (rule.long && words > 6 && !rule.long.test(label)) return false;
    }
    return rule.label.test(text);
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Your own answers apply where the question contains your text as whole words: "age" is not in "languages". */
  function customAnswer(profile, label) {
    if (!label) return undefined;
    for (const { question, answer } of profile.custom) {
      const q = norm(question);
      if (q && String(answer).trim() && new RegExp(`(^| )${escapeRe(q)}(s|es)?( |$)`).test(label)) return answer;
    }
    return undefined;
  }

  /** What a single checkbox can be given: ticked or not. */
  const ticks = (value) => typeof value === 'boolean' || (typeof value === 'string' && /^(yes|no|true|false|checked|unchecked)$/i.test(value.trim()));

  /**
   * @param field   { type, label, id, section, index, hint?, choices? } – `choices`: option texts of a radio/checkbox group
   * @param profile normalised profile
   * @param ctx     { resume, includeLinkedin, phoneCodeField } – page-level facts the rules need
   */
  AF.resolve = function resolve(field, profile, ctx = {}) {
    const label = norm(field.label);
    const idText = splitId(field.id || '');

    // Your own answers go by the question as asked; the built-in rules may go by
    // what the site says the field is (Ashby's `hint`), since employers reword those.
    let value = field.type === 'file' ? undefined : customAnswer(profile, label);
    if (value === undefined) {
      const ruleLabel = field.hint ? norm(field.hint) : label;
      if (FOLLOW_UP.test(ruleLabel)) return null;
      const choices = norm((field.choices || []).join(' | '));
      const rule =
        RULES.find((r) => ruleMatches(r, field, ruleLabel, idText)) ||
        (choices && RULES.find((r) => r.byChoices && ruleMatches(r, field, choices, idText)));
      if (!rule) return null;
      if (rule.yesno && (OPEN_QUESTION.test(ruleLabel) || (TYPED.has(field.type) && WANTS_DETAIL.test(ruleLabel)))) return null;
      value = rule.get(profile, field, ctx, ruleLabel);
    }
    if (value === ASK) return null;
    if (value === IGNORE) return { ignore: true };
    if (value === EXTRA) return { extra: true };
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return { empty: true };
    // A lone checkbox can only be ticked or left: an option list or a name is not an answer to it.
    if (field.type === 'checkbox' && !ticks(value)) return null;
    return { value };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = AF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
