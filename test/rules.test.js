// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

require('../extension/src/match.js');
const AF = require('../extension/src/rules.js');

// profile.js needs a browser storage API to load; only its pure helpers are used here.
globalThis.browser = { storage: { local: {} } };
require('../extension/src/profile.js');

function profile(overrides = {}) {
  const p = AF.normalizeProfile({
    personal: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+1 (555) 010-2345',
      address1: '1 Analytical Way', city: 'Oakland', state: 'ca', postalCode: '94607', country: 'USA',
    },
    links: { linkedin: 'https://linkedin.com/in/ada', github: 'https://github.com/ada', portfolio: 'https://ada.dev' },
    work: [
      { title: 'Engineer', company: 'Engines Ltd', current: true, startMonth: '3', startYear: '2022' },
      { title: 'Intern', company: 'Looms Inc', startMonth: '6', startYear: '2020', endMonth: '9', endYear: '2020' },
    ],
    education: [{ school: 'Cal', degree: 'Bachelor of Science', field: 'Mathematics', startYear: '2016', endYear: '2020' }],
    skills: ['Python', 'SQL'],
    questions: { source: 'LinkedIn', authorized: 'Yes', sponsorship: 'No', over18: 'Yes', previouslyEmployed: 'No' },
    eeo: { gender: 'Female', ethnicity: 'Asian', veteran: 'Not a veteran', disability: 'Decline' },
    custom: [{ question: 'salary expectations', answer: '150000' }],
  });
  return Object.assign(p, overrides);
}

const field = (label, extra = {}) => ({ type: 'text', id: '', section: 'my information', index: null, label, ...extra });
const value = (f, p = profile(), ctx = {}) => (AF.resolve(f, p, ctx) || {}).value;

test('norm strips case, accents and punctuation', () => {
  assert.equal(AF.norm('  Résumé/CV*  '), 'resume cv');
  assert.equal(AF.norm("I don't wish to answer"), 'i don t wish to answer');
});

test('bestOption: yes/no pick the option that starts with the word', () => {
  const options = ['Select One', 'Not applicable', 'No, I do not require sponsorship', 'Yes, I require sponsorship'];
  assert.equal(AF.bestOption(options, 'No'), 2);
  assert.equal(AF.bestOption(options, 'Yes'), 3);
});

test('bestOption: prefers the closest option, not any that contains the words', () => {
  const options = [
    'Asian (Not Hispanic or Latino) (United States of America)',
    'Hispanic or Latino (United States of America)',
    'White (Not Hispanic or Latino) (United States of America)',
  ];
  assert.equal(AF.bestOption(options, 'Asian'), 0);
  assert.equal(AF.bestOption(options, 'Hispanic or Latino'), 1);
  assert.equal(AF.bestOption(['Male', 'Female'], 'Male'), 0);
  assert.equal(AF.bestOption(['United States Minor Outlying Islands', 'United States of America'], 'United States'), 1);
  assert.equal(AF.bestOption(['Red', 'Green'], 'Blue'), -1);
});

test('race lists that fold in Hispanic ("Asian (Not Hispanic or Latino) (United States of America)")', () => {
  const options = [
    'Select One',
    'American Indian or Alaska Native (Not Hispanic or Latino) (United States of America)',
    'Asian (Not Hispanic or Latino) (United States of America)',
    'Black or African American (Not Hispanic or Latino) (United States of America)',
    'Hispanic or Latino (United States of America)',
    'Two or More Races (Not Hispanic or Latino) (United States of America)',
    'White (Not Hispanic or Latino) (United States of America)',
  ];
  const race = (eeo) => value(field('Race/Ethnicity', { type: 'native' }), profile({ eeo }));
  for (const [ethnicity, i] of [['American Indian or Alaska Native', 1], ['Asian', 2], ['Black or African American', 3], ['Hispanic or Latino', 4], ['Two or More Races', 5], ['White', 6]]) {
    assert.equal(AF.bestOption(options, race({ ethnicity, hispanic: 'No' })), i, ethnicity);
  }
  // Hispanic takes precedence over race when the list offers it…
  assert.equal(AF.bestOption(options, race({ ethnicity: 'White', hispanic: 'Yes' })), 4);
  assert.equal(AF.bestOption(options, race({ ethnicity: '', hispanic: 'Yes' })), 4);
  // …and a race-only list still gets the race.
  assert.equal(AF.bestOption(['Asian', 'Black or African American', 'White'], race({ ethnicity: 'White', hispanic: 'Yes' })), 2);
  assert.equal(AF.bestOption(['Asian', 'White', 'I do not wish to answer'], race({ ethnicity: 'Decline', hispanic: 'Yes' })), 2);
});

test('bestOption: earlier candidates win; decline matches the usual phrasings', () => {
  assert.equal(AF.bestOption(['CA', 'California'], ['California', 'CA']), 1);
  for (const phrase of ['I do not wish to answer', 'Decline to Self-Identify', "I don't wish to answer", 'Prefer not to say']) {
    assert.equal(AF.bestOption(['Yes', phrase], 'Decline'), 1, phrase);
  }
});

test('personal fields map from the profile', () => {
  assert.equal(value(field('First Name*')), 'Ada');
  assert.equal(value(field('Last Name')), 'Lovelace');
  assert.equal(value(field('Email Address')), 'ada@example.com');
  assert.equal(value(field('Phone Number')), '5550102345', 'US country prefix dropped');
  assert.equal(value(field('Postal Code')), '94607');
  assert.deepEqual(value(field('State', { type: 'dropdown' })), ['California', 'CA']);
  assert.deepEqual(value(field('Country', { type: 'dropdown' })), ['United States of America', 'United States']);
  assert.equal(value(field('Country Phone Code', { type: 'searchable' })), 'United States of America (+1)');
  assert.equal(value(field('Phone Device Type', { type: 'dropdown' })), 'Mobile');
});

