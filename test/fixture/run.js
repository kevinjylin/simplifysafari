// Fills the mock page with the real filler and checks what the page ended up
// holding. Open index.html through a local web server; add ?manual to skip the
// automatic run and press the Autofill card yourself.
(function () {
  const AF = window.Applyfill;
  const now = new Date();

  // What the page's own state should contain afterwards.
  const EXPECT = {
    source: 'LinkedIn',
    previousWorker: 'No',
    country: 'United States of America',
    firstName: 'Ada',
    lastName: 'Lovelace',
    address1: '1 Analytical Way',
    city: 'Oakland',
    state: 'California',
    postalCode: '94607',
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
    'edu1.degree': 'Bachelor of Science',
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

  // Fields that must be left untouched (and so never reach the page's state).
  const UNTOUCHED = ['middleName', 'preferredName', 'extension', 'email', 'work1.to', 'work2.current', 'q.shift', 'q.relocate', 'q.why', 'consent'];

  // How specific fields should be reported back to the user.
  const STATUS = {
    'Email Address': 'already',
    'Which shift do you prefer?': 'unknown',
    'Are you willing to relocate?': 'empty',
    'Why do you want to work here?': 'unknown',
    'Yes, I have read and consent to the terms and conditions': 'unknown',
    'Type to Add Skills': 'partial',
    'Middle Name': 'ignored',
  };

  function check(rows) {
    const state = window.__wd;
    const out = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const [key, want] of Object.entries(EXPECT)) {
      out.push({ name: key, ok: same(state[key], want), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const key of UNTOUCHED) {
      out.push({ name: `${key} untouched`, ok: !(key in state), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const [label, want] of Object.entries(STATUS)) {
      const row = rows.find((r) => r.label === label);
      out.push({ name: `status of "${label}"`, ok: Boolean(row) && row.status === want, detail: `got ${row ? row.status : 'no row'}` });
    }
    const email = document.getElementById('in-email').value;
    out.push({ name: 'existing email kept', ok: email === 'existing@example.com', detail: `got ${email}` });
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
    show(check(rows));
  };

  if (!new URLSearchParams(location.search).has('manual')) setTimeout(window.runFixture, 300);
})();
