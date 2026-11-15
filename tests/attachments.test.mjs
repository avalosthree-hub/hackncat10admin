import test from 'node:test';
import assert from 'node:assert/strict';
import {persistAttachments,readAttachment,attachmentName,MAX_ATTACHMENT_BYTES} from '../supabase/functions/_shared/attachments.ts';
function database(previous=[]){
 const state={saved:previous,uploads:[]};
 const db={storage:{from:bucket=>({upload:async(path,bytes,options)=>{state.uploads.push({bucket,path,length:bytes.length,options});return {error:null};}})},from:table=>({update:value=>({eq:async()=>{state.saved=value.attachments;return {error:null};}})})};
 return {db,state};
}
test('incoming attachments upload to private storage with stable paths and retry idempotently',async t=>{
 const {db,state}=database();
 t.mock.method(globalThis,'fetch',async url=>String(url).includes('api.resend.com')?Response.json({download_url:'https://files.example.org/file'}):new Response('PDF'));
 const attachments=[{id:'provider-file-1',filename:'flyer.pdf',content_type:'application/pdf',size:3}];
 assert.equal((await persistAttachments(db,'post','institution','email',attachments,'test-key')).retry,false);
 assert.equal(state.uploads[0].path,'institution/post/provider-file-1');assert.equal(state.saved[0].status,'stored');
 assert.ok(!('url' in state.saved[0]));
 await persistAttachments(db,'post','institution','email',attachments,'test-key',state.saved);
 assert.equal(state.uploads.length,1);
});
test('transient attachment failures remain retryable and oversize files do not block smaller ones',async t=>{
 const {db,state}=database();t.mock.method(globalThis,'fetch',async()=>new Response('',{status:503}));
 assert.equal((await persistAttachments(db,'post','institution','email',[{id:'failed',filename:'notes.pdf'}],'key')).retry,true);
 assert.equal(state.saved[0].status,'failed');
 await persistAttachments(db,'post','institution','email',[{id:'large',size:MAX_ATTACHMENT_BYTES+1}],'key');
 assert.equal(state.saved[0].status,'too_large');
});
test('attachment byte limits are enforced while reading and filenames cannot become storage paths',async()=>{
 await assert.rejects(()=>readAttachment(new Response('too long'),3),RangeError);
 assert.equal(attachmentName('../evil\\name\u0000.pdf'),'.._evil_name_.pdf');
});
