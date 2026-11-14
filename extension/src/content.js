// The on-page control: a small card in the corner of application pages
// with an Autofill button and, afterwards, the list of fields still needing you.
(function (root) {
  'use strict';
  const AF = root.Applyfill;
  const api = root.browser ?? root.chrome;
  if (root.__applyfillLoaded) return;
  root.__applyfillLoaded = true;

  const REASON = {
    unknown: 'No saved answer',
    empty: 'Not in your profile',
    nomatch: 'No matching option',
    failed: "Couldn't fill",
    partial: 'Partly filled',
    extra: 'Not in your profile. Delete it if it is not a real entry',
  };

  function reason(row) {
    if (row.missing) return `Not found: ${row.missing.join(', ')}`;
    if (row.status === 'differs') return `A different file is attached: ${row.attached}`;
    return REASON[row.status] || row.status;
  }

  const STYLE = `
    :host { all: initial; }
    .card {
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
      color: #1d1d1f; background: #fff; border: 1px solid rgba(0,0,0,.12);
      border-radius: 14px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
      width: 280px; max-height: 70vh; display: flex; flex-direction: column; overflow: hidden;
    }
    .card.compact { width: auto; }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; }
    .title { font-weight: 600; flex: 1; white-space: nowrap; }
    .summary { padding: 0 14px 10px; color: #515154; }
    .summary b { color: #1d1d1f; }
    button { font: inherit; cursor: pointer; border: 0; border-radius: 8px; }
    .primary { background: #0a66d8; color: #fff; font-weight: 600; padding: 7px 14px; }
    .primary:disabled { opacity: .6; cursor: default; }
    .ghost { background: transparent; color: #0a66d8; padding: 6px 8px; }
    .close { background: transparent; color: #86868b; width: 26px; height: 26px; font-size: 16px; line-height: 1; }
    .close:hover, .ghost:hover { background: rgba(0,0,0,.06); }
    ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; border-top: 1px solid rgba(0,0,0,.08); }
    li { padding: 8px 14px; border-bottom: 1px solid rgba(0,0,0,.06); cursor: pointer; }
    li:hover { background: rgba(10,102,216,.07); }
    .q { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .why { color: #86868b; font-size: 12px; }
    .req { color: #c9372c; font-weight: 600; }
    .foot { display: flex; justify-content: space-between; padding: 6px; }
    [hidden] { display: none !important; }
    @media (prefers-color-scheme: dark) {
      .card { background: #2c2c2e; color: #f5f5f7; border-color: rgba(255,255,255,.14); }
      .summary { color: #aeaeb2; } .summary b { color: #f5f5f7; }
      .ghost { color: #6cb0ff; } .primary { background: #2f81f7; }
      .close:hover, .ghost:hover { background: rgba(255,255,255,.1); }
      ul { border-color: rgba(255,255,255,.1); } li { border-color: rgba(255,255,255,.08); }
      li:hover { background: rgba(108,176,255,.12); }
    }
  `;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  host.setAttribute('data-applyfill', ''); // so form discovery that looks inside shadow roots skips the card
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="card compact" part="card">
      <div class="head">
        <span class="title">Applyfill</span>
        <button class="primary" id="fill">Autofill</button>
        <button class="close" id="close" title="Hide" aria-label="Hide">×</button>
      </div>
      <div class="summary" id="summary" hidden></div>
      <ul id="list" hidden></ul>
      <div class="foot" id="foot" hidden>
        <button class="ghost" id="profile">Edit profile</button>
        <button class="ghost" id="debug">Copy field report</button>
      </div>
    </div>`;
  const $ = (id) => shadow.getElementById(id);
  const card = shadow.querySelector('.card');

  let dismissed = false;
  let busy = false;
  let lastRows = [];

  function flash(el) {
    if (!el || !el.isConnected) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = el.style.outline;
    el.style.outline = '3px solid #0a66d8';
    el.style.outlineOffset = '4px';
    setTimeout(() => {
      el.style.outline = prev;
      el.style.outlineOffset = '';
    }, 1800);
  }

  function render(rows) {
    lastRows = rows;
    const { filled, corrected, already, attention } = AF.summarize(rows);
    card.classList.remove('compact');

    const summary = $('summary');
    summary.hidden = false;
    summary.textContent = '';
    const b = document.createElement('b');
    b.textContent = `${filled} filled`;
    summary.append(b);
    if (corrected) summary.append(` · ${corrected} corrected`);
    if (already) summary.append(` · ${already} already right`);
    summary.append(attention.length ? ` · ${attention.length} need you` : ' · nothing left for you');

    const list = $('list');
    list.textContent = '';
    list.hidden = attention.length === 0;
    // Required fields first: those are the ones that block "Save and Continue".
    for (const row of [...attention].sort((a, b) => Number(b.required) - Number(a.required))) {
      const li = document.createElement('li');
      const q = document.createElement('div');
      q.className = 'q';
      q.textContent = row.label || row.id || '(unlabelled field)';
      const why = document.createElement('div');
      why.className = 'why';
      if (row.required) {
        const req = document.createElement('span');
        req.className = 'req';
        req.textContent = 'Required · ';
        why.append(req);
      }
      why.append(reason(row));
      li.append(q, why);
      li.addEventListener('click', () => flash(row.el));
      list.append(li);
    }
    $('foot').hidden = false;
  }

  async function run() {
    if (busy) return null;
    busy = true;
    const button = $('fill');
    button.disabled = true;
    button.textContent = 'Filling…';
    try {
      const [profile, resume] = await Promise.all([AF.loadProfile(), AF.loadResume()]);
      if (!AF.hasBasics(profile)) {
        card.classList.remove('compact');
        $('summary').hidden = false;
        $('summary').textContent = 'Add your name and email to your profile first.';
        $('foot').hidden = false;
        return { needsProfile: true };
      }
      const rows = await AF.fillPage(profile, resume);
      render(rows);
      const s = AF.summarize(rows);
      return { filled: s.filled, corrected: s.corrected, already: s.already, attention: s.attention.length };
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = lastRows.length ? 'Fill again' : 'Autofill';
    }
  }

  /** What was on the page and what happened to it — no profile values. */
  function fieldReport() {
    const rows = lastRows.length ? lastRows : AF.discover().map((f) => ({ ...f, status: 'not run' }));
    return JSON.stringify(
      {
        page: location.hostname + location.pathname.replace(/\/[^/]*\d{4,}[^/]*/g, '/…'),
        // Left out on purpose: `missing` and `attached`, which come from your profile and files.
        // `diag` is the tag structure of a control that couldn't be filled, with no text in it.
        fields: rows.map(({ id, type, label, section, index, required, status, replaced, options, error, diag }) => ({
          id, type, label, section, index, required, status, replaced, options, error, diag,
        })),
      },
      null,
      2
    );
  }

  $('fill').addEventListener('click', run);
  $('close').addEventListener('click', () => {
    dismissed = true;
    host.hidden = true;
  });
  $('profile').addEventListener('click', () => api.runtime.sendMessage({ type: 'applyfill:openOptions' }));
  $('debug').addEventListener('click', async () => {
    const button = $('debug');
    try {
      await navigator.clipboard.writeText(fieldReport());
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = 'Copy field report'), 1500);
  });

  // Most application sites are single-page apps: forms appear and disappear without a page
  // load, so watch for them rather than checking once.
  let timer = null;
  function sync() {
    if (busy) return;
    const show = !dismissed && AF.hasFields();
    if (show && !host.isConnected) document.documentElement.append(host);
    host.hidden = !show;
  }
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(sync, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  sync();

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return undefined;
    if (msg.type === 'applyfill:status') {
      sendResponse({ fields: AF.discover().length });
      return undefined;
    }
    if (msg.type === 'applyfill:fill') {
      dismissed = false;
      sync();
      run().then(sendResponse, (err) => sendResponse({ error: String(err) }));
      return true; // keep the channel open for the async reply
    }
    return undefined;
  });
})(globalThis);
