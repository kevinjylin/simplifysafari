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
  assert.deepEqual(value(field('State', { type: 'dropdown' })), ['California', 'ca']);
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
  assert.deepEqual(at('Degree', 'dropdown'), ['Bachelor of Science', "Bachelor's Degree"]);
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
  assert.equal(q('How Did You Hear About Us?'), 'LinkedIn');
  assert.equal(q('What are your salary expectations?'), '150000', 'custom answer');
  assert.equal(AF.resolve(field('Describe a hard bug you fixed.', { type: 'textarea' }), profile()), null);
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
  assert.equal(AF.bestOption(['Male', 'Female', 'I do not wish to answer'], q('Gender')), 1);
  assert.equal(q('Please select your ethnicity'), 'Asian');
  assert.equal(value(field('Name', { section: 'self identify' })), 'Ada Lovelace');
  const date = value(field('Date', { type: 'date', section: 'self identify' }));
  assert.equal(date.year, new Date().getFullYear());
});

test('greenhouse labels', () => {
  const gh = (label, extra = {}) => value(field(label, { section: 'application', ...extra }));
  assert.deepEqual(gh('Location (City)', { type: 'select' }), [
    'Oakland, California, United States',
    'Oakland, California',
    'Oakland',
  ]);
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

  // Greenhouse's phone country list reads "United States +1".
  assert.equal(AF.bestOption(['United States Minor Outlying Islands +1', 'United States +1', 'Canada +1'], gh('Country', { type: 'select' })), 1);
  const race = ['American Indian or Alaska Native', "I don't wish to answer", 'Asian', 'White'];
  assert.equal(AF.bestOption(race, gh('Race and Ethnicity', { type: 'select' })), 2);
  assert.equal(AF.bestOption(['Man', 'Woman', 'Non-binary or third gender', "I don't wish to answer"], gh('Gender Identity (optional)', { type: 'select' })), 1);
  assert.equal(
    AF.bestOption(['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', "I don't wish to answer"], gh('Disability Status', { type: 'select' })),
    2
  );
});
