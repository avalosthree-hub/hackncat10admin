export type ScheduleType = 'timed' | 'all_day' | 'date_only' | 'end_date_only';
export function dateSchedule(type: Exclude<ScheduleType,'timed'>,start:string,end:string) {
 const valid=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
 if(type==='end_date_only'){if(!valid(end))throw new Error('Enter a valid end date.');}
 else {if(!valid(start))throw new Error('Enter a valid start date.');if(end&&(!valid(end)||end<start))throw new Error('End date must be on or after the start date.');}
 return {schedule_type:type,event_date:type==='end_date_only'?end:start,event_end_date:end||null,starts_at:null,ends_at:null};
}
export function formatSchedule(event:{starts_at:string|null;ends_at:string|null;timezone:string;event_date:string|null;schedule_type?:ScheduleType;event_end_date?:string|null}) {
 const date=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
 if(event.schedule_type==='end_date_only')return `Ends ${event.event_end_date?date(event.event_end_date):'on an unconfirmed date'} · time not specified`;
 if(event.schedule_type==='all_day'||event.schedule_type==='date_only'){
  const range=event.event_date?`${date(event.event_date)}${event.event_end_date&&event.event_end_date!==event.event_date?` – ${date(event.event_end_date)}`:''}`:'Date unconfirmed';
  return `${range} · ${event.schedule_type==='all_day'?'All day':'time not specified'}`;
 }
 if(!event.starts_at)return event.event_date?`${date(event.event_date)} · time unconfirmed`:'Date and time unconfirmed';
 const format=(value:string)=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:event.timezone}).format(new Date(value));
 return `${format(event.starts_at)}${event.ends_at?` – ${format(event.ends_at)}`:''} (${event.timezone})`;
}
