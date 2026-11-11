const api = globalThis.browser ?? globalThis.chrome;
const AF = globalThis.Applyfill;
const status = document.getElementById('status');
const fill = document.getElementById('fill');

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
    // No content script here: not a Workday page, or the site isn't allowed yet.
  }
  if (!reply) {
    status.textContent = 'Open a Workday application form, and allow Applyfill on that site if Safari asks.';
  } else if (!reply.fields) {
    status.textContent = 'No form fields on this page yet. Start the application, then try again.';
  } else {
    status.textContent = `${reply.fields} fields found on this page.`;
    fill.disabled = false;
  }
}

fill.addEventListener('click', async () => {
  fill.disabled = true;
  fill.textContent = 'Filling…';
  try {
    const result = await api.tabs.sendMessage((await activeTab()).id, { type: 'applyfill:fill' });
    if (result && result.error) throw new Error(result.error);
    status.textContent = result
      ? `${result.filled} filled, ${result.attention} need you. Details are on the page.`
      : 'Done. Details are on the page.';
  } catch (err) {
    status.textContent = `Autofill failed: ${err.message}`;
  }
  fill.textContent = 'Autofill this page';
  fill.disabled = false;
});

init();
