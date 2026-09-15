import {endpoint, modelsEndpoint, providerError, normalizeModel, requestBody, parseRegions} from './core.js';
import {censorText, censorRegions} from './censor.js';
const $ = id => document.getElementById(id);
$('diagnostic').onclick = async () => {
  const {lastTranslation} = await browser.storage.session.get('lastTranslation');
  $('diagnostic-output').textContent = lastTranslation ? JSON.stringify(lastTranslation, null, 2) : 'ยังไม่มีผลแปลใน session นี้';
};
const {settings = {}} = await browser.storage.local.get('settings');
for (const name of ['endpoint', 'model', 'language', 'censorMode']) if (settings[name]) $(name).value = settings[name];
$('consent').checked = !!settings.consent;
const {apiKey = ''} = await browser.storage.session.get('apiKey');
const {rememberedKey} = await browser.storage.local.get('rememberedKey');
$('key').value = apiKey || (rememberedKey?.endpoint === settings.endpoint ? rememberedKey.key : '');
const remember = document.createElement('input'); remember.type='checkbox'; remember.id='remember'; remember.checked=!!rememberedKey;
const label=document.createElement('label');label.append(remember,document.createTextNode(' จำคีย์ในโปรไฟล์ Firefox เครื่องนี้ (ไม่เข้ารหัสด้วย Keystore และไม่ซิงก์)'));$('key').after(label);
$('endpoint').addEventListener('input',()=>{$('key').value='';});
$('quality-test').onclick = () => diagnostic($('quality-test'), async () => {
  const {ep, key} = await credentials();
  const model = normalizeModel(ep.url, $('model').value);
  if (!model) throw new Error('เลือกโมเดลก่อนทดสอบ');
  const canvas = document.createElement('canvas'); canvas.width=1000; canvas.height=380;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1000,380);
  ctx.fillStyle='#142e40';ctx.font='bold 34px sans-serif';
  ['THE OFFICE IS CLOSED TODAY.', 'PLEASE RETURN TOMORROW', 'BETWEEN NINE AND ELEVEN.'].forEach((line,i)=>ctx.fillText(line,30,80+i*105));
  const started=Date.now();
  const response=await fetch(ep.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(requestBody(model,'Thai',canvas.toDataURL('image/png'),ep.url))});
  if(!response.ok) throw new Error(await providerError(response,key));
  const body=await response.json();
  const regions=censorRegions(parseRegions(body.choices?.[0]?.message?.content), $('censorMode').value);
  $('status').textContent=`${model} • ${((Date.now()-started)/1000).toFixed(1)} วินาที\n${regions.map(r=>`${r.original || '(ไม่มีข้อความต้นฉบับ)'}\n→ ${r.text}`).join('\n\n')}\n\nเกณฑ์ตรวจ: ต้องรักษาความหมายว่าสำนักงานปิดวันนี้ และให้กลับมาพรุ่งนี้ระหว่างเก้าถึงสิบเอ็ดโมง\nนี่เป็นตัวอย่างเดียว ไม่ใช่คะแนนรับรองคุณภาพทุกภาพ`;
});
async function credentials() {
  const ep = endpoint($('endpoint').value.trim());
  const key = $('key').value.trim();
  if (!key) throw new Error('กรอก API key ก่อน');
  if (!await browser.permissions.request({origins: [ep.origin]})) throw new Error('ยังไม่ได้อนุญาตบริการ');
  return {ep, key};
}
async function diagnostic(button, action) {
  button.disabled = true;
  $('status').textContent = 'กำลังตรวจสอบ…';
  try { await action(); }
  catch (error) { $('status').textContent = error.name === 'TimeoutError' ? 'บริการตอบช้าเกิน 25 วินาที ลองอีกครั้ง' : error.message; }
  finally { button.disabled = false; }
}
$('list-models').onclick = () => diagnostic($('list-models'), async () => {
  const {ep, key} = await credentials();
  const response = await fetch(modelsEndpoint(ep.url), {headers: {Authorization: `Bearer ${key}`}, redirect: 'error', signal: AbortSignal.timeout(25000)});
  if (!response.ok) throw new Error(await providerError(response, key));
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error('บริการส่งรายชื่อโมเดลในรูปแบบที่ยังไม่รองรับ');
  const ids = [...new Set(body.data.map(m => m.id).filter(id => typeof id === 'string').map(id => normalizeModel(ep.url, id)))].sort();
  $('models').replaceChildren();
  $('model-picker').replaceChildren(new Option('เลือกโมเดล', ''));
  for (const id of ids) { $('models').append(new Option(id, id)); $('model-picker').append(new Option(id, id)); }
  $('model-picker-label').hidden = false;
  $('status').textContent = `พบ ${ids.length} โมเดล เลือกโมเดลแล้วกดทดสอบภาพ ก่อนบันทึก`;
});
$('model-picker').onchange = () => { if ($('model-picker').value) $('model').value = $('model-picker').value; };
$('test').onclick = () => diagnostic($('test'), async () => {
  const {ep, key} = await credentials();
  const model = normalizeModel(ep.url, $('model').value);
  $('model').value = model;
  if (!model) throw new Error('เลือกโมเดลก่อนทดสอบ');
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 160;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 400, 160);
  ctx.fillStyle = 'black'; ctx.font = 'bold 64px sans-serif'; ctx.fillText('HELLO', 60, 105);
  const response = await fetch(ep.url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000), headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body: JSON.stringify({model, messages: [{role: 'user', content: [{type: 'text', text: 'Read the word in this image and translate it into Thai. Reply with the original word and Thai translation only.'}, {type: 'image_url', image_url: {url: canvas.toDataURL('image/png')}}]}]})});
  if (!response.ok) throw new Error(await providerError(response, key));
  const body = await response.json();
  const answer = censorText(body.choices?.[0]?.message?.content, $('censorMode').value);
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('เชื่อมต่อได้ แต่ไม่มีข้อความตอบกลับ');
  $('status').textContent = `บริการตอบภาพทดสอบ: ${answer.slice(0, 500)}\nถ้าอ่านได้ว่า HELLO และแปลเป็นสวัสดี ให้บันทึกแล้วลองภาพจริง (ยังไม่รับรองความแม่นยำของการแปลภาพ)`;
});
$('form').onsubmit = async event => {
  event.preventDefault();
  try {
    const ep = endpoint($('endpoint').value.trim());
    const key = $('key').value.trim();
    const model = normalizeModel(ep.url, $('model').value);
    $('model').value = model;
    if (!key || !model) throw new Error('กรอก API key และชื่อโมเดล');
    const allowed = await browser.permissions.request({origins: [ep.origin]});
    if (!allowed) throw new Error('ยังไม่ได้อนุญาตให้เชื่อมต่อบริการ');
    await browser.storage.local.set({settings: {endpoint: ep.url, model, language: $('language').value, censorMode: $('censorMode').value, consent: $('consent').checked}});
    await browser.storage.session.set({apiKey: key});
    if (remember.checked) await browser.storage.local.set({rememberedKey: {endpoint: ep.url, key}});
    else await browser.storage.local.remove('rememberedKey');
    $('status').textContent = 'บันทึกแล้ว กลับไปหน้าเว็บที่ต้องการแปลและเปิดส่วนขยายได้เลย';
  } catch (error) { $('status').textContent = error.message; }
};
$('clear').onclick = async () => {
  await browser.storage.session.remove('apiKey');
  await browser.storage.local.remove('rememberedKey'); remember.checked=false;
  $('key').value = '';
  $('status').textContent = 'ลบ API key แล้ว';
};
