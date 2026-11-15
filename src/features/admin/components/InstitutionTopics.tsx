import { useState } from 'react';
import type { Institution } from '../api/admin';
import { message, setInstitutionTopics } from '../api/admin';
import TopicEditor from './TopicEditor';
export default function InstitutionTopics({institution,onSaved}:{institution:Institution;onSaved:(topics:string[])=>void}){
 const [labels,setLabels]=useState(institution.hashtags);
 const [saved,setSaved]=useState(institution.hashtags);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 return <><div className="sectionTitle"><div><h2>Institution Topics <span>#</span></h2><p className="muted">One shared set of hashtags for every mailing list at {institution.name}.</p></div></div>
 <section className="card"><p className="notice small">For future emails, AI aims for two relevant topics, uses one when only one applies, and selects at most four. Existing email labels stay unchanged.</p>
 <TopicEditor labels={labels} onChange={next=>{setLabels(next);setNotice('');}} disabled={busy}/>
 {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
 <button className="primary" disabled={busy||JSON.stringify(labels)===JSON.stringify(saved)} onClick={async()=>{setBusy(true);setError('');try{const next=await setInstitutionTopics(institution.id,labels,saved);setLabels(next);setSaved(next);onSaved(next);setNotice('Institution topics saved for future emails.');}catch(err){setError(message(err));}finally{setBusy(false);}}}>{busy?'Saving…':'Save institution topics'}</button></section></>;
}
