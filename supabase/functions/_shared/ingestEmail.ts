import { classifyEmail } from './classifyEmail.ts';
import { persistAttachments } from './attachments.ts';

// A single provider delivery produces independent, RLS-scoped posts for its original approved lists.
export async function ingestEmail(db:any,emailId:string,raw:any,receivedAt:string|null,attachments:unknown,apiKey:string,adapters={classifyEmail,persistAttachments}){
 const sender=(String(raw.from).match(/<([^<>]+)>/)?.[1]??String(raw.from)).trim().toLowerCase();
 let {data:delivery,error:deliveryError}=await db.from('email_deliveries').select('list_ids').eq('email_id',emailId).maybeSingle();
 if(deliveryError)throw deliveryError;
 if(!delivery){
  const {data:providerRows,error:oldError}=await db.from('email_posts').select('list_id').eq('provider_email_id',emailId);
  if(oldError)throw oldError;
  let old=providerRows??[];
  if(!old.length){const legacy=await db.from('email_posts').select('list_id').eq('email_id',emailId).maybeSingle();if(legacy.error)throw legacy.error;if(legacy.data)old=[legacy.data];}
  let ids:string[]=[];
  if(old?.length)ids=[...new Set<string>(old.map((p:any)=>p.list_id).filter(Boolean))];
  else{
   const {data:routes,error}=await db.from('list_senders').select('list_id').eq('sender_email',sender);
   if(error)throw error;ids=[...new Set<string>((routes??[]).map((r:any)=>r.list_id))];
  }
  const {error}=await db.from('email_deliveries').upsert({email_id:emailId,list_ids:ids},{onConflict:'email_id',ignoreDuplicates:true});
  if(error)throw error;
  const saved=await db.from('email_deliveries').select('list_ids').eq('email_id',emailId).single();
  if(saved.error)throw saved.error;delivery=saved.data;
 }
 const results:any[]=[];let retry=false;const classifications=new Map<string,any>();
 for(const listId of delivery.list_ids.length?delivery.list_ids:[null]){
  try{
   let institutionId:string|null=null;let topics:string[]=[];let timezone=Deno.env.get('INSTITUTION_TIMEZONE')||'America/New_York';
   if(listId){
    const {data:list,error}=await db.from('list').select('institution').eq('id',listId).maybeSingle();
    if(error)throw error;
    if(!list){results.push({list_id:listId,status:'list_removed'});continue;}
    institutionId=list.institution;
    const {data:institution,error:institutionError}=await db.from('institutions').select('timezone,hashtags').eq('id',institutionId).single();
    if(institutionError||!institution?.timezone)throw new Error('Institution settings unavailable');
    timezone=institution.timezone;topics=institution.hashtags??[];
   }
   let lookup=db.from('email_posts').select('id,email_id,status,attachments,updated_at').eq('provider_email_id',emailId);
   lookup=listId?lookup.eq('list_id',listId):lookup.is('list_id',null);
   let {data:existing,error:existingError}=await lookup.order('created_at').limit(1).maybeSingle();
   if(existingError)throw existingError;
   if(!existing){
    let legacy=db.from('email_posts').select('id,email_id,status,attachments,updated_at').eq('email_id',emailId);legacy=listId?legacy.eq('list_id',listId):legacy.is('list_id',null);
    const result=await legacy.maybeSingle();if(result.error)throw result.error;existing=result.data;
   }
   const key=existing?.email_id??`${emailId}:${listId??'unrouted'}`;
   if(!existing){
    const inserted=await db.from('email_posts').upsert({email_id:key,provider_email_id:emailId,list_id:listId,institution_id:institutionId,sender:raw.from,subject:raw.subject,raw_email:raw,received_at:receivedAt,status:'received',updated_at:new Date().toISOString()},{onConflict:'email_id',ignoreDuplicates:true});
    if(inserted.error)throw inserted.error;
   }
   const loaded=await db.from('email_posts').select('id,status,attachments,updated_at').eq('email_id',key).single();
   if(loaded.error)throw loaded.error;const post=loaded.data;
   if(post.status==='processing'&&Date.now()-Date.parse(post.updated_at)<10*60*1000){retry=true;results.push({list_id:listId,status:'processing'});continue;}
   let status=post.status;
   if(['received','failed','processing'].includes(status)){
    const claimedAt=new Date().toISOString();
    const claim=await db.from('email_posts').update({status:'processing',updated_at:claimedAt,error_message:null}).eq('id',post.id).eq('status',post.status).eq('updated_at',post.updated_at).select('id').maybeSingle();
    if(claim.error||!claim.data){retry=true;results.push({list_id:listId,status:'busy'});continue;}
    try{
     const cacheKey=institutionId??'unrouted';
     let classified=classifications.get(cacheKey);
     if(!classified){classified=await adapters.classifyEmail(raw,receivedAt,topics,timezone);if('error' in classified)throw new Error(classified.error);classifications.set(cacheKey,classified);}
     status=listId&&institutionId?'published':'draft';
     const saved=await db.from('email_posts').update({...classified,status,error_message:null,updated_at:new Date().toISOString()}).eq('id',post.id).eq('status','processing').eq('updated_at',claimedAt).select('id').maybeSingle();
     if(saved.error||!saved.data)throw new Error('Email changed while processing');
    }catch(error){
     status='failed';
     await db.from('email_posts').update({status:'failed',error_message:String(error).slice(0,500),updated_at:new Date().toISOString()}).eq('id',post.id).eq('status','processing').eq('updated_at',claimedAt);
    }
   }
   const stored=await adapters.persistAttachments(db,post.id,institutionId,emailId,attachments,apiKey,post.attachments);
   retry=retry||stored.retry;results.push({list_id:listId,status,attachments:stored.retry?'retry':'stored'});
  }catch{retry=true;results.push({list_id:listId,status:'retry'});}
 }
 return {received:true,email_id:emailId,posts:results,retry};
}
