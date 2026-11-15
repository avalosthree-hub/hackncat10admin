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
  if (data.method === 'Runtime.exceptionThrown') runtimeErrors.push(data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
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
    events:[{id:'50000000-0000-4000-8000-000000000001',institution_id:institution,list_id:first,source_type:'derived',source_email_post_id:'post1',source_event_key:'original',title:'AI research showcase',description:'Meet campus researchers.',starts_at:null,ends_at:null,event_date:null,timezone:'America/New_York',location_name:null,location_address:null,online_url:null,registration_url:null,rsvp_enabled:false,capacity:null,status:'published',admin_locked:false,evidence:{extraction:{text:'Join the showcase',confidence:'model_extracted'}},verification:'incomplete',cancelled_at:null,cancellation_reason:null,created_at:now,updated_at:now}],
    topics:['Research Opportunities','Internships & Co-ops'],
    directory:[{id:'directory1',institution_id:institution,sender_email:'engineering@university.edu',created_at:now}],
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
    if (url.pathname.endsWith('/institutions')) return reply({id:institution,name:'College of Engineering',hashtags:data.topics});
    if (url.pathname.endsWith('/institution_admins')) {
      if (method === 'DELETE') { const id=query.get('user_id')?.slice(3); const removed=data.admins.filter(item=>item.user_id===id && item.role==='admin'); data.admins=data.admins.filter(item=>!removed.includes(item)); return reply(single ? removed[0] : removed); }
      return reply(role === 'student' ? [] : [{user_id:'profile-owner',institution_id:institution,role,institutions:{name:'College of Engineering'}}]);
    }
    if (url.pathname.endsWith('/rpc/admin_dashboard_counts')) return reply({lists:data.lists.length,senders:data.senders.length,administrators:data.admins.length});
    if (url.pathname.endsWith('/rpc/admin_institution_roster')) return reply(data.admins);
    if (url.pathname.endsWith('/rpc/assign_institution_admin_by_email')) { data.admins.push({user_id:'profile-staff',institution_id:institution,role:'admin',email:body.p_email,created_at:now}); return reply(null); }
    if (url.pathname.endsWith('/rpc/admin_derived_event_queue')) {
      const rows=data.events.filter(e=>e.source_type==='derived'&&e.institution_id===body.p_institution&&(!body.p_list||e.list_id===body.p_list)&&(!body.p_search||e.title.toLowerCase().includes(body.p_search.toLowerCase())));
      return reply({events:rows.slice((body.p_page||0)*12,(body.p_page||0)*12+12),total:rows.length,metrics:rows.map(e=>({event_id:e.id,going:1,interested:2,not_going:0}))});
    }
    if (url.pathname.endsWith('/rpc/admin_remove_institution_sender')) {const row=data.directory.find(s=>s.id===body.p_sender);if(row){data.directory=data.directory.filter(s=>s.id!==row.id);data.senders=data.senders.filter(s=>s.sender_email!==row.sender_email);}return reply(null);}
    if (url.pathname.endsWith('/rpc/admin_set_institution_topics')) { data.topics=body.p_topics;return reply(data.topics); }
    if (url.pathname.includes('/storage/v1/object/sign/')) return reply({signedURL:'/object/sign/email-attachments/test?token=mock'});
    if (url.pathname.includes('/storage/v1/object/sign')) return new Response('PDF',{status:200});
    if (url.pathname.endsWith('/rpc/admin_event_metrics')) return reply(body.p_events.map(event_id=>({event_id,going:1,interested:2,not_going:0})));
    if (url.pathname.endsWith('/rpc/admin_event_attendees')) return reply({attendees:[{email:'student@university.edu',status:'going',updated_at:now}],hasMore:false});
    if (url.pathname.endsWith('/rpc/admin_event_original')) return reply({title:'Original announcement',sender:'campus@university.edu',attachments:[{id:'file',name:'flyer.pdf',status:'stored',size:3,storage_path:institution+'/'+body.p_event+'/file'}],raw_email:body.p_event.endsWith('4')?{html:'<p>Join the showcase</p><script>window.emailExecuted=true</script>'}:{text:'Join   the showcase\n<script>window.emailExecuted=true</script>'},event_times:[]});
    if (url.pathname.endsWith('/rpc/admin_event_timestamp')) return reply(body.p_local ? new Date(body.p_local+'-05:00').toISOString() : null);
    if (url.pathname.endsWith('/rpc/admin_create_event')) { const row={id:'50000000-0000-4000-8000-'+String(data.events.length+1).padStart(12,'0'),institution_id:institution,list_id:body.p_list,source_type:'curated',source_email_post_id:null,source_event_key:null,evidence:{},admin_locked:true,cancelled_at:null,cancellation_reason:null,event_date:null,created_at:now,updated_at:now,...body.p_fields};data.events.push(row);return reply(row.id); }
    if (url.pathname.endsWith('/events')) {
      let rows=data.events.filter(e=>(!query.get('id')||e.id===query.get('id').slice(3))&&(!query.get('source_type')||e.source_type===query.get('source_type').slice(3))&&(!query.get('status')||e.status===query.get('status').slice(3))&&(!query.get('list_id')||e.list_id===query.get('list_id').slice(3))&&(!query.get('cancelled_at')|| (query.get('cancelled_at')==='is.null' ? !e.cancelled_at : !!e.cancelled_at)));
      if(query.get('title')) rows=rows.filter(e=>e.title.toLowerCase().includes(query.get('title').slice(7,-1).toLowerCase()));
      if(method==='PATCH') for(const row of rows) Object.assign(row,body,{admin_locked:true,updated_at:new Date().toISOString(),...(body.cancelled_at?{rsvp_enabled:false}:{})});
      if(method==='DELETE') data.events=data.events.filter(e=>!rows.includes(e));
      return new Response(JSON.stringify(single?rows[0]:rows),{status:200,headers:{'content-type':'application/json','content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
    }
    if (url.pathname.endsWith('/rpc/get_user_feed')) return reply({posts:[],hasMore:false,nextCursor:null});
    if (url.pathname.endsWith('/email_posts')) return reply([{id:'post1',title:'Research applications open',caption:'Explore campus research opportunities.',hashtags:['Research Opportunities'],status:'published',created_at:now}]);
    const table = url.pathname.endsWith('/institution_senders') ? 'directory' : url.pathname.endsWith('/list_senders') ? 'senders' : url.pathname.endsWith('/list') ? 'lists' : null;
    if (!table) throw new Error('Blocked unexpected Supabase request: '+url.pathname);
    const id=query.get('id')?.slice(3);
    const matches = item => (!id || item.id===id) && (!query.get('list_id') || item.list_id===query.get('list_id').slice(3));
    let rows=data[table].filter(matches);
    if (method==='POST') { rows=(Array.isArray(body)?body:[body]).map(value=>{const row={id:table==='lists'?'30000000-0000-4000-8000-000000000003':'40000000-0000-4000-8000-'+String(data[table].length+2).padStart(12,'0'),created_at:now,...value};data[table].push(row);if(table==='senders'&&!data.directory.some(s=>s.sender_email===row.sender_email))data.directory.push({id:'directory'+(data.directory.length+1),institution_id:institution,sender_email:row.sender_email,created_at:now});return row;}); }

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
const initialUrl=new URL(appUrl);initialUrl.searchParams.set('qa-run',String(Date.now()));initialUrl.hash='/admin/overview';
await cdp('Page.navigate', { url:initialUrl.href });
await waitFor('document.body.innerText.includes("Research applications open")');
assert.ok(await evaluate('document.body.innerText.includes("College of Engineering")'));
assert.ok(await evaluate('!![...document.querySelectorAll("a")].find(a=>a.textContent.includes("Administrators"))'));
await click('Mailing Lists');
await waitFor('document.body.innerText.includes("Engineering Updates")');
await click('+ Create mailing list');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input','Student Research');
await evaluate(`(() => {const el=document.querySelector('dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Research opportunities for students.');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await submit();
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Student Research")');
assert.ok(await evaluate('document.body.innerText.includes("Research opportunities for students.")'));
await click('Edit list');
await waitFor('!!document.querySelector("dialog textarea")');
await evaluate(`(() => {const el=document.querySelector('dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Scholarships and lab openings.');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await click('Save changes');
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Scholarships and lab openings.")');
await click('← All mailing lists');
await waitFor('!!document.querySelector(".listSearch input")');
await fill('.listSearch input','Scholarships and lab openings');
assert.ok(await evaluate('document.body.innerText.includes("Student Research")'));
assert.ok(await evaluate('!document.querySelector(".listCards").innerText.includes("Engineering Updates")'));
await click('Student Research');
await waitFor('document.body.innerText.includes("Registered sender addresses")');

await click('Institution Topics');
await waitFor(`!!document.querySelector('input[aria-label="New topic label"]')`);
await fill('input[aria-label="New topic label"]',' Campus Life ');
await click('Add label');
await fill('input[aria-label="New topic label"]','campus life');
await click('Add label');
assert.ok(await evaluate('document.body.innerText.includes("already included")'));
await click('Save institution topics');
await waitFor('document.body.innerText.includes("Institution topics saved")');
assert.ok(await evaluate('window.qaData.topics.includes("Campus Life")'));
assert.deepEqual(await evaluate('window.qaData.lists.find(l=>l.tag==="Student Research").hashtags'),[]);
await route('/admin/lists/'+await evaluate('window.qaData.lists.find(l=>l.tag==="Student Research").id'));
await waitFor('document.body.innerText.includes("Registered sender addresses")');
await click('+ Add sender');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Add new address');
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
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("historical posts stay unchanged")'));
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
assert.ok(await evaluate('[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="Delete mailing list").disabled'));
await fill('dialog input[aria-label="Confirm mailing list name"]','student research');
assert.ok(await evaluate('[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="Delete mailing list").disabled'));
await fill('dialog input[aria-label="Confirm mailing list name"]','Student Research');
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
// Event administration uses the same real React UI and isolated fetch fixtures.
await route('/admin/events');
await waitFor('document.body.innerText.includes("AI research showcase")');
assert.ok(await evaluate('document.body.innerText.includes("Date and time unconfirmed")'));
await click('Derived Events');
await waitFor('document.body.innerText.includes("Projected attendance: 1–3")');
assert.ok(await evaluate(`window.qaData.requests.some(r=>r.path.endsWith('/rpc/admin_derived_event_queue')&&r.body.p_page===0)`));

assert.ok(await evaluate('document.body.innerText.includes("Early traction")'));
await click('All Events');
await waitFor('document.body.innerText.includes("AI research showcase")');

await click('Manage event & RSVPs →');
await waitFor('document.body.innerText.includes("student@university.edu")');
await click('View authorized original email');
await waitFor('document.body.innerText.includes("Original announcement")');
await click('Edit event');
await waitFor('!!document.querySelector("dialog form")');
await fill('dialog input','Corrected research showcase');
await submit();
await waitFor('document.querySelector("dialog").innerText.includes("Preview event")');
await click('Save as draft');
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Corrected research showcase")');
assert.equal(await evaluate('window.qaData.events[0].source_email_post_id'),'post1');
assert.ok(await evaluate('window.qaData.events[0].admin_locked'));
// Cancelling claim review leaves the derived event unchanged.
await click('Claim event');
await waitFor('!!document.querySelector("dialog form")');
await click('Close');
assert.equal(await evaluate('window.qaData.events[0].source_type'),'derived');
await click('Claim event');
await waitFor('!!document.querySelector("dialog form")');
assert.ok(await evaluate(`document.querySelector('dialog input[type="datetime-local"]').required`));
await fill('dialog input[type="datetime-local"]','2027-01-20T13:00');
await submit();
await waitFor('!![...document.querySelectorAll("dialog button")].find(el=>el.textContent==="Confirm and claim event")');
assert.ok(await evaluate('[...document.querySelectorAll("dialog button")].find(el=>el.textContent==="Confirm and claim event").disabled'));
await evaluate(`document.querySelector('dialog input[type="checkbox"]').click()`);
await click('Confirm and claim event');
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Claimed event source")');
assert.equal(await evaluate('window.qaData.events[0].source_type'),'curated');
assert.equal(await evaluate('window.qaData.events[0].status'),'draft');
assert.equal(await evaluate('window.qaData.events[0].source_email_post_id'),'post1');
assert.ok(await evaluate('!document.body.innerText.includes("Claim event")'));

await click('+ Create event');
await waitFor('!!document.querySelector("dialog form")');
assert.ok(await evaluate('document.querySelector("dialog").getBoundingClientRect().width <= innerWidth'));
await fill('dialog input','Engineering Networking Night');
await evaluate(`(() => {const el=document.querySelector('dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Connect with engineers and employers.');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await fill('dialog input[type="datetime-local"]','2027-01-20T13:00');
await fill('dialog input[type="url"]','https://university.edu/meeting');
await fill('dialog input[type="number"]','50');
await submit();
await waitFor('document.querySelector("dialog").innerText.includes("Preview event")');
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("Internal RSVPs disabled")'));
await fs.writeFile('/tmp/aggie-fetch-event-mobile.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
await click('Publish event');
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Engineering Networking Night") && document.body.innerText.includes("RSVP overview")');
assert.equal(await evaluate('window.qaData.events[1].starts_at'),'2027-01-20T18:00:00.000Z');
await click('Cancel event');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Back');
assert.equal(await evaluate('window.qaData.events[1].cancelled_at'),null);
await click('Cancel event');
await waitFor('!!document.querySelector("dialog[open]")');
await click('Confirm');
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("Historical RSVPs are retained")');
assert.equal(await evaluate('window.qaData.events[1].status'),'withdrawn');
assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'Mobile event detail fits');
await route('/admin/events');
await waitFor('document.body.innerText.includes("Cancelled Events")');
await click('Cancelled Events');
await waitFor('document.body.innerText.includes("Engineering Networking Night") && !document.body.innerText.includes("Corrected research showcase")');
await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await fs.writeFile('/tmp/aggie-fetch-event-desktop.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
// Event Review is a separate workspace; denial only skips this session.
await evaluate(`(() => {
 const base=window.qaData.events[0];
 for(const [suffix,title] of [['3','Skip review event'],['4','Approve review event']])
 window.qaData.events.push({...base,id:'50000000-0000-4000-8000-00000000000'+suffix,source_type:'derived',status:'published',title,starts_at:'2027-01-20T18:00:00Z',ends_at:null,cancelled_at:null});
})()`);
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await click('Event Review');
await waitFor('!!document.querySelector(".reviewEditor form")');
assert.ok(await evaluate(`!!document.querySelector('.reviewCardHeader .eventBadges .attendanceChip')`));
await waitFor('!!document.querySelector(".sourceEmailBody mark")');
assert.equal(await evaluate('document.querySelector(".sourceEmailBody mark").textContent'),'Join   the showcase');
assert.equal(await evaluate('!!window.emailExecuted'),false,'Email content remains inert');
assert.ok(await evaluate('document.querySelector(".reviewSource").innerText.includes("flyer.pdf")'));
await evaluate(`document.querySelector('.reviewSource .attachmentDownload').click()`);
await waitFor('window.qaData.requests.some(r=>r.path.includes("/storage/v1/object/sign/"))');
assert.ok(await evaluate('document.querySelector(".sourceEmail").innerText.includes("campus@university.edu")'));

await fill('.reviewEditor input','Unsaved skipped correction');
await evaluate(`document.querySelector('.reviewEditor form').requestSubmit()`);
await waitFor('!!document.querySelector(".swipeSurface")');
async function reviewSwipe(dx,touch=false) {
 const point=await evaluate(`(() => {document.querySelector('.swipeContent h3').scrollIntoView({block:'center'});const r=document.querySelector('.swipeContent h3').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 if(touch){
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+dx,y:point.y}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return;
 }
 await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx,y:point.y,button:'left',buttons:1});
 await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y,button:'left',buttons:0,clickCount:1});
}
assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'Mobile review fits');
await fs.writeFile('/tmp/aggie-fetch-review-mobile.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
await reviewSwipe(-120,true);
await waitFor('document.querySelector(".reviewEditor input")?.value==="Approve review event"');
await waitFor('!!document.querySelector(".sourceEmailBody mark")');
assert.equal(await evaluate('document.querySelector(".sourceEmailBody mark").textContent'),'Join the showcase');
assert.ok(await evaluate('!document.querySelector(".sourceEmailBody").innerText.includes("window.emailExecuted")'),'HTML scripts excluded from readable email');
assert.equal(await evaluate('!!window.emailExecuted'),false);
assert.equal(await evaluate('window.qaData.events[2].title'),'Skip review event');
assert.equal(await evaluate('window.qaData.events[2].status'),'published');
assert.equal(await evaluate('window.qaData.events[2].source_type'),'derived');
await fill('.reviewEditor input','Approved edited title');
await evaluate(`(() => {const el=document.querySelector('.reviewEditor select[aria-label="Event timing"]');el.value='date_only';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await fill('.reviewEditor input[type="date"]','2027-01-20');
await evaluate(`document.querySelector('.reviewEditor form').requestSubmit()`);
await waitFor('!!document.querySelector(".swipeSurface")');
await reviewSwipe(120);
assert.equal(await evaluate('window.qaData.events[3].source_type'),'derived','Approval requires verification');
await evaluate(`document.querySelector('.reviewEditor input[type="checkbox"]').click()`);
await reviewSwipe(120);
await waitFor('document.body.innerText.includes("You’re caught up")');
assert.equal(await evaluate('window.qaData.events[3].source_type'),'curated');
assert.equal(await evaluate('window.qaData.events[3].status'),'published');
assert.equal(await evaluate('window.qaData.events[3].title'),'Approved edited title');
assert.equal(await evaluate('window.qaData.events[3].starts_at'),null);
assert.equal(await evaluate('window.qaData.events[3].event_date'),'2027-01-20');
assert.equal(await evaluate('window.qaData.events[3].schedule_type'),'date_only');
await click('Start a new review session');
await waitFor('document.querySelector(".reviewEditor input")?.value==="Skip review event"');
// New all-day and end-date-only events need no midnight timestamps.
for(const [mode,title,startDate,endDate] of [['all_day','All day campus fair','2027-01-20','2027-01-22'],['end_date_only','Applications close','','2027-01-25']]){
 await route('/admin/events');
 await waitFor('!![...document.querySelectorAll("button")].find(el=>el.textContent==="+ Create event")');
 await click('+ Create event');
 await waitFor('!!document.querySelector("dialog form")');
 await fill('dialog input',title);
 await evaluate(`(() => {const el=document.querySelector('dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Announcement without a stated time.');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await evaluate(`(() => {const el=document.querySelector('dialog select[aria-label="Event timing"]');el.value=${JSON.stringify(mode)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 if(startDate)await fill('dialog input[type="date"]',startDate);
 await evaluate(`(() => {const inputs=[...document.querySelectorAll('dialog input[type="date"]')];const el=inputs[inputs.length-1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(endDate)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await submit();
 await waitFor('document.querySelector("dialog")?.innerText.includes("Preview event")');
 assert.ok(await evaluate(`document.querySelector('dialog').innerText.includes(${JSON.stringify(mode==='all_day'?'All day':'time not specified')})`));
 await click('Publish event');
 await waitFor('!document.querySelector("dialog[open]")');
 assert.equal(await evaluate('window.qaData.events.at(-1).starts_at'),null);
 assert.equal(await evaluate('window.qaData.events.at(-1).ends_at'),null);
 assert.equal(await evaluate('window.qaData.events.at(-1).schedule_type'),mode);
 assert.equal(await evaluate('window.qaData.events.at(-1).event_end_date'),endDate);
}
// Institution directory selection reuses an address across lists without retyping it.
await route('/admin/senders');
await waitFor('document.body.innerText.includes("Save addresses once")');
await fill('input[type="search"]','research');
assert.ok(await evaluate('document.body.innerText.includes("research@university.edu")'));
await route('/admin/lists/30000000-0000-4000-8000-000000000001');
await waitFor('document.body.innerText.includes("Registered sender addresses")');
await click('+ Add sender');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input[type="search"]','research');
await evaluate(`document.querySelector('dialog input[aria-label="research@university.edu"]').click()`);
await fill('dialog input[type="search"]','engineering');
await evaluate(`document.querySelector('dialog input[aria-label="engineering@university.edu"]').click()`);
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("2 selected")'));
assert.equal(await evaluate('getComputedStyle(document.querySelector(".senderChoiceText strong")).color'),'rgb(16, 42, 80)');
await fs.writeFile('/tmp/aggie-sender-picker.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
await submit();
await waitFor('!document.querySelector("dialog[open]")');
assert.equal(await evaluate('window.qaData.senders.filter(s=>s.sender_email==="research@university.edu").length'),2);
assert.equal(await evaluate('window.qaData.directory.filter(s=>s.sender_email==="research@university.edu").length'),1);
await route('/admin/senders');
await waitFor('document.body.innerText.includes("Save addresses once")');
await click('+ Save sender');
await waitFor('!!document.querySelector("dialog[open]")');
await fill('dialog input','faculty@university.edu');
await submit();
await waitFor('!document.querySelector("dialog[open]") && document.body.innerText.includes("faculty@university.edu")');
await evaluate(`document.querySelector('button[aria-label="Remove research@university.edu"]').click()`);
await waitFor('!!document.querySelector("dialog[open]")');
assert.ok(await evaluate('document.querySelector("dialog").innerText.includes("2 mailing lists")'));
await click('Cancel');
assert.equal(await evaluate('window.qaData.senders.filter(s=>s.sender_email==="research@university.edu").length'),2);
await evaluate(`document.querySelector('button[aria-label="Remove research@university.edu"]').click()`);
await waitFor('!!document.querySelector("dialog[open]")');
await click('Remove sender');
await waitFor('!document.querySelector("dialog[open]") && !window.qaData.directory.some(s=>s.sender_email==="research@university.edu")');
assert.equal(await evaluate('window.qaData.senders.filter(s=>s.sender_email==="research@university.edu").length'),0);
assert.ok(await evaluate('window.qaData.senders.some(s=>s.sender_email==="engineering@university.edu")'));

await evaluate('localStorage.setItem("qa-role","admin")');
await route('/admin/administrators');
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Owner access required")');
assert.equal(await evaluate('[...document.querySelectorAll("nav a")].some(a=>a.textContent.includes("Administrators"))'),false);
await evaluate('localStorage.setItem("qa-role","student")');
await route('/admin/lists');
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Administrator access required")');
await route('/admin/events');
await waitFor('document.body.innerText.includes("Administrator access required")');
await route('/admin/event-review');
await waitFor('document.body.innerText.includes("Administrator access required")');
await evaluate('localStorage.setItem("qa-role","anonymous")');
await route('/admin/overview');
await cdp('Page.reload', {ignoreCache:true});
await waitFor('document.body.innerText.includes("Welcome to fetchy.")');
assert.deepEqual(runtimeErrors,[],'No unhandled browser exceptions');
console.log('PASS: desktop overview, list description create/edit/search, saved sender multi-select/search/contrast, confirmed directory removal across lists, sender reuse across lists, list creation, topic validation/save, sender add/move/remove, confirmed/cancelled list deletion, owner add/remove, mobile layout/dialog, admin owner-route denial, student denial, and unauthenticated login. Event checks: derived RSVP priority/attendance chips, review/original email/correction, draft save, claim dismissal/verification/conversion, curated preview/publication/timezone, attendee metrics, cancellation confirmation, filters, mobile layout, student event-route denial, dedicated Event Review, automatic original email/evidence highlighting/inert HTML, touch/mouse swipes, verification-gated approval, unchanged visible skips, session restart, date-only swipe approval, all-day ranges, end-date-only creation and review-route denial. API calls mocked; no live records changed.');
socket.close();
