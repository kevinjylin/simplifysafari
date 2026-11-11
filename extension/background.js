// Content scripts can't open the options page themselves, so they ask here.
const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'applyfill:openOptions') api.runtime.openOptionsPage();
});

api.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') api.runtime.openOptionsPage();
});