test('fields that should be left alone are ignored, not reported', () => {
  for (const label of ['Middle Name', 'Preferred First Name', 'Phone Extension', 'Address Line 2']) {
    assert.deepEqual(AF.resolve(field(label), profile()), { ignore: true }, label);
  }
});

test('falls back to the Workday field id when there is no label', () => {
  assert.equal(value(field('', { id: 'legalName--firstName' })), 'Ada');
  assert.equal(value(field('', { id: 'addressSection_addressLine1' })), '1 Analytical Way');
});

test('a long question that mentions a personal word is not treated as that field', () => {
  assert.equal(AF.resolve(field('May we contact your current employer by email before making an offer?'), profile()), null);
});

test('work experience entries map by index', () => {
  const at = (label, index, type = 'text') => value(field(label, { section: 'work experience', index, type }));
  assert.equal(at('Job Title', 1), 'Engineer');
  assert.equal(at('Company', 2), 'Looms Inc');
  assert.equal(at('I currently work here', 1, 'checkbox'), true);
  assert.equal(at('I currently work here', 2, 'checkbox'), false);
  assert.deepEqual(at('From', 2, 'date'), { month: 6, day: null, year: 2020 });
  assert.deepEqual(at('To', 2, 'date'), { month: 9, day: null, year: 2020 });
  const f = field('To', { section: 'work experience', index: 1, type: 'date' });
  assert.deepEqual(AF.resolve(f, profile()), { ignore: true }, 'no end date for a current job');
  const third = field('Job Title', { section: 'work experience', index: 3 });
  assert.deepEqual(AF.resolve(third, profile()), { extra: true }, 'entry beyond the profile is flagged');
  assert.deepEqual(AF.resolve(third, profile({ work: [] })), { ignore: true }, 'no jobs saved: nothing to compare against');
});

test('education entries', () => {
  const at = (label, type = 'text') => value(field(label, { section: 'education', index: 1, type }));
  assert.equal(at('School or University', 'searchable'), 'Cal');
  const degree = at('Degree', 'dropdown');
  assert.equal(degree[0], 'Bachelor of Science');
  assert.ok(degree.includes("Bachelor's Degree"));

  // Lists that abbreviate ("BA / BS / MS"), or spell out what the profile abbreviates.
  const degreeOf = (d) => value(field('Degree', { section: 'education', index: 1, type: 'dropdown' }), profile({ education: [{ degree: d }] }));
  const abbreviated = ['High School', 'AA', 'BA', 'BS', 'MBA', 'MS', 'PhD'];
  for (const [d, want] of [['Bachelor of Science', 'BS'], ['B.S.', 'BS'], ['BSc', 'BS'], ['Bachelor of Science in Computer Science', 'BS'], ['Bachelor of Arts', 'BA'], ['Master of Science', 'MS'], ['M.B.A.', 'MBA'], ['Ph.D.', 'PhD']]) {
    assert.equal(abbreviated[AF.bestOption(abbreviated, degreeOf(d))], want, d);
  }
  assert.equal(AF.bestOption(['B.A.', 'B.S.', 'M.S.'], degreeOf('Bachelor of Science')), 1);
  assert.equal(AF.bestOption(['BSN', 'BS'], degreeOf('B.S.')), 1, 'BSN is a different degree');
  assert.equal(AF.bestOption(['Associate of Arts', 'Bachelor of Science', 'Master of Science'], degreeOf('B.S.')), 1);
  assert.equal(AF.bestOption(['Bachelor of Arts', 'Master of Arts'], degreeOf('MS')), -1);
  assert.equal(at('Field of Study', 'searchable'), 'Mathematics');
  assert.deepEqual(at('To (Actual or Expected)', 'date'), { month: null, day: null, year: 2020 });
});

test('websites: LinkedIn joins the list only when the page has no LinkedIn field', () => {
  const site = (index, ctx) => AF.resolve(field('URL', { section: 'websites', index }), profile(), ctx);
  assert.equal(site(1, { includeLinkedin: false }).value, 'https://ada.dev');
  assert.equal(site(2, { includeLinkedin: false }).value, 'https://github.com/ada');
  assert.deepEqual(site(3, { includeLinkedin: false }), { ignore: true });
  assert.equal(site(3, { includeLinkedin: true }).value, 'https://linkedin.com/in/ada');
  assert.equal(value(field('LinkedIn', { section: 'social network urls' })), 'https://linkedin.com/in/ada');
});

test('skills and résumé', () => {
  assert.deepEqual(value(field('Type to Add Skills', { type: 'searchable', section: 'skills' })), { multi: ['Python', 'SQL'] });
  const resume = { name: 'cv.pdf' };
  const upload = field('Upload a file', { type: 'file', section: 'resume cv' });
  assert.equal(value(upload, profile(), { resume }), resume);
  assert.deepEqual(AF.resolve(upload, profile(), {}), { empty: true });
  const cover = field('Upload a file', { type: 'file', section: 'cover letter' });
  assert.deepEqual(AF.resolve(cover, profile(), { resume }), { ignore: true });
});

