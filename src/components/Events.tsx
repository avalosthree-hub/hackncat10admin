import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Workspace } from './AdminStudio';
import { message } from '../lib/admin';
import { navigate } from '../lib/routes';
import { changeEvent, deleteEvent, eventStatus, formatTime, getAttendees, getEvent, getEvents, getMetrics, getOriginal, localTime, PAGE_SIZE, resolveTime, saveEvent } from '../lib/events';
import type { Attendee, EventFields, EventFilters, EventRecord, Metrics } from '../lib/events';
import Modal from './Modal';

const tabs = [['all','All Events'],['curated','Curated Events'],['derived','Derived Events'],['draft','Draft Events'],['published','Published Events'],['cancelled','Cancelled Events']];
export default function Events({ workspace, eventId }: { workspace: Workspace; eventId?: string }) {
  const [filters,setFilters] = useState<EventFilters>({search:'',tab:'all',list:'',sort:'date',page:0});
  const [rows,setRows] = useState<EventRecord[]>([]);
  const [metrics,setMetrics] = useState<Metrics[]>([]);
  const [total,setTotal] = useState(0);
  const [selected,setSelected] = useState<EventRecord | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [version,setVersion] = useState(0);
  const [editor,setEditor] = useState<EventRecord | 'new' | null>(null);
  const refresh = () => setVersion(v=>v+1);
  const institution = workspace.institution.id;
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setSelected(null);setRows([]);
    const timer=setTimeout(()=>{
      (eventId ? getEvent(institution,eventId).then(e=>({events:[e],total:1})) : getEvents(institution,filters))
        .then(async result=>{if(!eventId && filters.page>0 && filters.page*PAGE_SIZE>=result.total){if(active)setFilters(f=>({...f,page:Math.max(0,Math.ceil(result.total/PAGE_SIZE)-1)}));return;}const counts=await getMetrics(institution,result.events.map(e=>e.id));if(active){setRows(result.events);setSelected(eventId ? result.events[0] : null);setTotal(result.total);setMetrics(counts);}})
        .catch(err=>{if(active)setError(message(err));}).finally(()=>{if(active)setLoading(false);});
    },150);
    return ()=>{active=false;clearTimeout(timer);};
  },[institution,eventId,filters,version]);
  const filter = (patch: Partial<EventFilters>)=>setFilters(f=>({...f,...patch,page:0}));
  return <>
    <div className="sectionTitle"><div>{eventId && <button className="back" onClick={()=>navigate('/admin/events')}>← All events</button>}<h2>{eventId ? 'Event management' : 'Events'} <span>✦</span></h2><p className="muted">Curated campus experiences and events discovered from email.</p></div><button className="primary" disabled={!workspace.lists.length} onClick={()=>setEditor('new')}>+ Create event</button></div>
    {!workspace.lists.length && <p className="notice">Create a mailing list before creating an event.</p>}
    {!eventId && <><div className="chips" aria-label="Event filters">{tabs.map(([key,label])=><button key={key} className={`chip ${filters.tab===key?'active':''}`} aria-pressed={filters.tab===key} onClick={()=>filter({tab:key})}>{label}</button>)}</div><div className="eventFilters"><label>Search events<input type="search" value={filters.search} onChange={e=>filter({search:e.target.value})} placeholder="Search by title" /></label><label>Mailing list<select value={filters.list} onChange={e=>filter({list:e.target.value})}><option value="">All mailing lists</option>{workspace.lists.map(l=><option key={l.id} value={l.id}>{l.tag}</option>)}</select></label><label>Sort by<select value={filters.sort} onChange={e=>filter({sort:e.target.value})}><option value="date">Event date</option><option value="recent">Recently updated</option><option value="title">Title A–Z</option></select></label></div></>}
    {error && <div className="notice error" role="alert">{error}<button className="ghost" onClick={refresh}>Retry</button></div>}
    {loading ? <p className="loadingState" role="status">Loading events and RSVPs…</p> : !error && (selected ? <EventDetail key={`${selected.id}:${version}`} event={selected} workspace={workspace} metrics={metrics[0]} onEdit={()=>setEditor(selected)} onRefresh={refresh} /> : <>
      {!rows.length ? <div className="card emptyState">No events match these filters. Create a curated event or review events extracted from incoming email.</div> : <div className="listCards">{rows.map(event=>{const count=metrics.find(m=>m.event_id===event.id);return <article className="card listCard" key={event.id}><div className="row"><span className="eyebrow">{event.source_type} · {workspace.lists.find(l=>l.id===event.list_id)?.tag}</span><span className="roleBadge">{eventStatus(event)}</span></div><h3>{event.title}</h3><p className="small">{formatTime(event)}</p><p className="muted small">{event.location_name || event.online_url || 'Location unconfirmed'}</p><p className="small"><strong>{count?.going ?? 0}</strong> Going · {count?.interested ?? 0} Interested{event.capacity ? ` · Capacity ${event.capacity}` : ''}</p><div className="listCardActions"><a className="textLink" href={`#/admin/events/${event.id}`}>Manage event & RSVPs →</a><button className="ghost" onClick={()=>setEditor(event)}>Edit</button></div></article>;})}</div>}
      <div className="pagination"><button className="secondary" disabled={filters.page===0} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>Previous</button><span className="small">{total ? `${filters.page*PAGE_SIZE+1}–${Math.min((filters.page+1)*PAGE_SIZE,total)} of ${total}` : '0 events'}</span><button className="secondary" disabled={(filters.page+1)*PAGE_SIZE>=total} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>Next</button></div>
    </>)}
    {editor && <EventEditor key={editor==='new'?'new':editor.id} event={editor==='new'?undefined:editor} workspace={workspace} onClose={()=>setEditor(null)} onSaved={id=>{setEditor(null);navigate(`/admin/events/${id}`);refresh();}} />}
  </>;
}

