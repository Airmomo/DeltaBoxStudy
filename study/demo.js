// Classic script deliberately shares the archived page's lexical scope.
// Synthetic tracking observations demonstrate projection, not game recognition.
(() => {
  'use strict';
  const controls = document.createElement('aside');
  controls.id = 'study-controls';
  controls.innerHTML = `<div class="study-title">DeltaBoxStudy · 1.3.0 · 原作者南神</div>
    <p>浏览器学习演示：本地瓦片 + 模拟定位。拖动地图平移，滚轮缩放，双击物资点查看详情。</p>
    <div class="study-actions"><button id="study-fit">适配地图</button><button id="study-all">显示全部分类</button>
    <button id="study-clear">清空分类</button><button id="study-pause" aria-pressed="false">暂停模拟定位</button>
    <a href="/">项目说明</a><a href="/README.md" target="_blank" rel="noopener">README</a></div>
    <div id="study-note" role="status">不采集游戏，不接管系统输入，不连接生产更新或授权服务。</div>`;
  document.body.appendChild(controls);
  const background = document.createElement('div');background.id = 'study-map';
  document.getElementById('maproot').prepend(background);
  const pose = { scale: 1, tx: 0, ty: 0 };
  let mapKey = '', paused = false, lastFrame = 0, drag = null;
  function fit() {
    const offset = D.mapConf[state.map].offset || {};
    const width = (offset.cols || 16) * 256, height = (offset.rows || 16) * 256;
    const sidebar = document.querySelector('#sidebar')?.getBoundingClientRect();
    const left = state.sidebarCollapsed ? 36 : (sidebar?.width || 300) + 24;
    pose.scale = Math.max(.05, Math.min(Math.max(180, innerWidth-left-40)/width, Math.max(180, innerHeight-160)/height));
    pose.tx = left+(innerWidth-left-width*pose.scale)/2;
    pose.ty = 30+(innerHeight-150-height*pose.scale)/2;
  }
  function tiles() {
    background.replaceChildren();
    const offset = D.mapConf[state.map].offset || {};
    const cols = offset.cols || 16, rows = offset.rows || 16;
    background.style.width = `${cols*256}px`;background.style.height = `${rows*256}px`;
    const floor = state.map === 'cxjy' && state.floor ? `${state.floor}/` : '';
    for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) {
      const image = document.createElement('img');image.alt = '';image.draggable = false;
      image.src = `images/dfmap/${state.map}/map/${floor}4_${x}_${y}.webp`;
      image.style.left = `${x*256}px`;image.style.top = `${y*256}px`;background.appendChild(image);
    }
  }
  function pause(value) {
    paused = value;
    const button = document.getElementById('study-pause');button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? '继续模拟定位' : '暂停模拟定位';
    if (paused) window.studyBridge.emit('tracking:map-key', { key: 'M', source: 'study', pressedAt: Date.now() });
  }
  function frame(now) {
    const nextKey = `${state.map}/${state.floor || ''}`;
    if (nextKey !== mapKey) { mapKey = nextKey; tiles(); fit(); }
    background.style.transform = `translate(${pose.tx}px,${pose.ty}px) scale(${pose.scale})`;
    if (!paused && now-lastFrame>=100) {
      lastFrame = now;
      window.studyBridge.emit('tracking:result', { valid: true, epoch: tracking.epoch,
        scale: pose.scale, tx: pose.tx, ty: pose.ty, width: innerWidth, height: innerHeight,
        capturedAt: Date.now(), publishedAt: Date.now(), source: 'study-simulation', floor: state.floor, events: {} });
      const status = document.getElementById('tracking-status');
      if (tracking.valid) status.textContent = '学习演示 · 模拟定位';
    }
    requestAnimationFrame(frame);
  }
  function overPanel(target) {
    return !!target.closest('#sidebar,#map-menu,#popup-layer,#study-controls,#am-confirm,#cap-confirm,#task-pop');
  }
  document.getElementById('study-fit').onclick = fit;
  document.getElementById('study-all').onclick = () => updateCategories(currentCatIds(), true);
  document.getElementById('study-clear').onclick = () => updateCategories([...state.activeCats], false);
  document.getElementById('study-pause').onclick = () => pause(!paused);
  window.addEventListener('study:note', event => { document.getElementById('study-note').textContent = event.detail; });
  window.addEventListener('resize', fit);
  window.addEventListener('wheel', event => {
    if (overPanel(event.target)) return;
    event.preventDefault();
    const previous = pose.scale, next = Math.min(2, Math.max(.05, previous * (event.deltaY>0 ? .9 : 1.1)));
    pose.tx = event.clientX-(event.clientX-pose.tx)*next/previous;
    pose.ty = event.clientY-(event.clientY-pose.ty)*next/previous;pose.scale = next;
  }, { passive: false });
  window.addEventListener('pointerdown', event => {
    if (event.button !== 0 || overPanel(event.target) || event.target.closest('.marker')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, tx: pose.tx, ty: pose.ty };
    document.body.setPointerCapture(event.pointerId);
  });
  window.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    pose.tx = drag.tx+event.clientX-drag.x;pose.ty = drag.ty+event.clientY-drag.y;
  });
  function release() { drag = null; }
  window.addEventListener('pointerup', release);window.addEventListener('pointercancel', release);window.addEventListener('blur', release);
  window.addEventListener('dblclick', event => {
    if (!tracking.valid || overPanel(event.target) || !event.target.closest('.marker')) return;
    const point = markerAt(event.clientX,event.clientY);
    if (point) showPopover(point.x*view.scale+view.tx,point.y*view.scale+view.ty,point.p,point.catId);
  });
  window.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,[contenteditable=true]') || event.repeat) return;
    if (event.key === 'Escape') pause(true);
    else if (event.key.toLowerCase() === 'm' && !event.ctrlKey && !event.altKey && !event.metaKey) pause(!paused);
    else if (event.key.toLowerCase() === 'h' && event.ctrlKey && event.shiftKey) { event.preventDefault();window.studyBridge.emit('sidebar:toggle'); }
  });
  if (!state.activeCats.size && D.maps[state.map].Points.bxx) updateCategories(['bxx'], true);
  window.studyDemo = Object.freeze({ fit, pause, get paused() { return paused; }, get pose() { return { ...pose }; } });
  requestAnimationFrame(frame);
})();
