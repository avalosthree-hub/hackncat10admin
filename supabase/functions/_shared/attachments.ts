export const ATTACHMENT_BUCKET='email-attachments';
export const MAX_ATTACHMENT_BYTES=20*1024*1024;
const MAX_EMAIL_BYTES=50*1024*1024;
const MAX_FILES=20;

export function attachmentName(value:unknown){return (typeof value==='string'?value:'Attachment').replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200)||'Attachment';}
export async function readAttachment(response:Response,limit=MAX_ATTACHMENT_BYTES){
 if(!response.ok||!response.body)throw new Error('Attachment download failed');
 if(Number(response.headers.get('content-length'))>limit)throw new RangeError('Attachment exceeds storage limit');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>limit){await reader.cancel();throw new RangeError('Attachment exceeds storage limit');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

// Called only for a verified incoming webhook. Provider URLs never reach the browser.
export async function persistAttachments(db:any,postId:string,institutionId:string|null,emailId:string,attachments:unknown,apiKey:string,previous:unknown=[]){
 const old=Array.isArray(previous)?previous:[];
 const incoming=Array.isArray(attachments)?attachments:[];
 if(!incoming.length)return {retry:false};
 const saved:any[]=[];let retry=false;let total=0;
 for(let index=0;index<incoming.length;index++){
  const item=incoming[index]??{};const id=String(item.id??'');
  const expectedPath=`${institutionId??'unrouted'}/${postId}/${id}`;
  const prior=old.find(a=>a?.id===id&&((a.status==='stored'&&a.storage_path===expectedPath)||['too_large','limit_exceeded','unavailable'].includes(a.status)));
  if(prior){saved.push(prior);total+=prior.status==='stored'?(Number(prior.size)||0):0;continue;}
  const entry:any={id,name:attachmentName(item.filename),filename:attachmentName(item.filename),content_type:typeof item.content_type==='string'?item.content_type:'application/octet-stream',size:Number(item.size)||0,status:'pending'};
  if(index>=MAX_FILES){saved.push({...entry,status:'limit_exceeded'});continue;}
  if(!/^[a-zA-Z0-9_-]+$/.test(id)){saved.push({...entry,status:'unavailable'});continue;}
  if(entry.size>MAX_ATTACHMENT_BYTES||total+entry.size>MAX_EMAIL_BYTES){saved.push({...entry,status:'too_large'});continue;}
  try{
   const metadataResponse=await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${apiKey}`},signal:AbortSignal.timeout(15000)});
   if(metadataResponse.status===404){saved.push({...entry,status:'unavailable'});continue;}
   if(!metadataResponse.ok)throw new Error('Provider attachment lookup failed');
   const metadata=await metadataResponse.json();const url=new URL(metadata.download_url);
   if(url.protocol!=='https:')throw new Error('Invalid provider download URL');
   const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
   const bytes=await readAttachment(response,Math.min(MAX_ATTACHMENT_BYTES,MAX_EMAIL_BYTES-total));
   const path=`${institutionId??'unrouted'}/${postId}/${id}`;
   const {error}=await db.storage.from(ATTACHMENT_BUCKET).upload(path,bytes,{contentType:entry.content_type,upsert:true});
   if(error)throw error;
   total+=bytes.length;saved.push({...entry,size:bytes.length,status:'stored',bucket:ATTACHMENT_BUCKET,storage_path:path});
  }catch(error){
   if(error instanceof RangeError)saved.push({...entry,status:'too_large'});
   else{retry=true;saved.push({...entry,status:'failed'});}
  }
 }
 const {error}=await db.from('email_posts').update({attachments:saved}).eq('id',postId);
 if(error)throw new Error('Attachment metadata could not be saved');
 return {retry};
}
