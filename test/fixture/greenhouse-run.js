// Fills the mock Greenhouse page with the real filler and checks what the
// page ended up holding. Open greenhouse.html through a local web server.
//   greenhouse.html           fill, then fill again (the second pass must change nothing)
//   greenhouse.html?manual    don't run automatically; press the Autofill card yourself
(function () {
  const AF = window.Applyfill;
  const params = new URLSearchParams(location.search);

  // A second school, so the filler has to press "Add another".
  window.TEST_PROFILE.education = [
    ...window.TEST_PROFILE.education,
    { school: 'Stanford University', degree: 'M.S. Mathematics', field: 'Mathematics', startYear: '2020', endYear: '2022' },
  ];

  const EXPECT = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phoneCountry: 'United States +1',
    phone: '5550102345',
    location: 'Oakland, California, United States',
    resume: { name: 'cv.txt', size: 12, text: 'hello resume' },
    'edu1.school': 'University of California - Berkeley', // listed differently from the profile
    'edu1.degree': "Bachelor's Degree", // profile says "Bachelor of Science"
    'edu1.discipline': 'Mathematics',
    'edu1.startYear': '2016',
    'edu1.endYear': '2020',
    'edu2.school': 'Stanford University',
    'edu2.degree': "Master's Degree",
    'edu2.discipline': 'Mathematics',
    'edu2.startYear': '2020',
    'edu2.endYear': '2022',
    linkedin: 'https://linkedin.com/in/ada',
    website: 'https://ada.dev',
    source: 'LinkedIn',
    'q.authorized': 'Yes',
    'q.sponsorship': 'No',
    'q.salary': '150000',
    'eeo.gender': 'Female',
    'eeo.race': 'Asian',
    'eeo.veteran': 'I am not a protected veteran',
    'eeo.disability': "I don't wish to answer",
  };
  const UNTOUCHED = ['preferredName', 'coverLetter', 'edu1.startMonth', 'edu1.endMonth', 'q.relocate', 'q.why', 'q.lengths', 'eeo.lgbtq', 'submitted'];
  const STATUS = {
    'Preferred First Name': 'ignored',
    'Cover Letter': 'ignored',
    'Start date month': 'empty', // the profile keeps years only
    'Are you open to relocation for this role?': 'empty',
    'Why do you want to work here?': 'unknown',
    'Which residency lengths would work for you?': 'unknown',
    'I consider myself a member of the LGBTQ+ community. (optional)': 'unknown',
    'Resume/CV': 'filled',
    'School': 'filled',
    'Country': 'filled',
  };

  function check(rows, again) {
    const state = window.__gh;
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
    const required = rows.find((r) => r.label === 'Why do you want to work here?');
    out.push({ name: 'required flag read', ok: Boolean(required && required.required), detail: 'not required' });
    const open = document.querySelectorAll('.select__menu').length;
    out.push({ name: 'no dropdown left open', ok: open === 0, detail: `${open} open` });
    const s = AF.summarize(again);
    out.push({ name: 'second fill changes nothing', ok: s.filled === 0 && s.corrected === 0, detail: `${s.filled} filled, ${s.corrected} corrected: ${again.filter((r) => r.status === 'filled' || r.status === 'partial').map((r) => r.label).join(', ')}` });
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
    const profile = AF.normalizeProfile(window.TEST_PROFILE);
    const rows = await AF.fillPage(profile, window.TEST_RESUME);
    const again = await AF.fillPage(profile, window.TEST_RESUME);
    window.__rows = rows.map(({ el, ...rest }) => rest);
    window.__again = again.map(({ el, ...rest }) => rest);
    show(check(rows, again));
  };

  if (!params.has('manual')) setTimeout(window.runFixture, 300);
})();
