// Study-only adapter. The original renderer/bridge.js remains byte-identical.
(() => {
  'use strict';
  const listeners = new Map(), diagnostics = [];
  let config = null;
  function emit(channel, data) {
    for (const callback of listeners.get(channel) || []) callback(data);
  }
  function note(message) { window.dispatchEvent(new CustomEvent('study:note', { detail: message })); }
  window.studyBridge = Object.freeze({ emit, note, get config() { return config; },
    get diagnostics() { return diagnostics.slice(); } });
  window.overlay = Object.freeze({
    runtime: Object.freeze({ remoteMedia: false, assetsDir: '', desktopCapture: false }),
    onView(channel, callback) {
      if (!listeners.has(channel)) listeners.set(channel, []);
      listeners.get(channel).push(callback);
    },
    configureTracking(value) { config = { ...value }; },
    setInteractiveRect() {}, cancelPointer() {}, setCaptureHidden() {}, setDesktopCapture() {},
    getVersion: async () => '1.3.0',
    checkUpdate: async () => ({ status: 'ok', current: '1.3.0', latest: '1.3.0', released_at: '2026-10-09' }),
    quitApp() { note('这是浏览器学习演示；关闭当前浏览器标签即可退出。'); },
    openExternal(value) {
      try { const url = new URL(value); if (url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer'); }
      catch { note('链接格式不正确。'); }
    },
    reportDiagnostic(value) {
      diagnostics.push(value); if (diagnostics.length > 128) diagnostics.shift();
      if (value.level === 'ERROR') console.error('[DeltaBoxStudy]', value);
    },
  });
})();
