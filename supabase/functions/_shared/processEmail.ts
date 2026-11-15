import { classifyEmail } from './classifyEmail.ts';
import { reconcileEvents } from './reconcileEvents.js';

export async function processEmail(db: any, emailId: string, reprocess = false) {
  const { data: email, error: lookupError } = await db.from('email_posts')
    .select('id,email_id,raw_email,received_at,status,list_id,institution_id,source,updated_at').eq('email_id', emailId).maybeSingle();
  if (lookupError) throw new Error('Email lookup failed');
  if (!email) throw new Error('Email not found');
  if (email.source === 'manual') throw new Error('Manual posts are not email backfill targets');
  if (!email.raw_email) throw new Error('Raw email missing');
  const retryable = ['failed', 'received'].includes(email.status);
  if (!retryable && !(reprocess && ['published', 'draft'].includes(email.status))) throw new Error('Email is not retryable');
  const claimTime = new Date().toISOString();
  const claim = reprocess ? { updated_at: claimTime, error_message: null }
    : { status: 'processing', updated_at: claimTime, error_message: null };
  const { data: claimed, error: claimError } = await db.from('email_posts').update(claim)
    .eq('id', email.id).eq('status', email.status).eq('updated_at', email.updated_at).select('updated_at').maybeSingle();
  if (claimError || !claimed) throw new Error('Email changed or is already being processed');
  try {
    let raw = email.raw_email;
    if (typeof raw === 'string') raw = JSON.parse(raw);
    raw = raw?.data || raw;
    const original = { subject: String(raw.subject || ''), text: String(raw.text || raw.body_text || ''), html: String(raw.html || ''), from: String(raw.from || '') };
    const sender = (original.from.match(/<([^<>]+)>/)?.[1] || original.from).trim().toLowerCase();
    const { data: routes, error: routeError } = await db.from('list_senders').select('list_id').eq('sender_email', sender);
    if (routeError) throw routeError;
    // A historical backfill keeps existing list/institution ownership.
    if(!email.list_id && routes?.length>1)throw new Error('Multiple approved lists match this unrouted email; retry the verified delivery instead.');
    const listId = email.list_id || routes?.[0]?.list_id || null;
    let institutionId = null, topics = [], timezone = Deno.env.get('INSTITUTION_TIMEZONE') || 'America/New_York';
    if (listId) {
      const { data: list, error } = await db.from('list').select('institution').eq('id', listId).single();
      if (error || !list?.institution) throw new Error('List institution missing');
      institutionId = list.institution;
      const { data: institution, error: zoneError } = await db.from('institutions').select('timezone,hashtags').eq('id', institutionId).single();
      if (zoneError || !institution?.timezone) throw new Error('Institution timezone missing');
      timezone = institution.timezone;
      topics = Array.isArray(institution.hashtags) ? institution.hashtags : [];
    }
    const result = await classifyEmail(original, email.received_at, topics, timezone);
    if ('error' in result) throw new Error(result.error);
    const { data: events, error: eventsError } = await db.from('events')
      .select('id,source_event_key,title,evidence,event_date,starts_at,admin_locked').eq('source_email_post_id', email.id).eq('source_type', 'derived');
    if (eventsError) throw eventsError;
    result.event_times = reconcileEvents(result.event_times, events || []);
    const status = listId && institutionId ? 'published' : 'draft';
    const { data: saved, error: saveError } = await db.from('email_posts')
      .update({ ...result, list_id: listId, institution_id: institutionId, status, error_message: null, updated_at: new Date().toISOString() })
      .eq('id', email.id).eq('updated_at', claimed.updated_at).select('id').maybeSingle();
    if (saveError || !saved) throw new Error(saveError?.message || 'Email changed while processing; newer data preserved');
    return { email_id: emailId, status, time_count: result.event_times.length, event_count: result.event_times.filter((entry: any) => entry.type === 'event').length };
  } catch (error) {
    await db.from('email_posts').update({ ...(reprocess ? {} : {status:'failed'}), error_message: String(error).slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', email.id).eq('updated_at', claimed.updated_at);
    throw error;
  }
}

