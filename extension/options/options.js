const AF = globalThis.Applyfill;
const $ = (id) => document.getElementById(id);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LISTS = { work: AF.emptyWork, education: AF.emptyEducation, custom: AF.emptyCustom };
const MAX_RESUME_BYTES = 4 * 1024 * 1024; // extension storage is capped at ~10 MB

let profile;

// ── Saving ───────────────────────────────────────────────────────────

let saveTimer = null;
function queueSave() {
  $('saved').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await AF.saveProfile(profile);
    $('saved').textContent = 'Saved';
  }, 300);
}

// ── Fixed fields ─────────────────────────────────────────────────────

const getPath = (path) => path.split('.').reduce((o, k) => o[k], profile);
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], profile)[last] = value;
}

function fillOptions() {
  for (const select of document.querySelectorAll('select[data-yesno]')) {
    select.append(new Option("Don't fill", ''), new Option('Yes'), new Option('No'));
  }
}

function monthOptions(select) {
  select.append(new Option('Month', ''));
  MONTHS.forEach((name, i) => select.append(new Option(name, String(i + 1))));
}

function showFixed() {
  for (const el of document.querySelectorAll('[data-path]')) el.value = getPath(el.dataset.path) ?? '';
  $('skills').value = profile.skills.join(', ');
}

function wireFixed() {
  for (const el of document.querySelectorAll('[data-path]')) {
    el.addEventListener('input', () => {
      setPath(el.dataset.path, el.value.trim());
      queueSave();
    });
  }
  $('skills').addEventListener('input', () => {
    profile.skills = $('skills').value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    queueSave();
  });
}

// ── Repeating lists (jobs, schools, custom answers) ──────────────────

function renderList(name) {
  const container = $(name);
  container.textContent = '';
  profile[name].forEach((item, index) => {
    const node = $(`tpl-${name}`).content.firstElementChild.cloneNode(true);
    node.querySelectorAll('select[data-months]').forEach(monthOptions);

    const syncEnd = () => node.querySelectorAll('[data-end]').forEach((el) => (el.disabled = Boolean(item.current)));

    for (const el of node.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      if (el.type === 'checkbox') el.checked = Boolean(item[key]);
      else el.value = item[key] ?? '';
      el.addEventListener('input', () => {
        item[key] = el.type === 'checkbox' ? el.checked : el.value.trim();
        syncEnd();
        queueSave();
      });
    }
    syncEnd();

    node.querySelector('[data-remove]').addEventListener('click', () => {
      profile[name].splice(index, 1);
      renderList(name);
      queueSave();
    });
    container.append(node);
  });
}

function wireLists() {
  for (const button of document.querySelectorAll('[data-add]')) {
    const name = button.dataset.add;
    button.addEventListener('click', () => {
      profile[name].push(LISTS[name]());
      renderList(name);
      $(name).lastElementChild.querySelector('input').focus();
      queueSave();
    });
  }
}

// ── Résumé ───────────────────────────────────────────────────────────

function showResume(resume) {
  $('resume-name').textContent = resume ? `${resume.name} · ${Math.ceil(resume.size / 1024)} KB` : 'No file saved.';
  $('resume-remove').hidden = !resume;
}

function wireResume() {
  $('resume-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      $('resume-name').textContent = 'That file is over 4 MB. Choose a smaller one.';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const resume = { name: file.name, type: file.type, size: file.size, dataUrl: reader.result };
      await AF.saveResume(resume);
      showResume(resume);
    };
    reader.readAsDataURL(file);
  });
  $('resume-remove').addEventListener('click', async () => {
    await AF.saveResume(null);
    showResume(null);
  });
}

// ── Backup ───────────────────────────────────────────────────────────

function wireBackup() {
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'applyfill-profile.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      profile = AF.normalizeProfile(JSON.parse(await file.text()));
    } catch {
      $('backup-note').textContent = "That file isn't a valid profile.";
      return;
    }
    await AF.saveProfile(profile);
    showAll();
    $('backup-note').textContent = 'Imported. The résumé file is not part of a backup.';
  });
}

// ── Start ────────────────────────────────────────────────────────────

function showAll() {
  showFixed();
  Object.keys(LISTS).forEach(renderList);
}

(async function init() {
  profile = await AF.loadProfile();
  fillOptions();
  showAll();
  showResume(await AF.loadResume());
  wireFixed();
  wireLists();
  wireResume();
  wireBackup();
})();
