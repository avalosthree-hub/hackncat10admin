// Browser smoke checks using an isolated Chrome DevTools session and mocked API data.
// Start headless Chrome with --remote-debugging-port=9228 and a temporary user-data-dir.
// No real Supabase requests are allowed. No browser automation dependency is required.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const port = process.env.CHROME_DEBUG_PORT || '9228';
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5174/';
const env = await fs.readFile('.env.local', 'utf8');
const host = new URL(env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1]).hostname;
const ref = host.split('.')[0];
const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const tab = tabs.find(item => item.type === 'page');
assert.ok(tab, 'Headless Chrome page is available');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const waiting = new Map();
const runtimeErrors = [];
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.id) { const pending = waiting.get(data.id); waiting.delete(data.id); if (data.error) pending.reject(data.error); else pending.resolve(data.result); }
  if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails.text);
});
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; waiting.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`);
}
async function click(label) {
  await evaluate(`(() => { const element = [...document.querySelectorAll('button,a')].find(el => (el.querySelector(".navLabel")?.textContent || el.textContent).trim() === ${JSON.stringify(label)}); if (!element) throw new Error('Missing control: '+${JSON.stringify(label)}); element.click(); })()`);
}
async function fill(selector, value) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}
async function submit() { await evaluate('document.querySelector("dialog form").requestSubmit()'); }
async function route(hash) { await evaluate(`location.hash=${JSON.stringify(hash)}`); }
const preload = `(${function (ref) {
  const authId = '10000000-0000-4000-8000-000000000001';
  const institution = '20000000-0000-4000-8000-000000000001';
  const first = '30000000-0000-4000-8000-000000000001';
  const second = '30000000-0000-4000-8000-000000000002';
  const role = localStorage.getItem('qa-role') || 'owner';
  const user = { id:authId, email:'owner@university.edu', aud:'authenticated', app_metadata:{provider:'email'}, user_metadata:{}, created_at:new Date().toISOString() };
  const exp = Math.floor(Date.now()/1000)+3600;
  const encode = value => btoa(JSON.stringify(value)).replaceAll('=','').replaceAll('+','-').replaceAll('/','_');
  const token = encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:authId,role:'authenticated',aud:'authenticated',exp})+'.mock';
  const key = 'sb-'+ref+'-auth-token';
  localStorage.removeItem(key);
  if (role !== 'anonymous') localStorage.setItem(key, JSON.stringify({ access_token:token, refresh_token:'mock', expires_in:3600, expires_at:exp, token_type:'bearer', user }));
  const now = new Date().toISOString();
  const data = window.qaData = {
    lists:[{id:first,tag:'Engineering Updates',institution,hashtags:['Research Opportunities','Internships & Co-ops'],created_at:now},{id:second,tag:'Campus Events',institution,hashtags:['Events & Networking'],created_at:now}],
    senders:[{id:'40000000-0000-4000-8000-000000000001',list_id:first,sender_email:'engineering@university.edu',created_at:now}],
    admins:[{user_id:'profile-owner',institution_id:institution,role:'owner',email:user.email,created_at:now}],
    requests:[],
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!url.hostname.endsWith('.supabase.co')) return originalFetch(input,options);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const headers = new Headers(options.headers);
    const single = (headers.get('accept') || '').includes('object');
    const query = url.searchParams;
    data.requests.push({path:url.pathname,method,body});
    const reply = value => new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
    if (url.pathname === '/auth/v1/user') return reply(user);
    if (url.pathname === '/auth/v1/logout') return reply({});
    if (url.pathname.endsWith('/users')) return reply(single ? {id:'profile-owner'} : [{id:'profile-owner'}]);
    if (url.pathname.endsWith('/institutions')) return reply({id:institution,name:'College of Engineering'});
    if (url.pathname.endsWith('/institution_admins')) {
      if (method === 'DELETE') { const id=query.get('user_id')?.slice(3); const removed=data.admins.filter(item=>item.user_id===id && item.role==='admin'); data.admins=data.admins.filter(item=>!removed.includes(item)); return reply(single ? removed[0] : removed); }
      return reply(role === 'student' ? [] : [{user_id:'profile-owner',institution_id:institution,role,institutions:{name:'College of Engineering'}}]);
    }
    if (url.pathname.endsWith('/rpc/admin_dashboard_counts')) return reply({lists:data.lists.length,senders:data.senders.length,administrators:data.admins.length});
    if (url.pathname.endsWith('/rpc/admin_institution_roster')) return reply(data.admins);
    if (url.pathname.endsWith('/rpc/assign_institution_admin_by_email')) { data.admins.push({user_id:'profile-staff',institution_id:institution,role:'admin',email:body.p_email,created_at:now}); return reply(null); }
    if (url.pathname.endsWith('/rpc/get_user_feed')) return reply({posts:[],hasMore:false,nextCursor:null});
    if (url.pathname.endsWith('/email_posts')) return reply([{id:'post1',title:'Research applications open',caption:'Explore campus research opportunities.',hashtags:['Research Opportunities'],status:'published',created_at:now}]);
    const table = url.pathname.endsWith('/list_senders') ? 'senders' : url.pathname.endsWith('/list') ? 'lists' : null;
    if (!table) throw new Error('Blocked unexpected Supabase request: '+url.pathname);
    const id=query.get('id')?.slice(3);
    const matches = item => (!id || item.id===id) && (!query.get('list_id') || item.list_id===query.get('list_id').slice(3));
    let rows=data[table].filter(matches);
    if (method==='POST') { const row={id:table==='lists'?'30000000-0000-4000-8000-000000000003':'40000000-0000-4000-8000-000000000002',created_at:now,...body}; data[table].push(row); rows=[row]; }
    if (method==='PATCH') { for(const row of rows) Object.assign(row,body); }
    if (method==='DELETE') data[table]=data[table].filter(row=>!rows.includes(row));
    if (table==='senders') rows=rows.map(row=>({...row,list:{institution}}));
    return reply(single ? rows[0] : rows);
  };
}.toString()})(${JSON.stringify(ref)});`;
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Network.enable');
// This also blocks requests if an unexpected transport bypasses the fetch mock.
await cdp('Network.setBlockedURLs', { urls:['*://*.supabase.co/*'] });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source:preload });
await cdp('Storage.clearDataForOrigin', { origin:new URL(appUrl).origin, storageTypes:'local_storage' });
await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await cdp('Page.navigate', { url:appUrl+'#/admin/overview' });
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Research applications open")');
assert.ok(await evaluate('document.body.innerText.includes("College of Engineering")'));
assert.ok(await evaluate('!![...document.querySelectorAll("a")].find(a=>a.textContent.includes("Administrators"))'));
await click('Mailing Lists');
await waitFor('document.body.innerText.includes("Engineering Updates")');
await click('+ Create mailing list');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input','Student Research');
await submit();
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Student Research")');
await click('Edit list & topics');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('input[aria-label="New topic label"]',' Research Opportunities ');
await click('Add label');
await fill('input[aria-label="New topic label"]','research opportunities');
await click('Add label');
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("already included")'));
await click('Save changes');
await waitFor('!document.querySelector("dialog[open]")');
assert.deepEqual(await evaluate('window.qaData.lists.find(l=>l.tag==="Student Research").hashtags'),['Research Opportunities']);
await click('+ Add sender');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input','Research@University.edu');
await submit();
await waitFor('!document.querySelector("dialog[open]")');
assert.equal(await evaluate('window.qaData.senders.find(s=>s.sender_email.includes("research")).sender_email'),'research@university.edu');
await click('Edit / move');
await waitFor('!!document.querySelector("dialog[open]")');
await evaluate(`(() => {const select=document.querySelector('dialog select');select.value='30000000-0000-4000-8000-000000000002';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await click('Save changes');
await waitFor('!document.querySelector("dialog[open]")');
assert.equal(await evaluate('window.qaData.senders.find(s=>s.sender_email==="research@university.edu").list_id'),'30000000-0000-4000-8000-000000000002');
await click('Administrators');
await waitFor('document.body.innerText.includes("owner@university.edu") && !!document.querySelector(".senderList")');
await click('+ Add administrator');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input','Staff@University.edu');
await submit();
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("staff@university.edu")');
await click('Remove');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Remove administrator');
await waitFor('!document.querySelector("dialog[open]") && !document.body.innerText.includes("staff@university.edu")');
await route('/admin/lists/30000000-0000-4000-8000-000000000001');
await waitFor('document.body.innerText.includes("engineering@university.edu") && !!document.querySelector(".senderList")');
await click('Remove');
await waitFor('!!document.querySelector("dialog[open]")');
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("Historical posts will remain unchanged")'));
await click('Cancel');
assert.equal(await evaluate('window.qaData.senders.length'),2,'Cancel preserves sender mapping');
await click('Remove');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Remove sender');
await waitFor('!document.querySelector("dialog[open]")');
assert.equal(await evaluate('window.qaData.senders.length'),1,'Confirmed sender removal succeeds');
await route('/admin/lists/30000000-0000-4000-8000-000000000003');
await waitFor('document.body.innerText.includes("Student Research") && document.body.innerText.includes("Delete list")');
await click('Delete list');
await waitFor('!!document.querySelector("dialog[open]")');
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("student subscriptions will be deleted")'));
await click('Cancel');
assert.equal(await evaluate('window.qaData.lists.length'),3,'Cancel preserves mailing list');
await click('Delete list');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Delete mailing list');
await waitFor('!document.querySelector("dialog[open]") && window.qaData.lists.length === 2');
await route('/admin/lists');
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await waitFor('document.body.innerText.includes("Engineering Updates")');
assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Mobile page does not overflow horizontally');
await click('+ Create mailing list');
await waitFor('!!document.querySelector("dialog[open]")');
assert.ok(await evaluate('document.querySelector("dialog").getBoundingClientRect().width <= window.innerWidth'),'Mobile modal fits viewport');
await fs.writeFile('/tmp/aggie-fetch-mobile.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
await click('Cancel');
await evaluate('localStorage.setItem("qa-role","admin")');
await cdp('Page.navigate', { url:appUrl+'#/admin/administrators' });
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Owner access required")');
assert.equal(await evaluate('[...document.querySelectorAll("nav a")].some(a=>a.textContent.includes("Administrators"))'),false);
await evaluate('localStorage.setItem("qa-role","student")');
await cdp('Page.navigate', { url:appUrl+'#/admin/lists' });
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Administrator access required")');
await evaluate('localStorage.setItem("qa-role","anonymous")');
await cdp('Page.navigate', { url:appUrl+'#/admin/overview' });
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Welcome to fetchy.")');
assert.deepEqual(runtimeErrors,[],'No unhandled browser exceptions');
console.log('PASS: desktop overview, list creation, topic validation/save, sender add/move/remove, confirmed/cancelled list deletion, owner add/remove, mobile layout/dialog, admin owner-route denial, student denial, and unauthenticated login. API calls mocked; no live records changed.');
socket.close();
