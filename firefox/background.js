import {endpoint, parseRegions, requestBody, supportedPage, providerError, normalizeModel} from './core.js';
import {censorRegions} from './censor.js';

const running = new Map();
let lastCapture = 0;



async function translate(sender) {
  const tab = sender.tab;
  if (!tab || sender.frameId !== 0 || !supportedPage(tab.url)) throw new Error('หน้านี้ยังไม่รองรับ เปิดหน้า HTTP/HTTPS หรือภาพ blob ที่สร้างจากเว็บ');
  if (running.has(tab.id)) throw new Error('กำลังแปลภาพก่อนหน้า');
  const controller = new AbortController();
  running.set(tab.id, controller);
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const {settings} = await browser.storage.local.get('settings');
    const {apiKey: sessionKey} = await browser.storage.session.get('apiKey');
    const {rememberedKey} = await browser.storage.local.get('rememberedKey');
    const apiKey = sessionKey || (rememberedKey?.endpoint === settings?.endpoint ? rememberedKey.key : '');
    if (!settings?.consent || !apiKey) throw new Error('เปิดการตั้งค่า ใส่ API key และยอมรับการส่งภาพก่อน');
    const ep = endpoint(settings.endpoint);
    const platform = await browser.runtime.getPlatformInfo();
    if (platform.os !== 'android' && !(await browser.windows.get(tab.windowId)).focused) throw new Error('กลับมาที่หน้าต่างที่ต้องการแปลก่อนแปล');
    if (!await browser.permissions.contains({origins: [ep.origin]})) throw new Error('กรุณาบันทึกการตั้งค่าเพื่ออนุญาตบริการแปล');

    const [active] = await browser.tabs.query({active: true, windowId: tab.windowId});
    if (active?.id !== tab.id) throw new Error('กลับมาที่แท็บที่ต้องการแปลก่อนแปล');
    if (Date.now() - lastCapture < 1100) throw new Error('กรุณารอสักครู่ก่อนแปลอีกครั้ง');
    lastCapture = Date.now();
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, {format: 'jpeg', quality: 85});
    const [stillActive] = await browser.tabs.query({active: true, windowId: tab.windowId});
    if (platform.os !== 'android' && !(await browser.windows.get(tab.windowId)).focused) throw new Error('ยกเลิกเนื่องจากเปลี่ยนหน้าต่าง');
    if (stillActive?.id !== tab.id || controller.signal.aborted) throw new Error('ยกเลิกเนื่องจากเปลี่ยนแท็บ');
    await browser.tabs.sendMessage(tab.id, {type: 'captureDone'}, {frameId: 0});
    const response = await fetch(ep.url, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
      body: JSON.stringify(requestBody(normalizeModel(ep.url, settings.model), settings.language || 'Thai', screenshot, ep.url))
    });
    if (!response.ok) {
      throw new Error(await providerError(response, apiKey));
    }
    const result = await response.json();
    const raw = String(result.choices?.[0]?.message?.content || '').split(apiKey).join('[key hidden]').slice(0, 12000);
    await browser.storage.session.set({lastTranslation: {time: new Date().toISOString(), model: settings.model, finishReason: result.choices?.[0]?.finish_reason, output: raw}});
    return {regions: censorRegions(parseRegions(result.choices?.[0]?.message?.content), settings.censorMode || 'partial')};
  } finally {
    clearTimeout(timeout);
    running.delete(tab.id);
  }
}

browser.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === 'cancel' && sender.tab) {
    running.get(sender.tab.id)?.abort();
    respond({ok: true});
    return;
  }
  if (message.type !== 'translate') return;
  translate(sender).then(result => respond({ok: true, ...result})).catch(error => respond({
    ok: false, error: error.name === 'AbortError' ? 'ยกเลิกหรือหมดเวลารอ ลองแปลอีกครั้ง' : error.message
  }));
  return true;
});
browser.tabs.onRemoved.addListener(id => running.get(id)?.abort());
browser.tabs.onActivated.addListener(({tabId}) => {
  for (const [id, controller] of running) if (id !== tabId) controller.abort();
});
