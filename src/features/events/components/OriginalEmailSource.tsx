import EmailAttachments from "../../../components/EmailAttachments";
import { useEffect, useState } from 'react';
import type { EventRecord } from '../api/events';
import { getOriginal } from '../api/events';
import { message } from '../../admin/api/admin';
import { evidenceSnippets, highlightEvidence, originalEmail } from '../api/emailEvidence';

export default function OriginalEmailSource({event}:{event:EventRecord}) {
 const [loaded,setLoaded]=useState<{id:string;value:unknown}|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setLoaded(null);setError('');
  getOriginal(event.id).then(value=>{if(active)setLoaded({id:event.id,value});}).catch(err=>{if(active)setError(message(err));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[event.id,version]);
 const email=originalEmail(loaded?.id===event.id?loaded.value:null);
 const snippets=evidenceSnippets(event.evidence);
 const body=highlightEvidence(email.body,snippets);const subject=highlightEvidence(email.subject,snippets);
 const matched=snippets.filter(snippet=>[...highlightEvidence(email.subject,[snippet]),...highlightEvidence(email.body,[snippet])].some(part=>part.highlighted));
 const missing=snippets.filter(snippet=>!matched.includes(snippet));
 const render=(parts:ReturnType<typeof highlightEvidence>)=>parts.map((part,index)=>part.highlighted?<mark key={index}>{part.text}</mark>:part.text);
 return <section className="card reviewSource" aria-label="Source information and original email">
  <h3>Source information</h3><p className="small">Extraction verification: {event.verification} · Original email: {event.source_email_post_id}</p>
  <details><summary>Extraction evidence</summary><pre className="body">{JSON.stringify(event.evidence,null,2)}</pre></details>
  <h3>Original email</h3>
  {loading?<p role="status">Loading original email…</p>:error?<p className="error" role="alert">{error} <button className="secondary" onClick={()=>setVersion(v=>v+1)}>Retry original email</button></p>:<>
   <p className="muted small">Highlighted passages match the AI’s saved extraction quotes, allowing for differences in capitalization and spacing.</p>
   {!snippets.length?<p className="notice small">No source quotations were saved for this event. Compare the details with the email manually.</p>:!matched.length?<p className="notice small">The saved AI quotations could not be matched to this email. Review the extraction evidence manually.</p>:<p className="small sourceLegend"><mark>AI source passage</mark> · {matched.length} of {snippets.length} saved quotations matched</p>}
   <article className="sourceEmail"><header><h4>{render(subject)}</h4><p className="small">From: {email.sender}</p></header>{email.body?<div className="sourceEmailBody">{render(body)}</div>:<p className="notice">The original email body is unavailable.</p>}</article>
   <EmailAttachments attachments={loaded?.value&&typeof loaded.value==='object'&&'attachments' in loaded.value?loaded.value.attachments:[]}/>
   {email.fromHtml&&<p className="muted small">Showing the original email’s text. Images and formatting are omitted.</p>}
   {!!missing.length&&!!matched.length&&<details><summary>Unmatched source quotations ({missing.length})</summary>{missing.map((quote,index)=><blockquote key={index}>{quote}</blockquote>)}</details>}
  </>}
 </section>;
}