test('screening questions', () => {
  const q = (label) => value(field(label, { type: 'dropdown', section: 'application questions' }));
  assert.equal(q('Are you legally authorized to work in the United States?'), 'Yes');
  assert.equal(q('Will you now or in the future require sponsorship for employment visa status?'), 'No');
  assert.equal(q('Are you authorized to work in the US without the need for sponsorship?'), 'Yes');
  assert.equal(q('Are you at least 18 years of age?'), 'Yes');
  assert.equal(q('Have you previously worked for Acme as an employee or contractor?'), 'No');
  assert.equal(q('Have you been previously employed with us?'), 'No');
  assert.equal(q('Were you previously employed by Acme?'), 'No');
  // Workday's standard question is known by its id whatever the tenant calls it.
  assert.equal(value(field('Are you a returning team member?', { type: 'radio', id: 'candidateIsPreviousWorker' })), 'No');
  // "authorized dealer" is not work authorization.
  assert.equal(q('Have you been employed or are you currently employed with an authorized dealer of T-Mobile or Metro by T-Mobile?'), 'No');
  assert.equal(q('Have you been employed or are you currently employed as a contractor for T-Mobile?'), 'No');
  assert.equal(q('Do you have work authorization in the United States?'), 'Yes');
  assert.equal(AF.resolve(field('Are you an authorized reseller?', { type: 'dropdown' }), profile()), null);
  assert.equal(q('How Did You Hear About Us?'), 'LinkedIn');
  assert.equal(q('What are your salary expectations?'), '150000', 'custom answer');
  assert.equal(AF.resolve(field('Describe a hard bug you fixed.', { type: 'textarea' }), profile()), null);
});

test('in-person and export-control questions', () => {
  const p = profile();
  p.questions.inPerson = 'Yes';
  p.questions.usStatus = 'Citizen';
  p.questions.relocate = 'No';
  const q = (label, pr = p) => value(field(label, { type: 'select', section: 'apply for this job' }), pr);

  assert.equal(q('Are you willing to work in-person for 12 weeks during the internship?'), 'Yes');
  assert.equal(q('Can you work on-site in San Francisco 3 days a week?'), 'Yes');
  assert.equal(q('Are you able to commute to our office in Austin?'), 'Yes');
  assert.equal(q('Are you able to work from our San Francisco office three days a week?'), 'Yes');
  assert.equal(q('Which office would you prefer?'), undefined);
  assert.equal(q('Are you willing to relocate or work on-site?'), 'No', 'relocation asks first');

  const exportLabel =
    'EXPORT CONTROLS - This position requires access to information and technology that is subject to U.S. export controls. Your responses to the questions below will be used solely to determine your eligibility under U.S. law to receive information and materials subject to U.S. export controls.';
  const statuses = [
    'A United States citizen or national',
    'A lawful permanent resident of the United States (green card holder)',
    'A refugee or asylee admitted to the United States',
    'None of the above',
  ];
  assert.equal(AF.bestOption(statuses, q(exportLabel)), 0);
  for (const [status, want] of [['Permanent resident', 1], ['Refugee or asylee', 2], ['None', 3]]) {
    const other = profile();
    other.questions.usStatus = status;
    assert.equal(AF.bestOption(statuses, q(exportLabel, other)), want, status);
  }
  // Negated options are not the status they name.
  const negated = ['No, I am not a U.S. citizen or national', 'Yes, I am a U.S. citizen or national'];
  assert.equal(AF.bestOption(negated, q('Are you a U.S. person for export control purposes?')), 1);

  // The "protected individual" follow-up, asked as Yes/No.
  const protectedLabel = 'Are you any of the following "protected individual(s)" as defined in the Immigration and Naturalization Act, 8 U.S.C. 1324b(a)(3)?';
  assert.equal(AF.bestOption(['Yes', 'No'], q(protectedLabel)), 0);
  const none = profile();
  none.questions.usStatus = 'None';
  assert.equal(AF.bestOption(['Yes', 'No'], q(protectedLabel, none)), 1);
  assert.equal(AF.bestOption(['I am a U.S. person', 'I am not a U.S. person'], q(exportLabel, none)), 1);

  // Left for you when the profile has no answer.
  assert.deepEqual(AF.resolve(field(exportLabel, { type: 'select' }), profile()), { empty: true });
  assert.deepEqual(AF.resolve(field('Are you willing to work in-person?', { type: 'select' }), profile()), { empty: true });
});

test('an unanswered profile question is reported as empty, not guessed', () => {
  const p = profile();
  p.questions.relocate = '';
  assert.deepEqual(AF.resolve(field('Are you willing to relocate?', { type: 'dropdown' }), p), { empty: true });
});

test('self-identification answers resolve to option matchers', () => {
  const q = (label, type = 'dropdown') => value(field(label, { type, section: 'voluntary disclosures' }));
  const veteranOptions = [
    'I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERAN LISTED ABOVE',
    'I IDENTIFY AS A VETERAN, JUST NOT A PROTECTED VETERAN',
    'I AM NOT A VETERAN',
    'I DO NOT WISH TO SELF-IDENTIFY',
  ];
  assert.equal(AF.bestOption(veteranOptions, q('Veteran Status')), 2);
  const p = profile();
  p.eeo.veteran = 'Veteran, not protected';
  assert.equal(AF.bestOption(veteranOptions, value(field('Veteran Status', { type: 'dropdown' }), p)), 1);

  const disabilityOptions = [
    'Yes, I have a disability, or have had one in the past',
    'No, I do not have a disability and have not had one in the past',
    'I do not want to answer',
  ];
  assert.equal(AF.bestOption(disabilityOptions, q('Please check one of the boxes below: Disability', 'checkboxes')), 2);
  // Some tenants label the group only "Please check one of the boxes below:"; the options say what it is.
  const unlabelled = field('Please check one of the boxes below:', { type: 'checkboxes', section: 'self identify', choices: disabilityOptions });
  assert.equal(AF.bestOption(disabilityOptions, value(unlabelled)), 2);
  const p2 = profile();
  p2.eeo.disability = 'No';
  assert.equal(AF.bestOption(disabilityOptions, value(unlabelled, p2)), 1);
  assert.equal(AF.resolve(field('Please check one of the boxes below:', { type: 'checkboxes', choices: ['Red', 'Blue'] }), profile()), null);
  assert.equal(AF.bestOption(['Male', 'Female', 'I do not wish to answer'], q('Gender')), 1);
  assert.equal(q('Please select your ethnicity'), 'Asian');
  assert.equal(value(field('Name', { section: 'self identify' })), 'Ada Lovelace');
  const date = value(field('Date', { type: 'date', section: 'self identify' }));
  assert.equal(date.year, new Date().getFullYear());
});

