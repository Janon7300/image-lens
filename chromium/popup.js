import {supportedPage} from './core.js';
document.querySelector('#options').onclick = () => chrome.runtime.openOptionsPage();
document.querySelector('#start').onclick = async () => {
  const status = document.querySelector('#status');
  try {
    const {settings} = await chrome.storage.local.get('settings');
    const {apiKey} = await chrome.storage.session.get('apiKey');
    if (!apiKey || !settings?.consent) { await chrome.runtime.openOptionsPage(); return; }
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!supportedPage(tab?.url)) throw new Error('หน้านี้ยังไม่รองรับ เปิดหน้า HTTP/HTTPS หรือภาพ blob ที่สร้างจากเว็บ');
    try {
      await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['layout.js', 'content.js']});
    } catch {
      throw new Error('เบราว์เซอร์ไม่อนุญาตให้เปิดตัวแปลในหน้านี้ ลองเปิดภาพภายในหน้าเว็บต้นทาง แล้วกดส่วนขยายอีกครั้ง');
    }
    window.close();
  } catch (error) { status.textContent = `เปิดไม่ได้: ${error.message}`; }
};
