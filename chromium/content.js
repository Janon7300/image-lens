(() => {
  if (globalThis.__imageLens) { globalThis.__imageLens.show(); return; }
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  document.documentElement.append(host);
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>
    :host{font:14px system-ui,sans-serif;color:#eefaf4}
    *{box-sizing:border-box}#bar{position:fixed;bottom:20px;right:20px;width:300px;max-width:calc(100vw - 32px);padding:16px;background:#12262bf5;border:1px solid #4b7069;border-radius:16px;box-shadow:0 8px 40px #0006;pointer-events:auto;font:13px/1.6 system-ui;color:#e9f2ef}
    header{display:flex;justify-content:space-between;align-items:center;color:#77e6bc;font-weight:800;letter-spacing:1px}button{cursor:pointer;border:0;border-radius:8px;padding:9px 12px;background:#75e4b7;color:#102d24;font:600 12px system-ui}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible{outline:3px solid #ffd285}#close{background:transparent;color:white;font-size:20px;padding:0 6px}.actions{display:flex;gap:8px;margin:12px 0}.secondary{background:#324b50;color:#fff}label{display:flex;gap:7px;align-items:center;margin:8px 0}#status{margin-top:10px;color:#bdd3ce;font-size:12px;overflow-wrap:anywhere}.bubble{position:fixed;pointer-events:auto;background:#fffdf1;color:#182325;border:1px solid #96b4aa;border-radius:12px;padding:6px;line-height:1.35;text-align:center;box-shadow:0 2px 8px #0003;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-family:system-ui,sans-serif}.bubble:hover{opacity:.18}small{font-size:10px;color:#a6c1b8}
    </style><div id="boxes"></div><section id="bar" aria-label="Image Lens">
    <header>◈ IMAGE LENS <button id="close" aria-label="ปิดตัวแปล">×</button></header>
    <div class="actions"><button id="translate">แปลหน้าจอนี้</button><button id="toggle" class="secondary">ดูต้นฉบับ</button></div>
    <label>แสดงคำแปล <select id="display"><option value="overlay">กล่องเล็กบนภาพ</option><option value="panel">ในแผง ไม่บังภาพ</option></select></label>
    <label><input type="checkbox" id="auto">แปลเมื่อหยุดเลื่อน (มีค่า API)</label>
    <small>ส่งภาพพื้นที่เว็บที่มองเห็นทั้งหมดให้บริการ AI<br>อัตโนมัติสูงสุด 20 ครั้งต่อการเปิดตัวแปล</small>
    <div id="status" role="status" aria-live="polite">พร้อมแปล • ชี้คำแปลเพื่อดูภาพเดิม</div><div id="unplaced" style="max-height:180px;overflow:auto;white-space:pre-wrap"></div></section>`;
  const $ = id => root.getElementById(id);
  const theme = document.createElement('style');
  theme.textContent = `
    #bar{background:#f7f7f5;color:#151313;border:2px solid #151313;border-radius:10px;box-shadow:5px 5px 0 #151313;font-family:Kodchasan,system-ui,sans-serif;max-height:calc(100vh - 40px);overflow:auto}
    header{color:#151313;letter-spacing:0}header:before{content:'';width:8px;height:22px;background:#ff5734;border-radius:3px}
    button{background:#ff5734;color:#151313;border:1.5px solid #151313;box-shadow:2px 2px 0 #151313;border-radius:6px;font-family:inherit}
    button.secondary{background:#ffcc42;color:#151313}#close{color:#151313;box-shadow:none;border:0}#status,small{color:#58535a}
    select{background:#fff;color:#151313;border:1px solid #151313;border-radius:4px;padding:4px;font-family:inherit;max-width:165px}input{accent-color:#ff5734}
    .bubble{border:1.5px solid #151313;border-radius:8px;background:#fffdf4;box-shadow:3px 3px 0 #151313;font-family:Kodchasan,system-ui,sans-serif}
    #unplaced p{padding:10px;background:#fff7dc;border-left:3px solid #ff5734}
  `;
  root.append(theme);
  if (globalThis.FontFace && chrome.runtime.getURL) {
    const font = new FontFace('Kodchasan', `url("${chrome.runtime.getURL('fonts/Kodchasan-Regular.ttf')}")`);
    font.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
  }
  let busy = false, closed = false, hidden = false, revision = 0, timer, progressTimer, count = 0, lastRequest = 0;
  const cache = new Map();
  let displayed = null;
  const status = text => { $('status').textContent = text; };
  const position = () => ({x: scrollX, y: scrollY, w: innerWidth, h: innerHeight, url: location.href});
  const key = p => JSON.stringify(p);
  function render(regions, p) {
    displayed = {regions, p};
    $('boxes').replaceChildren();
    $('unplaced').replaceChildren();
    const occupied = [$('bar').getBoundingClientRect()];
    function addToPanel(region, reason) {
        const item = document.createElement('p');
        item.textContent = `${reason ? reason + ': ' : ''}${region.text}`;
        if (region.original) item.title = region.original;
        $('unplaced').append(item);
    }
    for (const region of regions) {
      const card = globalThis.ImageLensLayout.card(region, p);
      if (!card || $('display').value === 'panel') {
        addToPanel(region, !card ? 'ยังระบุตำแหน่งไม่ได้' : '');
        continue;
      }
      const box = document.createElement('div');
      box.className = 'bubble';
      box.textContent = region.text;
      box.title = region.original;
      box.style.cssText = `left:${card.left}px;top:${card.top}px;width:${card.width}px;height:auto;max-height:${card.maxHeight}px;font-size:16px;line-height:1.5;padding:10px 12px`;
      $('boxes').append(box);
      const bounds = box.getBoundingClientRect();
      if (occupied.some(other => globalThis.ImageLensLayout.overlaps(bounds, other))) {
        box.remove(); addToPanel(region, 'แสดงในแผงเพื่อไม่ให้กล่องซ้อนกัน');
      } else occupied.push(bounds);
    }
    $('boxes').style.visibility = hidden ? 'hidden' : 'visible';
    $('unplaced').style.display = hidden ? 'none' : '';
  }
  async function translate(automatic = false) {
    if (busy || closed || document.hidden) return;
    const p = position(), id = key(p), version = revision;
    if (cache.has(id)) { render(cache.get(id), p); status('แสดงคำแปลที่เก็บไว้ในหน้านี้'); return; }
    if (automatic && count >= 20) { $('auto').checked = false; status('ครบ 20 ครั้งแล้ว เปิดอัตโนมัติอีกครั้งเพื่อแปลต่อ'); return; }
    if (automatic && Date.now() - lastRequest < 5000) {
      clearTimeout(timer); timer = setTimeout(() => translate(true), 5100 - (Date.now() - lastRequest)); return;
    }
    busy = true; $('translate').disabled = true; lastRequest = Date.now();
    const started = Date.now();
    progressTimer = setInterval(() => {
      if (!closed) status(`กำลังรอบริการแปล • ${Math.floor((Date.now() - started) / 1000)} วินาที (รอได้สูงสุดประมาณ 25 วินาที)`);
    }, 1000);
    status('กำลังอ่านภาพและแปล…');
    // Hide the translation UI before capture so it is not translated again.
    $('boxes').style.visibility = 'hidden'; $('bar').style.visibility = 'hidden';
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (revision !== version || closed || document.hidden) {
        if (!closed) status('หน้าจอเปลี่ยนก่อนจับภาพ กรุณากดแปลอีกครั้ง');
        return;
      }
      if (automatic) count++;
      const pending = chrome.runtime.sendMessage({type: 'translate'});
      // The worker restores the toolbar after capture so Cancel stays available.
      const response = await pending;
      if (version !== revision || key(position()) !== id || closed) {
        if (!closed) status('หน้าจอหรือเนื้อหาเว็บเปลี่ยนระหว่างรอ จึงไม่วางคำแปลผิดตำแหน่ง • กดแปลอีกครั้งเมื่อหน้าจอนิ่ง');
        return;
      }
      if (!response?.ok) throw new Error(response?.error || 'ไม่ได้รับคำตอบจากส่วนขยาย');
      cache.set(id, response.regions);
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      render(response.regions, p);
      status(response.regions.length ? `แปลแล้ว ${response.regions.length} กลุ่มข้อความ • ${((Date.now() - started) / 1000).toFixed(1)} วินาที • อัตโนมัติ ${count}/20` : 'AI ไม่ส่งกลุ่มข้อความกลับมาในครั้งนี้ แม้ภาพอาจมีข้อความ ลองขยายภาพหรือแปลอีกครั้ง');
    } catch (error) {
      if (!closed) { status(`${error.message} • ปิดอัตโนมัติแล้ว`); $('auto').checked = false; }
    } finally {
      clearInterval(progressTimer);
      busy = false; $('translate').disabled = false;
      $('bar').style.visibility = 'visible';
      $('boxes').style.visibility = hidden ? 'hidden' : 'visible';
      if (!closed && $('auto').checked && version !== revision) schedule();
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => translate(true), 1200); }
  function changed(event) {
    if (event?.target === host) return;
    if (event?.type === 'resize' || event?.type === 'load') cache.clear();
    if (event?.type === 'scroll' && event.target !== document) cache.clear();
    revision++; displayed = null; $('boxes').replaceChildren(); $('unplaced').replaceChildren();
    if ($('auto').checked) schedule();
  }
  function visibility() {
    if (document.hidden) { revision++; clearTimeout(timer); chrome.runtime.sendMessage({type: 'cancel'}).catch(() => {}); }
  }
  function captureDone(message) {
    if (message.type === 'captureDone' && !closed) $('bar').style.visibility = 'visible';
  }
  chrome.runtime.onMessage.addListener(captureDone);
  $('translate').onclick = () => translate();
  $('display').onchange = () => { if (displayed) render(displayed.regions, displayed.p); };
  $('toggle').onclick = () => {
    hidden = !hidden; $('boxes').style.visibility = hidden ? 'hidden' : 'visible';
    $('unplaced').style.display = hidden ? 'none' : '';
    $('toggle').textContent = hidden ? 'ดูคำแปล' : 'ดูต้นฉบับ';
  };
  $('auto').onchange = () => {
    clearTimeout(timer);
    if ($('auto').checked) { count = 0; translate(true); }
  };
  $('close').onclick = () => {
    closed = true; revision++; clearTimeout(timer);
    clearInterval(progressTimer);
    chrome.runtime.sendMessage({type: 'cancel'}).catch(() => {});
    window.removeEventListener('scroll', changed, true);
    window.removeEventListener('resize', changed);
    document.removeEventListener('load', changed, true);
    document.removeEventListener('visibilitychange', visibility);
    chrome.runtime.onMessage.removeListener(captureDone);
    observer.disconnect(); host.remove(); delete globalThis.__imageLens;
  };
  window.addEventListener('scroll', changed, {passive: true, capture: true});
  window.addEventListener('resize', changed, {passive: true});
  document.addEventListener('load', changed, true);
  document.addEventListener('visibilitychange', visibility);
  const observer = new MutationObserver(() => { cache.clear(); changed(); });
  observer.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'srcset']});
  globalThis.__imageLens = {show: () => { $('bar').style.visibility = 'visible'; }};
})();
