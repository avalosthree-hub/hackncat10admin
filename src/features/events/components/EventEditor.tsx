import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Workspace } from '../../admin/components/AdminStudio';
import { message } from '../../admin/api/admin';
import { claimEvent, formatTime, localTime, resolveTime, saveEvent } from '../api/events';
import type { EventFields, EventRecord } from '../api/events';
import Modal from '../../../components/Modal';
import { dateSchedule } from '../api/schedule';
import type { ScheduleType } from '../api/schedule';
import SwipeDecision from './SwipeDecision';

export default function EventEditor({event,claiming=false,reviewMode=false,onSkip,workspace,onClose,onSaved}:{event?:EventRecord;claiming?:boolean;reviewMode?:boolean;onSkip?:()=>void;workspace:Workspace;onClose:()=>void;onSaved:(id:string)=>void}){
  const [title,setTitle]=useState(event?.title??'');const [description,setDescription]=useState(event?.description??'');
  const [list,setList]=useState(event?.list_id??workspace.lists[0]?.id??'');const [zone,setZone]=useState(event?.timezone??'America/New_York');
  const [start,setStart]=useState(event?localTime(event.starts_at,event.timezone):'');const [end,setEnd]=useState(event?localTime(event.ends_at,event.timezone):'');
  const [timing,setTiming]=useState<ScheduleType>(event?.schedule_type&&event.schedule_type!=='timed'?event.schedule_type:!event?.starts_at&&event?.event_date?'date_only':'timed');
  const [startDate,setStartDate]=useState(event?.event_date??'');const [endDate,setEndDate]=useState(event?.event_end_date??'');
  const [location,setLocation]=useState(event?.location_name??'');const [address,setAddress]=useState(event?.location_address??'');const [online,setOnline]=useState(event?.online_url??'');const [registration,setRegistration]=useState(event?.registration_url??'');
  const [rsvp,setRsvp]=useState(event?.rsvp_enabled??false);const [capacity,setCapacity]=useState(event?.capacity?.toString()??'');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [preview,setPreview]=useState<EventFields|null>(null);
  const [verified,setVerified]=useState(false);
  async function review(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    if(!title.trim()||!description.trim())throw new Error('Enter a title and description.');
    if(!workspace.lists.some(l=>l.id===list))throw new Error('Choose a mailing list from this institution.');
    if(timing==='timed'&&(claiming||!event||event.source_type==='curated')&&!start)throw new Error('A start date and time is required.');
    if(capacity&&(!/^\d+$/.test(capacity)||Number(capacity)<1||Number(capacity)>2147483647))throw new Error('Capacity must be a positive whole number.');
    for(const url of [online,registration])if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname)throw new Error('Links must use HTTPS.');}
    let schedule:Pick<EventFields,'schedule_type'|'starts_at'|'ends_at'|'event_date'|'event_end_date'>;
    if(timing==='timed'){
      const starts_at=await resolveTime(start,zone);const ends_at=await resolveTime(end,zone);
      if(ends_at&&(!starts_at||Date.parse(ends_at)<=Date.parse(starts_at)))throw new Error('End time must be after start time.');
      schedule={schedule_type:'timed',starts_at,ends_at,event_date:null,event_end_date:null};
    }else schedule=dateSchedule(timing,startDate,endDate);
    setPreview({title:title.trim(),description:description.trim(),...schedule,timezone:zone,location_name:location.trim()||null,location_address:address.trim()||null,online_url:online.trim()||null,registration_url:registration.trim()||null,rsvp_enabled:rsvp,capacity:capacity?Number(capacity):null,status:event?.status??'draft'});
  }catch(err){setError(message(err));}finally{setBusy(false);}}
  async function save(status:EventFields['status']){if(!preview)return;setBusy(true);setError('');try{if(claiming&&!verified)throw new Error('Confirm that you have verified the event information.');const id=claiming&&event?await claimEvent(workspace.institution.id,event,{...preview,status:reviewMode?'published':event.status}):await saveEvent(workspace.institution.id,event?.id,list,{...preview,status},event?.updated_at);onSaved(id);}catch(err){setError(message(err));}finally{setBusy(false);}}
  const content=<>
    {reviewMode && <h3>{preview?'Swipe to decide':'Review and edit event'}</h3>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {preview ? <SwipeDecision enabled={reviewMode} canApprove={verified&&!busy} busy={busy} onApprove={()=>void save('published')} onSkip={()=>onSkip?.()}><span className="eyebrow">{workspace.lists.find(l=>l.id===list)?.tag} · {claiming?'curated':event?.source_type??'curated'}</span><h3>{preview.title}</h3><p className="eventDescription">{preview.description}</p><p>{formatTime(preview)}</p><p>{preview.location_name || 'Location unconfirmed'} {preview.location_address}</p>{preview.online_url&&<p>Online: {preview.online_url}</p>}{preview.registration_url&&<div className="notice">External registration: {preview.registration_url}<p className="small">Going in Aggie Fetch does not complete external registration.</p></div>}<p>{preview.rsvp_enabled?'Internal RSVPs enabled':'Internal RSVPs disabled'} · Capacity: {preview.capacity??'Unlimited'}</p>{claiming && <label className="checkboxLabel"><input type="checkbox" checked={verified} disabled={busy} onChange={e=>setVerified(e.target.checked)} />I have verified the event details, including date, time, location, and registration information.</label>}<div className="modalActions"><button className="secondary" disabled={busy} onClick={()=>{setPreview(null);setVerified(false);}}>Back to edit</button>{reviewMode?<><button className="secondary" disabled={busy} onClick={onSkip}>← Deny / skip</button><button className="primary" disabled={busy||!verified} onClick={()=>void save('published')}>{busy?'Approving…':'Approve event →'}</button></>:claiming?<button className="primary" disabled={busy||!verified} onClick={()=>void save(event?.status??'draft')}>{busy?'Claiming…':'Confirm and claim event'}</button>:event?.cancelled_at?<button disabled={busy} onClick={()=>void save('withdrawn')}>Save corrections</button>:<><button className="secondary" disabled={busy} onClick={()=>void save('draft')}>Save as draft</button>{event?.status==='withdrawn'&&<button className="secondary" disabled={busy} onClick={()=>void save('withdrawn')}>Save hidden</button>}<button className="primary" disabled={busy} onClick={()=>void save('published')}>{busy?'Saving…':'Publish event'}</button></>}</div></SwipeDecision> :
    <form className="modalForm" onSubmit={review}><fieldset disabled={busy} className="eventFieldset">
      {claiming && <p className="notice">{reviewMode?'Approval publishes this event as curated. Denying only skips it for this session; students can still see it. ':''}Review and correct the extracted information before claiming this event. Confirmation converts it to a curated event and protects it from AI reprocessing. Its publication status, RSVPs, and source email are retained.</p>}
      {!claiming && event?.source_type==='derived'&&<p className="notice small">Your corrections will be protected from future AI extraction. Original email content and supporting evidence remain unchanged. Missing dates may stay blank.</p>}
      <label>Event title<input required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)} /></label>
      <label>Description<textarea required rows={5} maxLength={20000} value={description} onChange={e=>setDescription(e.target.value)} /></label>
      <label>Mailing list<select required disabled={!!event} value={list} onChange={e=>setList(e.target.value)}>{workspace.lists.map(l=><option key={l.id} value={l.id}>{l.tag}</option>)}</select></label>
      <label>Time zone<input required value={zone} placeholder="America/New_York" onChange={e=>setZone(e.target.value)} /><small className="muted">IANA zone. Dates below are local to this zone.</small></label>
      <label>Event timing<select aria-label="Event timing" value={timing} onChange={e=>setTiming(e.target.value as ScheduleType)}><option value="timed">Specific date and time</option><option value="all_day">All day</option><option value="date_only">Date only — time not specified</option><option value="end_date_only">End date only — time not specified</option></select></label>
      {timing==='timed'?<>
      <label>Start date and time{!claiming&&event?.source_type==='derived'?' (may be unconfirmed)':''}<input type="datetime-local" required={claiming||!event||event.source_type==='curated'} value={start} onChange={e=>setStart(e.target.value)} /></label>
      <label>End date and time (optional)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      </>:<>
      {timing!=='end_date_only'&&<label>Start date<input type="date" required value={startDate} onChange={e=>setStartDate(e.target.value)} /></label>}
      <label>End date{timing==='end_date_only'?'':' (optional, inclusive)'}<input type="date" required={timing==='end_date_only'} min={timing==='end_date_only'?undefined:startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)} /></label>
      <p className="muted small">{timing==='all_day'?'The event lasts all day on the selected date or dates.':'No exact time is stated in the announcement. Dates are saved without adding a time.'}</p>
      </>}
      <label>Location name<input maxLength={500} value={location} onChange={e=>setLocation(e.target.value)} /></label><label>Physical address<input maxLength={1000} value={address} onChange={e=>setAddress(e.target.value)} /></label>
      <label>Online meeting link<input type="url" placeholder="https://…" value={online} onChange={e=>setOnline(e.target.value)} /></label><label>External registration link<input type="url" placeholder="https://…" value={registration} onChange={e=>setRegistration(e.target.value)} /><small className="muted">Students must complete this registration separately from an Aggie Fetch RSVP.</small></label>
      <label className="checkboxLabel"><input type="checkbox" disabled={!!event?.cancelled_at} checked={rsvp} onChange={e=>setRsvp(e.target.checked)} />Enable internal Aggie Fetch RSVPs</label><label>Maximum Going attendance (optional)<input type="number" min="1" max="2147483647" step="1" value={capacity} onChange={e=>setCapacity(e.target.value)} /><small className="muted">Interested does not use capacity. Availability is enforced by the backend.</small></label>
      <div className="modalActions">{reviewMode?<button className="secondary" type="button" onClick={onSkip}>← Deny / skip</button>:<button className="secondary" type="button" onClick={onClose}>Close</button>}<button className="primary" type="submit">{busy?'Checking…':'Preview event'}</button></div>
    </fieldset></form>}
  </>;
  return reviewMode?<section className="card reviewEditor">{content}</section>:<Modal title={claiming?'Verify and claim event':preview?'Preview event':event?'Edit event':'Create curated event'} busy={busy} onClose={onClose}>{content}</Modal>;
}
