import {supportedPage} from './core.js';
document.querySelector('#options').onclick = () => browser.runtime.openOptionsPage();
document.querySelector('#start').onclick = async () => {
  const status = document.querySelector('#status');
  try {
    const {settings} = await browser.storage.local.get('settings');
    const {apiKey: sessionKey} = await browser.storage.session.get('apiKey');
    const {rememberedKey} = await browser.storage.local.get('rememberedKey');
    const apiKey = sessionKey || (rememberedKey?.endpoint === settings?.endpoint ? rememberedKey.key : '');
    if (!apiKey || !settings?.consent) { await browser.runtime.openOptionsPage(); return; }
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    if (!supportedPage(tab?.url)) throw new Error('หน้านี้ยังไม่รองรับ เปิดหน้า HTTP/HTTPS หรือภาพ blob ที่สร้างจากเว็บ');
    try {
      await browser.tabs.executeScript(tab.id, {file: 'layout.js'});
      await browser.tabs.executeScript(tab.id, {file: 'content.js'});
    } catch {
      throw new Error('เบราว์เซอร์ไม่อนุญาตให้เปิดตัวแปลในหน้านี้ ลองเปิดภาพภายในหน้าเว็บต้นทาง แล้วกดส่วนขยายอีกครั้ง');
    }
    window.close();
  } catch (error) { status.textContent = `เปิดไม่ได้: ${error.message}`; }
};