test('greenhouse labels', () => {
  const gh = (label, extra = {}) => value(field(label, { section: 'application', ...extra }));
  const location = gh('Location (City)', { type: 'select' });
  assert.deepEqual(location.filter((c) => typeof c === 'string'), ['Oakland, California, United States', 'Oakland, California', 'Oakland, CA']);
  assert.equal(gh('Website'), 'https://ada.dev');
  assert.equal(gh('LinkedIn Profile'), 'https://linkedin.com/in/ada');
  assert.deepEqual(AF.resolve(field('Preferred First Name'), profile()), { ignore: true });
  assert.equal(gh('How did you hear about this job?'), 'LinkedIn');
  assert.equal(gh('Do you require visa sponsorship?', { type: 'select' }), 'No');

  // Education: one select per degree / discipline, and month + year boxes for dates.
  const edu = (label, type = 'select') => value(field(label, { section: 'education', index: 1, type }));
  assert.equal(edu('School'), 'Cal');
  assert.equal(edu('Discipline'), 'Mathematics');
  assert.deepEqual(edu('Start date year', 'text'), { month: null, day: null, year: 2016 });
  assert.deepEqual(edu('End date month'), { month: null, day: null, year: 2020 });
  const degrees = ["Associate's Degree", "Bachelor's Degree", 'Master of Business Administration (M.B.A.)', "Master's Degree", 'Doctor of Philosophy (Ph.D.)'];
  assert.equal(AF.bestOption(degrees, edu('Degree')), 1);
  const mba = profile({ education: [{ school: 'X', degree: 'MBA' }] });
  assert.equal(AF.bestOption(degrees, value(field('Degree', { section: 'education', index: 1, type: 'select' }), mba)), 2);
  const ms = profile({ education: [{ school: 'X', degree: 'M.S. Computer Science' }] });
  assert.equal(AF.bestOption(degrees, value(field('Degree', { section: 'education', index: 1, type: 'select' }), ms)), 3);

  // Lists that just say "Bachelors" / "Masters" still match, but a different named degree doesn't.
  const degreeOf = (degree) => value(field('Degree', { section: 'education', index: 1, type: 'select' }), profile({ education: [{ school: 'X', degree }] }));
  const bs = degreeOf('Bachelor of Science');
  assert.equal(AF.bestOption(['High School', 'Bachelors', 'Masters', 'PhD'], bs), 1);
  assert.equal(AF.bestOption(['Associates Degree', 'Bachelors Degree', 'Masters Degree'], bs), 1);
  assert.equal(AF.bestOption(['High School', 'Bachelors (BA, BS)', 'Masters (MA, MS)'], bs), 1);
  assert.equal(AF.bestOption(['Bachelor', 'Master'], bs), 0);
  assert.equal(AF.bestOption(['Bachelor’s', 'Master’s'], bs), 0);
  assert.equal(AF.bestOption(['Bachelor of Arts', 'Master of Arts'], bs), -1);
  assert.equal(AF.bestOption(['Bachelors', 'Masters', 'MBA'], degreeOf('M.S. Computer Science')), 1);
  assert.equal(AF.bestOption(['Bachelors', 'Master of Business Administration'], degreeOf('M.S.')), -1);
  assert.equal(AF.bestOption(['Associates', 'Bachelors'], degreeOf('A.A.')), 0);

  // Greenhouse's phone country list reads "United States +1".
  assert.equal(AF.bestOption(['United States Minor Outlying Islands +1', 'United States +1', 'Canada +1'], gh('Country', { type: 'select' })), 1);
  // The profile's default spelling must find it too.
  const phoneCountries = ['United States Minor Outlying Islands +1', 'United States +1', 'United Kingdom +44', 'Canada +1'];
  for (const country of ['United States of America', 'U.S.A.', 'U.S.', 'united states']) {
    const want = value(field('Country', { type: 'select' }), profile({ personal: { country } }));
    assert.equal(AF.bestOption(phoneCountries, want), 1, country);
  }
  const race = ['American Indian or Alaska Native', "I don't wish to answer", 'Asian', 'White'];
  assert.equal(AF.bestOption(race, gh('Race and Ethnicity', { type: 'select' })), 2);
  assert.equal(AF.bestOption(['Man', 'Woman', 'Non-binary or third gender', "I don't wish to answer"], gh('Gender Identity (optional)', { type: 'select' })), 1);
  assert.equal(
    AF.bestOption(['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', "I don't wish to answer"], gh('Disability Status', { type: 'select' })),
    2
  );
});

