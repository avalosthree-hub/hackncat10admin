import test from 'node:test';
import assert from 'node:assert/strict';
import {ingestEmail} from '../supabase/functions/_shared/ingestEmail.ts';
function fakeDatabase(){
 const state={email_deliveries:[],email_posts:[],list_senders:[{list_id:'list-a',sender_email:'sender@example.edu'},{list_id:'list-b',sender_email:'sender@example.edu'}],list:[{id:'list-a',institution:'institution'},{id:'list-b',institution:'institution'}],institutions:[{id:'institution',timezone:'America/New_York',hashtags:['Research','Events']}]};let sequence=0;
 return {state,from(table){let action='select',payload,options={},filters=[];
  const query={select(){return query;},eq(key,value){filters.push(row=>row[key]===value);return query;},is(key,value){filters.push(row=>(row[key]??null)===value);return query;},order(){return query;},limit(){return query;},upsert(value,opts){action='upsert';payload=value;options=opts;return query;},update(value){action='update';payload=value;return query;},maybeSingle(){return execute(true);},single(){return execute(true);},then(resolve,reject){return execute(false).then(resolve,reject);}};
  async function execute(single){
   let rows=state[table].filter(row=>filters.every(f=>f(row)));
   if(action==='upsert'){
    const key=options.onConflict;const found=state[table].find(row=>row[key]===payload[key]);
    if(!found){const row={id:'post-'+(++sequence),attachments:[],...payload};state[table].push(row);rows=[row];}else rows=[found];
   }
   if(action==='update')rows.forEach(row=>Object.assign(row,payload));
   return {data:single?rows[0]??null:rows,error:null};
  }
  return query;
 }};
}
function setup(t){const old=globalThis.Deno;globalThis.Deno={env:{get:()=>undefined}};t.after(()=>{if(old===undefined)delete globalThis.Deno;else globalThis.Deno=old;});}
const raw={subject:'Research',text:'Research event',html:'',from:'Sender <sender@example.edu>'};
test('one incoming email publishes into every approved list and classifies once per institution',async t=>{
 setup(t);const db=fakeDatabase();let calls=0;const adapters={classifyEmail:async()=>{calls++;return {title:'Research',hashtags:['Research']};},persistAttachments:async()=>({retry:false})};
 const first=await ingestEmail(db,'provider-email',raw,'2026-11-15T15:00:00Z',[],'test-key',adapters);
 assert.equal(first.retry,false);assert.equal(db.state.email_posts.length,2);assert.equal(calls,1);
 assert.deepEqual(db.state.email_posts.map(p=>p.list_id),['list-a','list-b']);assert.ok(db.state.email_posts.every(p=>p.status==='published'));
 // Later approvals do not backfill a previous delivery.
 db.state.list_senders.push({list_id:'list-c',sender_email:'sender@example.edu'});
 await ingestEmail(db,'provider-email',raw,'2026-11-15T15:00:00Z',[],'test-key',adapters);
 assert.equal(db.state.email_posts.length,2);assert.equal(calls,1);
});
test('legacy published mail remains in its original list and is not reclassified on retry',async t=>{
 setup(t);const db=fakeDatabase();db.state.email_posts.push({id:'legacy',email_id:'old-provider',list_id:'list-a',status:'published',attachments:[]});
 const result=await ingestEmail(db,'old-provider',raw,null,[],'test-key',{classifyEmail:async()=>{throw new Error('Must not classify old mail');},persistAttachments:async()=>({retry:false})});
 assert.equal(result.retry,false);assert.equal(db.state.email_posts.length,1);assert.equal(db.state.email_posts[0].status,'published');assert.equal(db.state.email_posts[0].provider_email_id,undefined);
});
