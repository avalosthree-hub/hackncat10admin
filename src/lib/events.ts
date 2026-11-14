import type { Tables } from './database.types';
import { supabase } from './supabase';

export type EventStatus = 'draft' | 'published' | 'withdrawn';
export type EventRecord = Omit<Tables<'events'>, 'source_type' | 'status' | 'verification'> & {
  source_type: 'derived' | 'curated'; status: EventStatus; verification: 'confirmed' | 'incomplete' | 'unverified';
};
export type EventFields = Pick<EventRecord, 'title' | 'description' | 'starts_at' | 'ends_at' | 'timezone' | 'location_name' | 'location_address' | 'online_url' | 'registration_url' | 'rsvp_enabled' | 'capacity' | 'status'>;
export type Metrics = { event_id: string; going: number; interested: number; not_going: number };
export type Attendee = { email: string; status: 'going' | 'interested' | 'not_going'; updated_at: string };
export type EventFilters = { search: string; tab: string; list: string; sort: string; page: number };
export const PAGE_SIZE = 12;
export function eventStatus(event: Pick<EventRecord,'status' | 'cancelled_at'>) { return event.cancelled_at ? 'Cancelled' : event.status === 'withdrawn' ? 'Hidden' : event.status === 'published' ? 'Published' : 'Draft'; }
export function formatTime(event: Pick<EventRecord,'starts_at' | 'ends_at' | 'timezone' | 'event_date'>) {
  if (!event.starts_at) return event.event_date ? `${event.event_date} · time unconfirmed` : 'Date and time unconfirmed';
  const format = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: event.timezone }).format(new Date(value));
  return `${format(event.starts_at)}${event.ends_at ? ` – ${format(event.ends_at)}` : ''} (${event.timezone})`;
}
export function localTime(value: string | null, timezone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export async function getEvents(institution: string, filters: EventFilters) {
  let query = supabase.from('events').select('*', { count: 'exact' }).eq('institution_id', institution);
  if (filters.tab === 'curated' || filters.tab === 'derived') query = query.eq('source_type', filters.tab);
  if (filters.tab === 'draft' || filters.tab === 'published') query = query.eq('status', filters.tab);
  if (filters.tab === 'cancelled') query = query.not('cancelled_at', 'is', null);
  if (filters.list) query = query.eq('list_id', filters.list);
  if (filters.search.trim()) query = query.ilike('title', `%${filters.search.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const column = filters.sort === 'title' ? 'title' : filters.sort === 'recent' ? 'updated_at' : 'starts_at';
  const { data, error, count } = await query.order(column, { ascending: filters.sort !== 'recent', nullsFirst: false }).order('id').range(filters.page * PAGE_SIZE, (filters.page + 1) * PAGE_SIZE - 1);
  if (error) throw error;
  return { events: (data ?? []) as EventRecord[], total: count ?? 0 };
}
export async function getEvent(institution: string, id: string) {
  const { data, error } = await supabase.from('events').select('*').eq('institution_id', institution).eq('id', id).single();
  if (error) throw error; return data as EventRecord;
}
export async function getMetrics(institution: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc('admin_event_metrics', { p_institution: institution, p_events: ids });
  if (error) throw error; return (data ?? []) as Metrics[];
}
export async function getAttendees(id: string, page: number, status: string) {
  const { data, error } = await supabase.rpc('admin_event_attendees', { p_event: id, p_offset: page * 50, p_status: status || undefined });
  if (error) throw error; return data as { attendees: Attendee[]; hasMore: boolean };
}
export async function getOriginal(id: string) {
  const { data, error } = await supabase.rpc('admin_event_original', { p_event: id });
  if (error) throw error; return data;
}
export async function resolveTime(local: string, timezone: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_event_timestamp', { p_local: local, p_timezone: timezone });
  if (error) throw error; return data;
}
export async function saveEvent(institution: string, id: string | undefined, list: string, fields: EventFields, expectedUpdated?: string) {
  if (!id) {
    const { data, error } = await supabase.rpc('admin_create_event', { p_list: list, p_fields: fields });
    if (error) throw error; return data as string;
  }
  let query = supabase.from('events').update(fields).eq('id', id).eq('institution_id', institution);
  if (expectedUpdated) query = query.eq('updated_at', expectedUpdated);
  const { error } = await query.select('id').single();
  if (error) throw new Error('Could not save. The event may have changed or your access was removed. Refresh and try again. ' + error.message);
  return id;
}
export async function changeEvent(institution: string, event: EventRecord, changes: Partial<Pick<EventRecord,'status' | 'cancelled_at' | 'cancellation_reason'>>) {
  const { error } = await supabase.from('events').update(changes).eq('id', event.id).eq('institution_id', institution).eq('updated_at', event.updated_at).select('id').single();
  if (error) throw error;
}
export async function deleteEvent(institution: string, event: EventRecord) {
  const { error } = await supabase.from('events').delete().eq('id',event.id).eq('institution_id',institution).eq('updated_at',event.updated_at).select('id').single();
  if (error) throw error;
}