test('ashby labels', () => {
  const ab = (label, extra = {}) => value(field(label, { section: 'basic info', ...extra }));
  assert.equal(ab('Name'), 'Ada Lovelace');
  assert.equal(ab('Email', { type: 'text' }), 'ada@example.com');
  assert.equal(ab('LinkedIn Profile'), 'https://linkedin.com/in/ada');
  // An employer-worded built-in question is matched by what the field is.
  const where = field('Which country do you intend to work from?', { type: 'combobox', hint: 'Location' });
  assert.equal(AF.bestOption(['Oakland, Maryland, United States', 'Oakland, California, United States'], value(where)), 1);
  assert.equal(AF.resolve(field('Which country do you intend to work from?', { type: 'combobox' }), profile()), null);
  // …but your own answers still go by the question as asked.
  const p = profile({ custom: [{ question: 'intend to work from', answer: 'Canada' }] });
  assert.equal(value(where, p), 'Canada');
  assert.equal(ab('Will you now or in the future require sponsorship to work in the US?', { type: 'yesno' }), 'No');
  const race = ['Asian or Asian American', 'Black or African American', 'Hispanic or Latino', 'White'];
  assert.equal(AF.bestOption(race, ab('Which ethnicity(ies) do you identify with? Please select all that apply.', { type: 'checkboxes', section: 'diversity survey' })), 0);
  assert.equal(AF.bestOption(['Man', 'Woman', 'Non-binary', 'I prefer not to say'], ab('What is your gender identity?', { type: 'radio' })), 1);
});

test('lever labels', () => {
  const lv = (label, extra = {}) => value(field(label, { section: 'submit your application', ...extra }));
  assert.equal(lv('Full name'), 'Ada Lovelace');
  assert.equal(lv('Phone'), '5550102345');
  assert.equal(lv('Current company'), 'Engines Ltd', 'the job marked current');
  assert.deepEqual(AF.resolve(field('Current company'), profile({ work: [] })), { empty: true });
  assert.equal(lv('LinkedIn URL'), 'https://linkedin.com/in/ada');
  assert.equal(lv('GitHub URL'), 'https://github.com/ada');
  assert.equal(lv('Portfolio URL'), 'https://ada.dev');
  assert.deepEqual(AF.resolve(field('Twitter URL'), profile()), { ignore: true });
  // Lever's location search lists "Oakland, CA, USA".
  const places = ['Oakland, MI, USA', 'Oakland, CA, USA', 'Oakland, NJ, USA'];
  assert.equal(AF.bestOption(places, lv('Current location', { type: 'location' })), 1);
  const full = profile();
  full.personal.state = 'California';
  assert.equal(AF.bestOption(places, value(field('Current location', { type: 'location' }), full)), 1, 'state saved in full');
  assert.equal(
    lv('Which university are you currently attending or did you last attend? Please select "Other (School Not Listed)" if your school is not listed.', { type: 'native', section: 'university' }),
    'Cal'
  );
  assert.equal(lv('Please tell us how you heard about this opportunity.', { type: 'native' }), 'LinkedIn');
  assert.equal(lv('How did you find out about us?', { type: 'native' }), 'LinkedIn');
});

test('consent and terms checkboxes are left for you, whatever they mention', () => {
  for (const label of [
    'Palantir Technologies has my consent to contact me about future job opportunities.',
    'I agree to the privacy policy',
    'I acknowledge that I have read the terms',
    'I certify that the information above is true',
    'I certify that I am at least 18 years of age',
  ]) {
    assert.equal(AF.resolve(field(label, { type: 'checkbox' }), profile()), null, label);
  }
  // A checkbox that is a real question is still answered.
  assert.equal(value(field('I currently work here', { type: 'checkbox', section: 'work experience', index: 1 })), true);
});

// ── Things that must not be filled ───────────────────────────────────
// Each of these was once answered wrongly from the profile. `asks` means the
// question is left for you and listed as needing an answer.

const everything = () => {
  const p = profile();
  Object.assign(p.questions, { relocate: 'Yes', inPerson: 'Yes', nonCompete: 'No', usStatus: 'Citizen' });
  Object.assign(p.eeo, { hispanic: 'No', veteran: 'Protected veteran', disability: 'No' });
  return p;
};
const asks = (label, extra = {}, p = everything()) => assert.equal(AF.resolve(field(label, extra), p, { resume: { name: 'cv.pdf' } }), null, label);
const YES_NO = ['Yes', 'No'];
const picked = (options, label, extra = {}, p = everything()) => {
  const i = AF.bestOption(options, value(field(label, { type: 'native', ...extra }), p));
  return i < 0 ? null : options[i];
};

test('bestOption does not guess between options that match equally', () => {
  // Several kinds of Yes: which one is yours to say.
  assert.equal(AF.bestOption(['Yes, I am authorized to work for any employer', 'Yes, but I require sponsorship', 'No'], 'Yes'), -1);
  assert.equal(AF.bestOption(['No', 'Yes, now', 'Yes, in the future'], 'Yes'), -1);
  assert.equal(AF.bestOption(['No', 'Yes, now', 'Yes, in the future'], 'No'), 0);
  assert.equal(AF.bestOption(['Yes', 'Yes, with restrictions', 'No'], 'Yes'), 0, 'an exact Yes is not a guess');
  // Options that only contain the answer.
  assert.equal(AF.bestOption(['East Asian', 'South Asian', 'Southeast Asian', 'White'], 'Asian'), -1);
  assert.equal(AF.bestOption(['East Asian', 'White'], 'Asian'), 0, 'the only one that mentions it');
  // An option that negates the answer is not the answer.
  assert.equal(AF.bestOption(['Caucasian / White', 'Non-White', 'Decline'], 'White'), 0);
  assert.equal(AF.bestOption(['Non-White', 'Decline'], 'White'), -1);
  assert.equal(AF.bestOption(['Not Hispanic or Latino', 'Decline'], 'Hispanic or Latino'), -1);
  // Shortest still wins where the options start with the answer.
  assert.equal(AF.bestOption(['United States Minor Outlying Islands', 'United States of America'], 'United States'), 1);
});

