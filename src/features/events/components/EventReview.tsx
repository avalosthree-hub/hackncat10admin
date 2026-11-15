import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../../admin/components/AdminStudio';
import { message } from '../../admin/api/admin';
import { getEvents, getMetrics, eventStatus, PAGE_SIZE } from '../api/events';
import type { EventRecord, Metrics } from '../api/events';
import EventEditor from './EventEditor';
import OriginalEmailSource from './OriginalEmailSource';
import AttendanceChips from './AttendanceChips';

export default function EventReview({workspace}:{workspace:Workspace}) {
 const [queue,setQueue]=useState<EventRecord[]>([]);
 const [metrics,setMetrics]=useState<Metrics[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [version,setVersion]=useState(0);
 const [approved,setApproved]=useState(0);
 const [skipped,setSkipped]=useState(0);
 const [notice,setNotice]=useState('');
 const processed=useRef(new Set<string>());
 const event=queue[0];
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  async function load(){
   for(let page=0;;page++){
    const result=await getEvents(workspace.institution.id,{tab:'derived',sort:'traction',search:'',list:'',page});
    if(!active)return;
    const candidates=result.events.filter(e=>!processed.current.has(e.id)&&!e.cancelled_at&&e.status!=='withdrawn');
    if(candidates.length){
     const counts=result.metrics??await getMetrics(workspace.institution.id,candidates.map(e=>e.id));
     if(active){setQueue(candidates);setMetrics(counts);}return;
    }
    if((page+1)*PAGE_SIZE>=result.total){setQueue([]);return;}
   }
  }
  load().catch(err=>{if(active)setError(message(err));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[workspace.institution.id,version]);
 function advance(approve:boolean){
  if(!event)return;processed.current.add(event.id);
  if(approve)setApproved(v=>v+1);else setSkipped(v=>v+1);
  setNotice(approve?`Approved “${event.title}” as a published curated event.`:`Skipped “${event.title}”. It remains visible with no changes.`);
  setError('');setQueue(rows=>rows.slice(1));if(queue.length===1)setVersion(v=>v+1);
 }
 function restart(){processed.current.clear();setApproved(0);setSkipped(0);setNotice('');setVersion(v=>v+1);}
 return <section className="eventReview">
  <div className="sectionTitle"><div><span className="eyebrow">DERIVED EVENT QUEUE</span><h2>Event Review <span>⇄</span></h2><p className="muted">Verify campus events, one card at a time. Most Going + Interested RSVPs first.</p></div></div>
  <div className="reviewProgress"><span>{approved} approved · {skipped} skipped this session</span><button className="ghost" disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh queue</button><a className="textLink" href="#/admin/events">Browse all events →</a></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  {error&&<p className="notice error" role="alert">{error}<button onClick={()=>setVersion(v=>v+1)}>Retry queue</button></p>}
  {loading?<p className="loadingState" role="status">Finding the next event to review…</p>:!error&&(!event?<div className="card emptyState"><h3>You’re caught up</h3><p>No more eligible events in this session. Skipped events remain visible to students.</p><button className="secondary" onClick={restart}>Start a new review session</button></div>:<>
   <div className="reviewCardHeader"><span className="eyebrow">{workspace.lists.find(l=>l.id===event.list_id)?.tag} · Derived</span><div className="eventBadges"><span className="roleBadge">{eventStatus(event)}</span><AttendanceChips metrics={metrics.find(m=>m.event_id===event.id)} capacity={event.capacity}/></div></div>
   <EventEditor key={`${event.id}:${event.updated_at}`} event={event} claiming reviewMode workspace={workspace} onSkip={()=>advance(false)} onClose={()=>{}} onSaved={()=>advance(true)}/>
   <OriginalEmailSource key={event.id} event={event}/>
  </>)}
 </section>;
}
