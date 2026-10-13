(() => {
  'use strict';
  if (location.origin !== 'https://deltabox.local' || window.top !== window) return;
  const listeners = new Map(), pending = new Map(); let sequence = 0;
  const send = (type, data) => chrome.webview.postMessage({ type, data });
  const invoke = type => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('Native request timed out')); }, 10000);
    pending.set(id, { resolve, timer }); chrome.webview.postMessage({ type, id });
  });
  const values = new Map(Object.entries(window.__NATIVE_STORAGE__ || {}));
  delete window.__NATIVE_STORAGE__;
  const storage = {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem(key, value) { key = String(key); value = String(value); values.set(key, value); send('storage', Object.fromEntries(values)); },
    removeItem(key) { values.delete(String(key)); send('storage', Object.fromEntries(values)); },
    clear() { values.clear(); send('storage', {}); },
    key: index => [...values.keys()][index] || null,
    get length() { return values.size; },
  };
  Object.defineProperty(window, 'localStorage', { value: storage });
  Object.defineProperty(window, 'overlay', { writable: !!window.__NATIVE_TEST__, value: Object.freeze({
    // 资产同源自内存响应（deltabox.local），
    // 不需要旧版打包态的绝对 URL 前缀；显式给空串保持与 preload 契约一致。
    runtime: Object.freeze({ remoteMedia: true, assetsDir: '' }),
    // 可交互区矩形（CSS px）或 null：宿主端据此显示/移动输入接管窗口。主窗口
    // 的 WS_EX_TRANSPARENT 永不翻转（运行时改层叠样式会把全屏游戏踢出全屏），
    // 交互输入由独立的小输入窗口接收后转发。
    setInteractiveRect: rect => send('interactiveRect', rect ?? null),
    // 失锁/重置/失焦会撤销当前手势；与普通悬停离开（仍允许拖动到抬起）分开。
    cancelPointer: () => send('cancelPointer', null),
    // 桌面采集强制排除自身界面；关闭桌面采集后录屏模式可独立选择。
    setCaptureHidden: hidden => send('captureHide', !!hidden),
    setDesktopCapture: enabled => send('desktopCapture', !!enabled),
    openExternal: url => send('openExternal', url),
    configureTracking: config => send('tracking', config),
    reportDiagnostic: diagnostic => send('diagnostic', diagnostic),
    getVersion: () => invoke('version'),
    checkUpdate: () => invoke('checkUpdate'),
    quitApp: () => send('quit'),
    onView(channel, callback) { if (!listeners.has(channel)) listeners.set(channel, []); listeners.get(channel).push(callback); },
  }) });
  chrome.webview.addEventListener('message', event => {
    const message = event.data;
    if (message.reply) { const task = pending.get(message.reply); if (task) { clearTimeout(task.timer); pending.delete(message.reply); task.resolve(message.data); } }
    else for (const callback of listeners.get(message.channel) || []) callback(message.data);
  });
  window.addEventListener('error', event => send('diagnostic', { level: 'ERROR', event: 'window-error', message: event.message }));
  window.addEventListener('unhandledrejection', event => send('diagnostic', { level: 'ERROR', event: 'rejection', message: String(event.reason) }));
})();