test('your details are not put in fields about someone or something else', () => {
  for (const [label, section] of [
    ['Name', 'references'], ['Phone', 'references'], ['Email', 'emergency contact'], ['First Name', 'reference 1'],
    ['City', 'education'], ['State', 'employment history'], ['Phone', 'employment history'], ['Address', 'work experience'],
    ['Zip code', 'previous employment'], ['Country', 'education history'],
  ]) asks(label, { section });
  for (const label of [
    'Emergency contact phone number', 'Reference first name', 'Supervisor email', 'Referrer email address', 'Manager last name',
    'Company phone', 'Work email', 'Alternate phone', 'City of birth', 'Spouse first name',
  ]) asks(label);
  // About the job or school, but not its name.
  for (const label of ['Employer phone', 'Company address', 'Company city', 'Reason for leaving company', 'May we contact this employer?']) {
    asks(label, { section: 'employment history' });
  }
  asks('May we contact your current employer?', { section: 'work experience', type: 'radio' });
  asks('School location', { section: 'education' });
  assert.equal(value(field('Position description', { section: 'work experience', index: 1, type: 'textarea' }), profile({ work: [{ title: 'Engineer', description: 'Built it.' }] })), 'Built it.');
  // The ordinary fields still fill, under the usual headings.
  for (const section of ['my information', 'contact information', 'personal information', 'application', 'employment application']) {
    assert.equal(value(field('First name', { section })), 'Ada', section);
    assert.equal(value(field('Phone', { section })), '5550102345', section);
  }
});

test('a heading that merely starts with "Employment" is not a list of jobs', () => {
  for (const section of ['employment application', 'employment eligibility', 'employment questions', 'employment information']) {
    asks('Position applying for', { section });
    asks('Start date', { section, type: 'date' });
    asks('Do you currently work for Acme?', { section, type: 'radio' });
  }
  for (const section of ['work experience', 'employment', 'employment history', 'work history', 'professional experience', 'experience']) {
    assert.equal(value(field('Company', { section, index: 1 })), 'Engines Ltd', section);
  }
});

test('labels that only look like a personal field', () => {
  for (const label of [
    'Statement of purpose', 'State your desired salary', 'State license number', 'State the reason for leaving',
    'Mobile development experience', 'Sales territory experience', 'Source code sample link', 'Country of citizenship',
  ]) asks(label);
  asks('Statement of purpose', { type: 'textarea' });
  for (const [label, want] of [
    ['State', ['California', 'CA']], ['State / Province', ['California', 'CA']], ['State of residence', ['California', 'CA']], ['Province', ['California', 'CA']],
    ['E-mail Address', 'ada@example.com'], ['Mobile', '5550102345'], ['Cell phone number', '5550102345'], ['Telephone', '5550102345'],
    ['First and last name', 'Ada Lovelace'], ['Legal name', 'Ada Lovelace'], ['City, State', 'Oakland, CA'], ['Zip', '94607'],
    ['Home address', '1 Analytical Way'], ['Current or previous employer', 'Engines Ltd'], ['Most recent job title', 'Engineer'],
  ]) assert.deepEqual(value(field(label)), want, label);
  assert.deepEqual(value(field('Country of residence', { type: 'native' })), ['United States of America', 'United States']);
  // The code on its own where it's typed, as the list words it where it's chosen.
  assert.equal(value(field('Country code')), '+1');
  assert.equal(value(field('Country Phone Code', { type: 'searchable' })), 'United States of America (+1)');
  // A state saved by its full name still finds "CA" in a list of codes.
  const full = profile();
  full.personal.state = 'California';
  assert.equal(AF.bestOption(['AL', 'CA', 'CO'], value(field('State', { type: 'native' }), full)), 1);
});

test('text is never the answer to a tick box, nor an option list to a text box', () => {
  for (const [label, type] of [
    ['Email me job alerts', 'checkbox'], ['Text my phone with updates', 'checkbox'], ['Do you own a microphone?', 'radio'],
    ['May we contact you by phone?', 'radio'], ['Do you have a LinkedIn profile?', 'yesno'], ['Best way to reach you: phone', 'checkboxes'],
    ['I am a veteran', 'checkbox'], ['Veteran status', 'text'], ['Disability', 'textarea'], ['Are you a U.S. person?', 'text'],
  ]) asks(label, { type });
  // A checkbox that is a Yes/No question is still answered.
  assert.equal(value(field('I am legally authorized to work in the United States', { type: 'checkbox' })), 'Yes');
});

test('links are only filled into link fields', () => {
  assert.equal(picked(['LinkedIn', 'Indeed', 'Referral'], 'How did you hear about us? (LinkedIn, Indeed, referral)'), 'LinkedIn');
  assert.equal(value(field('How did you hear about this role (Twitter, Facebook, other)?')), 'LinkedIn');
  for (const label of [
    'Describe your experience with GitHub Actions', 'Are you connected with anyone at Acme on LinkedIn? If so, who?',
    'Were you contacted by a recruiter on LinkedIn about this particular role?', 'How many years of experience do you have running Facebook ad campaigns?',
  ]) asks(label, { type: 'textarea' });
  assert.equal(value(field('Please share a link to your LinkedIn profile so we can learn more')), undefined, 'mentions learning: left for you');
  assert.equal(value(field('Please provide the URL of your LinkedIn profile if you have one')), 'https://linkedin.com/in/ada');
  assert.equal(value(field('GitHub username or profile link')), 'https://github.com/ada');
});

