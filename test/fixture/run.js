// Fills the mock page with the real filler and checks what the page ended up
// holding. Open index.html through a local web server.
//   index.html          blank application
//   index.html?parsed   application pre-filled (partly wrongly) by a résumé parser
//   &manual             don't run automatically; press the Autofill card yourself
(function () {
  const AF = window.Applyfill;
  const params = new URLSearchParams(location.search);
  const PARSED = params.has('parsed');
  const now = new Date();

  // What the page's own state should contain after filling a blank form.
  // The mock only records a value when a control changes, so anything the
  // filler rightly leaves alone never appears here.
  const BLANK = {
    source: 'LinkedIn',
    previousWorker: 'No',
    country: 'United States of America',
    firstName: 'Ada',
    lastName: 'Lovelace',
    address1: '1 Analytical Way',
    city: 'Oakland',
    state: 'California',
    postalCode: '94607',
    email: 'ada@example.com',
    phoneType: 'Mobile',
    phoneCode: 'United States of America (+1)',
    phone: '5550102345',
    'work1.title': 'Engineer',
    'work1.company': 'Engines Ltd',
    'work1.location': 'Oakland, CA',
    'work1.current': true,
    'work1.from': { Month: 3, Year: 2022 },
    'work1.description': 'Built the engine.',
    'work2.title': 'Intern',
    'work2.company': 'Looms Inc',
    'work2.location': 'Lyon',
    'work2.from': { Month: 6, Year: 2020 },
    'work2.to': { Month: 9, Year: 2020 },
    'work2.description': 'Punched cards.',
    'edu1.school': 'University of California, Berkeley',
    'edu1.degree': 'BS', // the list abbreviates; the profile says "Bachelor of Science"
    'edu1.field': 'Mathematics',
    'edu1.gpa': '3.9',
    'edu1.from': { Year: 2016 },
    'edu1.to': { Year: 2020 },
    skills: ['Python', 'SQL'],
    resume: { name: 'cv.txt', size: 12, text: 'hello resume' },
    'site1.url': 'https://ada.dev',
    'site2.url': 'https://github.com/ada',
    linkedin: 'https://linkedin.com/in/ada',
    'q.authorized': 'Yes',
    'q.sponsorship': 'No, I will not require sponsorship',
    'q.noSponsor': 'Yes',
    'q.over18': 'Yes',
    'q.salary': '150000',
    'eeo.ethnicity': 'Asian (Not Hispanic or Latino) (United States of America)',
    'eeo.gender': 'Female',
    'eeo.veteran': 'I AM NOT A VETERAN',
    'self.name': 'Ada Lovelace',
    'self.date': { Month: now.getMonth() + 1, Day: now.getDate(), Year: now.getFullYear() },
    'self.disability': 'I do not want to answer',
  };
  const NEVER = ['middleName', 'preferredName', 'extension', 'work1.to', 'work2.current', 'q.relocate', 'q.why', 'consent'];

  const SCENARIOS = {
    blank: {
      expect: BLANK,
      untouched: [...NEVER, 'q.shift'],
      status: {
        'Email Address': 'filled',
        'Which shift do you prefer?': 'unknown',
        'Are you willing to relocate?': 'empty',
        'Why do you want to work here?': 'unknown',
        'Yes, I have read and consent to the terms and conditions': 'unknown',
        'Type to Add Skills': 'partial',
        'Middle Name': 'ignored',
        'Phone Device Type': 'filled', // the dropdown that only reacts to mouse-down
      },
      replaced: ['Email Address'],
    },
    parsed: {
      // Already-correct values must not be rewritten; wrong ones must be.
      expect: {
        ...without(BLANK, ['country', 'firstName', 'lastName', 'phone', 'work1.company', 'work2.title', 'work2.company', 'work2.from', 'work2.to', 'edu1.field', 'resume']),
        skills: ['JavaScript', 'Python', 'SQL'], // parser's extra skill is kept, ours are added
      },
      untouched: [...NEVER, 'q.shift', 'country', 'firstName', 'lastName', 'phone', 'work1.company', 'work2.title', 'work2.from', 'work2.to', 'edu1.field', 'resume', 'work3.title', 'work3.company'],
      status: {
        'Country': 'already',
        'Last Name': 'already', // differs only in capitalisation
        'Phone Number': 'already', // differs only in formatting
        'Which shift do you prefer?': 'kept', // no saved answer, but the form has one
        'Work Experience 3': 'extra',
        'Field of Study': 'already',
        'Are you willing to relocate?': 'empty',
      },
      replaced: ['Job Title', 'From', 'Role Description', 'School or University', 'Degree', 'To (Actual or Expected)', 'Gender', 'Have you previously worked for Acme as an employee or contractor?'],
    },
  };

  function without(object, keys) {
    const copy = { ...object };
    for (const key of keys) delete copy[key];
    return copy;
  }

  function check(rows, scenario) {
    const state = window.__wd;
    const out = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const [key, want] of Object.entries(scenario.expect)) {
      out.push({ name: key, ok: same(state[key], want), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const key of scenario.untouched) {
      out.push({ name: `${key} untouched`, ok: !(key in state), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const [label, want] of Object.entries(scenario.status)) {
      const row = rows.find((r) => r.label === label);
      out.push({ name: `status of "${label}"`, ok: Boolean(row) && row.status === want, detail: `got ${row ? row.status : 'no row'}` });
    }
    for (const label of scenario.replaced) {
      const row = rows.find((r) => r.label === label && r.replaced);
      out.push({ name: `"${label}" reported as corrected`, ok: Boolean(row), detail: 'no corrected row' });
    }
    const openPopups = document.querySelectorAll('ul[role="listbox"], [data-automation-widget="wd-popup"]').length;
    out.push({ name: 'no popup left open', ok: openPopups === 0, detail: `${openPopups} open` });
    return out;
  }

  function show(results) {
    const failed = results.filter((r) => !r.ok);
    document.getElementById('verdict').textContent = failed.length
      ? `FAIL: ${failed.length} of ${results.length}`
      : `PASS: ${results.length} checks`;
    document.getElementById('verdict').className = failed.length ? 'fail' : 'pass';
    const box = document.getElementById('results');
    box.textContent = '';
    for (const r of failed) {
      const line = document.createElement('div');
      line.className = 'fail';
      line.textContent = `✗ ${r.name} (${r.detail})`;
      box.append(line);
    }
    window.__results = { passed: results.length - failed.length, failed: failed.map((r) => `${r.name}: ${r.detail}`) };
  }

  window.runFixture = async function runFixture() {
    document.getElementById('verdict').textContent = 'Running…';
    const rows = await AF.fillPage(AF.normalizeProfile(window.TEST_PROFILE), window.TEST_RESUME);
    window.__rows = rows.map(({ el, ...rest }) => rest);
    window.__summary = AF.summarize(rows);
    show(check(rows, SCENARIOS[PARSED ? 'parsed' : 'blank']));
  };

  if (!params.has('manual')) setTimeout(window.runFixture, 300);
})();
