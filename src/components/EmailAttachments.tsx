import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { message } from '../features/admin/api/admin';
type Attachment={id?:string;name?:string;filename?:string;size?:number;status?:string;bucket?:string;storage_path?:string};
export default function EmailAttachments({attachments}:{attachments:unknown}){
 const items:Attachment[]=Array.isArray(attachments)?attachments.filter(a=>a&&typeof a==='object'):[];
 const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');
 if(!items.length)return null;
 async function download(item:Attachment){
  if(!item.storage_path)return;setBusy(item.storage_path);setError('');
  try{
   const {data,error}=await supabase.storage.from('email-attachments').createSignedUrl(item.storage_path,60,{download:item.name||item.filename||'Attachment'});
   if(error)throw error;
   const response=await fetch(data.signedUrl);if(!response.ok)throw new Error('The attachment could not be downloaded. Try again.');
   const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=item.name||item.filename||'Attachment';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){setError(message(err));}finally{setBusy(null);}
 }
 return <section className="emailAttachments" aria-label="Email attachments"><h4>Attachments</h4><ul>{items.map((item,index)=><li key={item.id||index}>
  {item.status==='stored'&&item.storage_path?<button className="attachmentDownload" disabled={busy!==null} onClick={()=>void download(item)}>📎 {busy===item.storage_path?'Downloading…':item.name||item.filename||'Attachment'}{item.size?` · ${Math.ceil(item.size/1024)} KB`:''}</button>:<span className="muted small">📎 {item.name||item.filename||'Attachment'} · {item.status==='too_large'?'Exceeds storage limit':item.status==='failed'||item.status==='pending'?'Storage pending':item.status==='limit_exceeded'?'Attachment count limit reached':'File not stored'}</span>}
 </li>)}</ul>{error&&<p className="error" role="alert">{error}</p>}</section>;
}