function EventDetail({event,workspace,metrics,onEdit,onRefresh}: {event:EventRecord;workspace:Workspace;metrics?:Metrics;onEdit:()=>void;onRefresh:()=>void}) {
  const [action,setAction]=useState<'delete'|'cancel'|'draft'|'published'|'withdrawn'|null>(null);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [original,setOriginal]=useState<unknown>(null);
  const [originalBusy,setOriginalBusy]=useState(false);
  async function execute(){
    if(!action)return;setBusy(true);setError('');
    try{
      if(action==='delete'){await deleteEvent(workspace.institution.id,event);navigate('/admin/events');}
      else await changeEvent(workspace.institution.id,event,action==='cancel'?{status:'withdrawn',cancelled_at:new Date().toISOString(),cancellation_reason:reason.trim()||null}:{status:action});
      setAction(null);onRefresh();
    }catch(err){setError(message(err));}finally{setBusy(false);}
  }
  return <>
    <section className="card"><div className="row"><span className="eyebrow">{event.source_type} · {workspace.lists.find(l=>l.id===event.list_id)?.tag}</span><span className="roleBadge">{eventStatus(event)}</span></div><h2>{event.title}</h2><p>{formatTime(event)}</p><p className="eventDescription">{event.description || 'No description provided.'}</p><p>{event.location_name || 'Location unconfirmed'}{event.location_address && ` · ${event.location_address}`}</p>
      {event.online_url && <p><a href={event.online_url} target="_blank" rel="noreferrer">Open online meeting ↗</a></p>}
      {event.registration_url && <div className="notice"><a href={event.registration_url} target="_blank" rel="noreferrer">External registration required ↗</a><p className="small">An Aggie Fetch “Going” RSVP does not complete external registration.</p></div>}
      {event.cancelled_at && <div className="destructiveWarning"><strong>Cancelled {new Date(event.cancelled_at).toLocaleString()}</strong><p>{event.cancellation_reason || 'No reason supplied.'} Historical RSVPs are retained. New Going RSVPs are blocked.</p></div>}
      <div className="pageActions"><button onClick={onEdit}>Edit event</button>{!event.cancelled_at && <>{event.status!=='published' ? <button className="primary" onClick={()=>setAction('published')}>Publish</button> : <button className="secondary" onClick={()=>setAction('draft')}>Unpublish</button>}{event.source_type==='derived' && event.status!=='withdrawn' && <button className="secondary" onClick={()=>setAction('withdrawn')}>Hide inaccurate event</button>}<button className="danger" onClick={()=>setAction('cancel')}>Cancel event</button></>}<button className="ghost danger" onClick={()=>setAction('delete')}>Delete</button><button className="ghost" onClick={onRefresh}>Refresh RSVPs</button></div>
      <p className="muted small">Event ID: {event.id}<br/>Updated {new Date(event.updated_at).toLocaleString()}. Event edits preserve RSVPs and calendar links. Outlook entries require a separate successful Microsoft Graph sync; this dashboard does not update them.</p>
    </section>
    {event.source_type==='derived' && <section className="card"><h3>AI extraction review</h3><p className="notice">{event.admin_locked ? 'Administrator corrections protected from AI reprocessing. Current event details above include administrator decisions.' : 'Original AI-generated details. Review incomplete or unverified information before enabling RSVPs.'}</p><p className="small">Extraction verification: <strong>{event.verification}</strong> · Source event key: {event.source_event_key}<br/>Original email: {event.source_email_post_id}</p><details><summary>Original extraction and supporting evidence</summary><pre className="body">{JSON.stringify(event.evidence,null,2)}</pre></details><button className="secondary" disabled={originalBusy} onClick={async()=>{setOriginalBusy(true);setError('');try{setOriginal(await getOriginal(event.id));}catch(err){setError(message(err));}finally{setOriginalBusy(false);}}}>{originalBusy?'Loading original…':'View authorized original email'}</button>{original!==null && <details open><summary>Original email · read only</summary><pre className="body">{JSON.stringify(original,null,2)}</pre></details>}</section>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <section className="card"><h3>RSVP overview</h3><p className="muted small">{event.rsvp_enabled ? 'Internal Aggie Fetch RSVPs enabled.' : 'Internal RSVPs disabled.'} Interested does not reserve a place.</p><div className="rsvpStats">{[['Going',metrics?.going??0],['Interested',metrics?.interested??0],['Not Going',metrics?.not_going??0],['Capacity',event.capacity??'Unlimited'],['Remaining',event.capacity===null?'Unlimited':Math.max(0,event.capacity-(metrics?.going??0))]].map(([label,count])=><div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div><Attendees eventId={event.id} /></section>
    {action && <Modal title={action==='delete'?'Delete event?':action==='cancel'?'Cancel event?':action==='published'?'Publish event?':action==='draft'?'Unpublish event?':'Hide event?'} busy={busy} onClose={()=>setAction(null)}><p>{action==='delete'?'Deletion is permanent. Events with RSVP, calendar or cancellation history cannot be deleted; cancel or unpublish them instead.':action==='cancel'?'This permanently records the cancellation, retains RSVPs, and prevents new Going RSVPs. Create a new event if rescheduling.':action==='published'?'This event will be visible to students subscribed to its mailing list. Derived events also require a published source email.':'This event will no longer appear in the student upcoming event feed. Existing RSVPs are retained.'}</p>{action==='cancel' && <label>Cancellation reason (optional)<textarea maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} /></label>}{error && <p className="error" role="alert">{error}</p>}<div className="modalActions"><button className="secondary" disabled={busy} onClick={()=>setAction(null)}>Back</button><button className={action==='published'?'primary':'danger'} disabled={busy} onClick={()=>void execute()}>{busy?'Saving…':'Confirm'}</button></div></Modal>}
  </>;
}

function Attendees({eventId}:{eventId:string}){
  const [rows,setRows]=useState<Attendee[]>([]);const [page,setPage]=useState(0);const [status,setStatus]=useState('');const [more,setMore]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);setError('');getAttendees(eventId,page,status).then(data=>{if(active){setRows(data.attendees);setMore(data.hasMore);}}).catch(err=>{if(active)setError(message(err));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[eventId,page,status]);
  return <><div className="sectionTitle"><h3>Attendees</h3><label>Attendance status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">All statuses</option><option value="going">Going</option><option value="interested">Interested</option><option value="not_going">Not Going</option></select></label></div>{loading?<p role="status">Loading attendees…</p>:error?<p role="alert" className="error">{error}</p>:!rows.length?<p className="emptyState">No RSVPs yet for this status.</p>:<ul className="senderList">{rows.map(row=><li key={row.email}><div><strong>{row.email}</strong><small className="muted">Updated {new Date(row.updated_at).toLocaleString()}</small></div><span className="roleBadge">{row.status.replace('_',' ')}</span></li>)}</ul>}<div className="pagination"><button className="secondary" disabled={loading||page===0} onClick={()=>setPage(p=>p-1)}>Previous attendees</button><span className="small">Page {page+1}</span><button className="secondary" disabled={loading||!more} onClick={()=>setPage(p=>p+1)}>Next attendees</button></div><p className="muted small">Only account email and attendance are disclosed. Administrators cannot submit or change a student's RSVP.</p></>;
}

function EventEditor({event,workspace,onClose,onSaved}:{event?:EventRecord;workspace:Workspace;onClose:()=>void;onSaved:(id:string)=>void}){
  const [title,setTitle]=useState(event?.title??'');const [description,setDescription]=useState(event?.description??'');
  const [list,setList]=useState(event?.list_id??workspace.lists[0]?.id??'');const [zone,setZone]=useState(event?.timezone??'America/New_York');
  const [start,setStart]=useState(event?localTime(event.starts_at,event.timezone):'');const [end,setEnd]=useState(event?localTime(event.ends_at,event.timezone):'');
  const [location,setLocation]=useState(event?.location_name??'');const [address,setAddress]=useState(event?.location_address??'');const [online,setOnline]=useState(event?.online_url??'');const [registration,setRegistration]=useState(event?.registration_url??'');
  const [rsvp,setRsvp]=useState(event?.rsvp_enabled??false);const [capacity,setCapacity]=useState(event?.capacity?.toString()??'');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [preview,setPreview]=useState<EventFields|null>(null);
  async function review(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
    if(!title.trim()||!description.trim())throw new Error('Enter a title and description.');
    if(!workspace.lists.some(l=>l.id===list))throw new Error('Choose a mailing list from this institution.');
    if((!event||event.source_type==='curated')&&!start)throw new Error('A start date and time is required.');
    if(capacity&&(!/^\d+$/.test(capacity)||Number(capacity)<1||Number(capacity)>2147483647))throw new Error('Capacity must be a positive whole number.');
    for(const url of [online,registration])if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||!parsed.hostname)throw new Error('Links must use HTTPS.');}
    const starts_at=await resolveTime(start,zone);const ends_at=await resolveTime(end,zone);
    if(ends_at&&(!starts_at||Date.parse(ends_at)<=Date.parse(starts_at)))throw new Error('End time must be after start time.');
    setPreview({title:title.trim(),description:description.trim(),starts_at,ends_at,timezone:zone,location_name:location.trim()||null,location_address:address.trim()||null,online_url:online.trim()||null,registration_url:registration.trim()||null,rsvp_enabled:rsvp,capacity:capacity?Number(capacity):null,status:event?.status??'draft'});
  }catch(err){setError(message(err));}finally{setBusy(false);}}
  async function save(status:EventFields['status']){if(!preview)return;setBusy(true);setError('');try{const id=await saveEvent(workspace.institution.id,event?.id,list,{...preview,status},event?.updated_at);onSaved(id);}catch(err){setError(message(err));}finally{setBusy(false);}}
  return <Modal title={preview?'Preview event':event?'Edit event':'Create curated event'} busy={busy} onClose={onClose}>
    {error && <p className="notice error" role="alert">{error}</p>}
    {preview ? <><span className="eyebrow">{workspace.lists.find(l=>l.id===list)?.tag} · {event?.source_type??'curated'}</span><h3>{preview.title}</h3><p className="eventDescription">{preview.description}</p><p>{formatTime({...preview,event_date:null})}</p><p>{preview.location_name || 'Location unconfirmed'} {preview.location_address}</p>{preview.online_url&&<p>Online: {preview.online_url}</p>}{preview.registration_url&&<div className="notice">External registration: {preview.registration_url}<p className="small">Going in Aggie Fetch does not complete external registration.</p></div>}<p>{preview.rsvp_enabled?'Internal RSVPs enabled':'Internal RSVPs disabled'} · Capacity: {preview.capacity??'Unlimited'}</p><div className="modalActions"><button className="secondary" disabled={busy} onClick={()=>setPreview(null)}>Back to edit</button>{event?.cancelled_at?<button disabled={busy} onClick={()=>void save('withdrawn')}>Save corrections</button>:<><button className="secondary" disabled={busy} onClick={()=>void save('draft')}>Save as draft</button>{event?.status==='withdrawn'&&<button className="secondary" disabled={busy} onClick={()=>void save('withdrawn')}>Save hidden</button>}<button className="primary" disabled={busy} onClick={()=>void save('published')}>{busy?'Saving…':'Publish event'}</button></>}</div></> :
    <form className="modalForm" onSubmit={review}><fieldset disabled={busy} className="eventFieldset">
      {event?.source_type==='derived'&&<p className="notice small">Your corrections will be protected from future AI extraction. Original email content and supporting evidence remain unchanged. Missing dates may stay blank.</p>}
      <label>Event title<input required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)} /></label>
      <label>Description<textarea required rows={5} maxLength={20000} value={description} onChange={e=>setDescription(e.target.value)} /></label>
      <label>Mailing list<select required disabled={!!event} value={list} onChange={e=>setList(e.target.value)}>{workspace.lists.map(l=><option key={l.id} value={l.id}>{l.tag}</option>)}</select></label>
      <label>Time zone<input required value={zone} placeholder="America/New_York" onChange={e=>setZone(e.target.value)} /><small className="muted">IANA zone. Dates below are local to this zone.</small></label>
      <label>Start date and time{event?.source_type==='derived'?' (may be unconfirmed)':''}<input type="datetime-local" required={!event||event.source_type==='curated'} value={start} onChange={e=>setStart(e.target.value)} /></label>
      <label>End date and time (optional)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      <label>Location name<input maxLength={500} value={location} onChange={e=>setLocation(e.target.value)} /></label><label>Physical address<input maxLength={1000} value={address} onChange={e=>setAddress(e.target.value)} /></label>
      <label>Online meeting link<input type="url" placeholder="https://…" value={online} onChange={e=>setOnline(e.target.value)} /></label><label>External registration link<input type="url" placeholder="https://…" value={registration} onChange={e=>setRegistration(e.target.value)} /><small className="muted">Students must complete this registration separately from an Aggie Fetch RSVP.</small></label>
      <label className="checkboxLabel"><input type="checkbox" disabled={!!event?.cancelled_at} checked={rsvp} onChange={e=>setRsvp(e.target.checked)} />Enable internal Aggie Fetch RSVPs</label><label>Maximum Going attendance (optional)<input type="number" min="1" max="2147483647" step="1" value={capacity} onChange={e=>setCapacity(e.target.value)} /><small className="muted">Interested does not use capacity. Availability is enforced by the backend.</small></label>
      <div className="modalActions"><button className="secondary" type="button" onClick={onClose}>Close</button><button className="primary" type="submit">{busy?'Checking…':'Preview event'}</button></div>
    </fieldset></form>}
  </Modal>;
}