test('sponsorship and authorization: only the question that was saved', () => {
  const q = (label, p) => picked(YES_NO, label, {}, p);
  // "Without sponsorship", however it is put.
  for (const label of [
    'Can you work in the US without any sponsorship?',
    'Are you able to work without the need for current or future sponsorship?',
    'Are you authorized to work in the United States with no sponsorship required?',
    'Are you authorized to work lawfully in the U.S. for Acme without requiring visa sponsorship?',
  ]) assert.equal(q(label), 'Yes', label);
  // The employer saying it won't sponsor is not the question.
  assert.equal(q('Are you legally authorized to work in the US? (We are unable to sponsor visas)'), 'Yes');
  assert.equal(q('Are you authorized to work in the United States? Acme does not sponsor work visas.'), 'Yes');
  assert.equal(q('Will you now or in the future require sponsorship for work authorization?'), 'No');
  assert.equal(q('Work Authorization: do you require visa sponsorship?'), 'No');
  // Two questions in one, or the answer turned round.
  for (const label of [
    'Are you authorized to work in the US and will you require sponsorship?',
    'Do you have valid work authorization or will you need sponsorship?',
    'Please confirm you will not require sponsorship now or in the future',
    'I do not need sponsorship to work in the United States',
    'Do you have any restrictions on your right to work?',
    'When does your work authorization expire?',
    'What is your work authorization status?',
    'Are you legally able to drive a company vehicle?',
  ]) asks(label, { type: 'native' });
  // Another country than the one you live in.
  for (const label of [
    'Are you legally authorized to work in Canada?', 'Do you have the right to work in the UK?',
    'Will you require sponsorship to work in Germany?', 'Are you eligible to work in the European Union without sponsorship?',
  ]) asks(label, { type: 'native' });
  const british = everything();
  british.personal.country = 'United Kingdom';
  assert.equal(q('Do you have the right to work in the UK?', british), 'Yes');
  asks('Are you legally authorized to work in the United States?', { type: 'native' }, british);
  assert.equal(q('Are you legally authorized to work in the country where this job is located?', british), 'Yes');
  // Follow-ups and requests for detail.
  asks('If yes, please describe the type of visa you hold', { type: 'textarea' });
  asks('If you require sponsorship, please describe your visa type', { type: 'textarea' });
  assert.equal(q('Do you require sponsorship? If so, please explain in your cover letter.'), 'No', 'a list still gets its answer');
});

test('"worked here before" is about this employer', () => {
  for (const label of [
    'Have you ever worked with Kubernetes in production?', 'Have you previously worked in a customer-facing role?',
    'Have you ever worked at a startup?', 'Have you worked for a company of fewer than 50 people?',
    'Are you a current or former government employee?', 'Are you a former employee of our external auditor, KPMG?',
    'Is a member of your family a current or former employee of Acme?',
  ]) asks(label, { type: 'native' });
  for (const label of [
    'Have you ever worked for Acme?', 'Have you worked here before?', 'Did you previously work at Acme? Have you worked at Acme before?',
    'Are you a current or former employee of Acme?', 'Are you a former employee or contractor?', 'Have you ever been employed by this company?',
  ]) assert.equal(picked(YES_NO, label), 'No', label);
});

test('relocation, non-compete and in-person: not their look-alikes', () => {
  for (const label of [
    'Will you require relocation assistance?', 'Where are you willing to relocate to?',
    'Do you currently live in Austin or are you willing to relocate?', 'Can you confirm you are not bound by any non-compete agreement?',
    'Will you need any accommodation to work on-site?', 'Are you available for an in-person interview next week?',
  ]) asks(label, { type: 'native' });
  asks('If you are subject to a non-compete, please explain', { type: 'textarea' });
  assert.equal(picked(YES_NO, 'This position is based in Austin, TX. Are you willing to relocate?'), 'Yes');
  assert.equal(picked(YES_NO, 'Are you subject to any non-compete or non-solicitation agreement?'), 'No');
});

test('export control: Yes/No only where the question asks whether you are a U.S. person', () => {
  for (const label of [
    'Are you a foreign person as defined by ITAR?',
    'Are you a citizen of a country subject to U.S. export control restrictions (Cuba, Iran, North Korea, Syria)?',
    'Will you require an export control license to access our technology?',
    'This role is subject to ITAR. Do you agree to comply?',
  ]) assert.equal(picked(YES_NO, label), null, label);
  assert.equal(picked(YES_NO, 'Are you a U.S. person as defined by ITAR (citizen, permanent resident, refugee or asylee)?'), 'Yes');
  // "Non-U.S. citizen" is not a citizen.
  const options = ['U.S. Citizen or Permanent Resident', 'Non-U.S. Citizen'];
  assert.equal(picked(options, 'Export control status'), options[0]);
  const resident = everything();
  resident.questions.usStatus = 'Permanent resident';
  assert.equal(picked(['U.S. Citizen', 'U.S. Permanent Resident', 'Non-permanent resident'], 'Export control status', {}, resident), 'U.S. Permanent Resident');
});

