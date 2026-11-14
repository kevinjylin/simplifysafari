const api = globalThis.browser ?? globalThis.chrome;
const AF = globalThis.Applyfill;
const status = document.getElementById('status');
const fill = document.getElementById('fill');

// The generic filler, for a page no content script covers. Clicking the
// toolbar icon grants access to the current tab, so it can be added on demand.
const GENERIC = [
  'src/match.js',
  'src/dom.js',
  'src/profile.js',
  'src/rules.js',
  'src/engine.js',
  'src/forms/fields.js',
  'src/forms/fill.js',
  'src/generic/site.js',
  'src/content.js',
];

let needsInject = false;

document.getElementById('options').addEventListener('click', () => {
  api.runtime.openOptionsPage();
  window.close();
});

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function init() {
  const profile = await AF.loadProfile();
  if (!AF.hasBasics(profile)) {
    status.textContent = 'Set up your profile first: name and email at minimum.';
    return;
  }
  let reply = null;
  try {
    reply = await api.tabs.sendMessage((await activeTab()).id, { type: 'applyfill:status' });
  } catch {
    // No content script here: not a site Applyfill knows, or the site isn't allowed yet.
  }
  if (!reply) {
    if (api.scripting) {
      needsInject = true;
      status.textContent =
        "Applyfill doesn't know this site. It can still try, going by the form's labels. Check the answers before you submit.";
      fill.textContent = 'Try on this page';
      fill.disabled = false;
    } else {
      status.textContent = 'Open a job application form, and allow Applyfill on that site if Safari asks.';
    }
  } else if (!reply.fields) {
    status.textContent = 'No form fields on this page yet. Start the application, then try again.';
  } else {
    status.textContent = `${reply.fields} fields found on this page.`;
    fill.disabled = false;
  }
}

fill.addEventListener('click', async () => {
  const label = fill.textContent;
  fill.disabled = true;
  fill.textContent = 'Filling…';
  try {
    const tab = await activeTab();
    if (needsInject) {
      await api.scripting.executeScript({ target: { tabId: tab.id }, files: GENERIC });
      needsInject = false;
    }
    const result = await api.tabs.sendMessage(tab.id, { type: 'applyfill:fill' });
    if (result && result.error) throw new Error(result.error);
    status.textContent = result
      ? `${result.filled} filled, ${result.corrected} corrected, ${result.attention} need you. Details are on the page.`
      : 'Done. Details are on the page.';
  } catch (err) {
    status.textContent = `Autofill failed: ${err.message}`;
  }
  fill.textContent = label === 'Try on this page' ? 'Autofill this page' : label;
  fill.disabled = false;
});

init();
