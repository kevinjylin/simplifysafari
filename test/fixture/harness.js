// Shared checks for the mock pages: fill twice with the real filler, then
// compare what the page committed (window.__store) with what was expected.
//   <page>.html          fill, then fill again (the second pass must change nothing)
//   <page>.html?manual   don't run automatically; press the Autofill card yourself
window.fixture = function fixture({ expect = {}, untouched = [], status = {}, required = [], before, extra }) {
  const AF = window.Applyfill;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function check(rows, again) {
    const state = window.__store;
    const out = [];
    for (const [key, want] of Object.entries(expect)) {
      out.push({ name: key, ok: same(state[key], want), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const key of untouched) {
      out.push({ name: `${key} untouched`, ok: !(key in state), detail: `got ${JSON.stringify(state[key])}` });
    }
    for (const [label, want] of Object.entries(status)) {
      const row = rows.find((r) => r.label === label);
      out.push({ name: `status of "${label}"`, ok: Boolean(row) && row.status === want, detail: `got ${row ? row.status : 'no row'}` });
    }
    for (const label of required) {
      const row = rows.find((r) => r.label === label);
      out.push({ name: `"${label}" marked required`, ok: Boolean(row && row.required), detail: row ? 'not required' : 'no row' });
    }
    const s = AF.summarize(again);
    const changed = again.filter((r) => r.status === 'filled' || r.status === 'partial').map((r) => r.label);
    out.push({ name: 'second fill changes nothing', ok: s.filled === 0 && s.corrected === 0, detail: `${s.filled} filled, ${s.corrected} corrected: ${changed.join(', ')}` });
    if (extra) out.push(...extra(rows, again));
    return out;
  }

  function show(results, rows) {
    const failed = results.filter((r) => !r.ok);
    const verdict = document.getElementById('verdict');
    verdict.textContent = failed.length ? `FAIL: ${failed.length} of ${results.length}` : `PASS: ${results.length} checks`;
    verdict.className = failed.length ? 'fail' : 'pass';
    const box = document.getElementById('results');
    box.textContent = '';
    for (const r of failed) {
      const line = document.createElement('div');
      line.className = 'fail';
      line.textContent = `✗ ${r.name} (${r.detail})`;
      box.append(line);
    }
    window.__results = { passed: results.length - failed.length, failed: failed.map((r) => `${r.name}: ${r.detail}`) };
    window.__rows = rows.map(({ el, control, ...rest }) => rest);
  }

  window.runFixture = async function runFixture() {
    document.getElementById('verdict').textContent = 'Running…';
    const profile = AF.normalizeProfile(window.TEST_PROFILE);
    if (before) before(profile);
    const rows = await AF.fillPage(profile, window.TEST_RESUME);
    const again = await AF.fillPage(profile, window.TEST_RESUME);
    show(check(rows, again), rows);
  };

  if (!new URLSearchParams(location.search).has('manual')) setTimeout(window.runFixture, 300);
};

window.__store = {};
window.commit = function commit(name, value) {
  window.__store[name] = value;
  const pre = document.getElementById('state');
  if (pre) pre.textContent = JSON.stringify(window.__store, null, 2);
};