test('self-identification is about your own status', () => {
  for (const label of [
    'Are you able to perform the essential functions of this job with or without accommodation for a disability?',
    'Do you need an accommodation for a disability during the interview process?',
    'Do you identify as transgender?', 'What are your gender pronouns?',
  ]) asks(label, { type: 'native' });
  assert.equal(picked(YES_NO, 'Do you have a disability?'), 'No');
  assert.equal(picked(YES_NO, 'Are you a veteran?'), 'Yes');
  // A veteran who is not a protected one: Yes or No depends on which is asked.
  const p = everything();
  p.eeo.veteran = 'Veteran, not protected';
  assert.equal(picked(YES_NO, 'Are you a protected veteran?', {}, p), 'No');
  assert.equal(picked(YES_NO, 'Are you a veteran of the U.S. armed forces?', {}, p), 'Yes');
  // Hispanic asked with the two options named instead of Yes/No.
  const named = ['Hispanic or Latino', 'Not Hispanic or Latino', 'Decline to answer'];
  assert.equal(picked(named, 'Hispanic or Latino?'), named[1]);
  const hispanic = everything();
  hispanic.eeo.hispanic = 'Yes';
  assert.equal(picked(named, 'Hispanic or Latino?', {}, hispanic), named[0]);
  assert.equal(picked(['Yes', 'No', 'Decline'], 'Are you Hispanic/Latino?', {}, hispanic), 'Yes');
});

test('spouse or domestic partner military service', () => {
  const labels = [
    'Has your spouse or domestic partner ever served in the U.S. Military?',
    'Are you the spouse of a veteran or active service member?',
    'Is your spouse/partner a member of the U.S. Armed Forces?',
    'Military spouse: has your husband or wife served on active duty?',
  ];
  // Not saved: left for you, and never taken for your own veteran status.
  for (const label of labels) assert.deepEqual(AF.resolve(field(label, { type: 'native' }), everything()), { empty: true }, label);
  for (const answer of ['Yes', 'No']) {
    const p = everything();
    p.questions.spouseMilitary = answer;
    for (const label of labels) assert.equal(picked(YES_NO, label, {}, p), answer, label);
    assert.equal(picked(['Select One', 'Yes', 'No'], labels[0], { type: 'dropdown' }, p), answer);
  }
  // Your own service, and spouse questions about something else, are not this.
  const p = everything();
  p.questions.spouseMilitary = 'Yes';
  assert.equal(picked(YES_NO, 'Have you ever served in the U.S. Military?', {}, p), null);
  assert.equal(picked(YES_NO, 'Is your spouse or domestic partner employed by this company?', {}, p), null);
  asks('Please describe your spouse\'s military service', { type: 'textarea' }, p);
});

test('location: a bare city name does not pick between namesakes', () => {
  const where = (p) => value(field('Location', { type: 'combobox' }), p);
  const noState = profile();
  Object.assign(noState.personal, { city: 'London', state: '', country: 'United Kingdom' });
  const londons = ['London, Ontario, Canada', 'London, Greater London, England, United Kingdom', 'London, KY, United States'];
  assert.equal(AF.bestOption(londons, where(noState)), -1);
  assert.equal(AF.bestOption(['London, United Kingdom', 'London, Ontario, Canada'], where(noState)), 0);
  assert.equal(AF.bestOption(['Paris, France', 'London, Ontario, Canada'], where(noState)), 1, 'the only London listed');
  // The right Oakland isn't listed: none is chosen.
  assert.equal(AF.bestOption(['Oakland, MI, USA', 'Oakland, NJ, USA'], where(profile())), -1);
  assert.equal(AF.bestOption(['Oakland', 'Oakland Park'], where(profile())), 0);
});

test('your own answers match whole words, and never a file upload', () => {
  const p = profile({ custom: [{ question: 'age', answer: '30' }, { question: 'salary expectation', answer: '150000' }] });
  assert.equal(AF.resolve(field('Which languages do you speak?'), p), null);
  assert.equal(AF.resolve(field('Who is your manager?'), p), null);
  assert.equal(value(field('What is your age?'), p), '30');
  assert.equal(value(field('What are your salary expectations?'), p), '150000', 'plural of what you wrote');
  const upload = AF.resolve(field('Proof of age', { type: 'file' }), p, { resume: { name: 'cv.pdf' } });
  assert.deepEqual(upload, { ignore: true });
});

test('résumé uploads go by the label first', () => {
  const resume = { name: 'cv.pdf' };
  const file = (label, extra = {}) => AF.resolve(field(label, { type: 'file', ...extra }), profile(), { resume });
  assert.deepEqual(file('Resume', { section: 'resume and cover letter' }), { value: resume });
  assert.deepEqual(file('Resume/CV', { section: 'application' }), { value: resume });
  assert.deepEqual(file('Upload a file', { section: 'resume cv' }), { value: resume });
  for (const [label, extra] of [
    ['Cover Letter', { section: 'resume and cover letter' }], ['Transcript', { section: 'resume cv' }],
    ['Upload', { section: 'resume cv', id: 'transcript' }], ['Additional documents', { section: 'resume cv' }], ['Upload a file', { section: 'cover letter' }],
  ]) assert.deepEqual(file(label, extra), { ignore: true }, label);
});

test('phone: the country prefix comes off only where it has a field of its own', () => {
  const uk = profile();
  Object.assign(uk.personal, { phone: '+44 20 7946 0958', phoneCountryCode: 'United Kingdom (+44)' });
  assert.equal(value(field('Phone number'), uk, { phoneCodeField: true }), '2079460958');
  assert.equal(value(field('Phone number'), uk, {}), '442079460958');
  assert.equal(value(field('Phone number'), profile(), {}), '5550102345');
  assert.equal(value(field('Country code'), uk), '+44');
});
