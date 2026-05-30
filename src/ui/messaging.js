// Thin promise wrapper around chrome.runtime.sendMessage for UI pages.

export function send(cmd, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ cmd, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('No response from background service worker.'));
        return;
      }
      if (response.ok) resolve(response.data);
      else reject(new Error(response.error));
    });
  });
}
