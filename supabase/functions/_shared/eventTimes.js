import * as chrono from 'chrono-node';
import { DateTime, IANAZone, FixedOffsetZone } from 'luxon';

export const TIME_NORMALIZER_VERSION = 1;
const defaultZone = 'America/New_York';
const dateKeys = ['year', 'month', 'day'];
const weekdays = /\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/i;

function wallTime(parts, zone) {
  const fields = Object.fromEntries(['year', 'month', 'day', 'hour', 'minute', 'second'].map(key => [key, parts.get(key) ?? 0]));
  const value = DateTime.fromObject(fields, { zone });
  if (!value.isValid || Object.entries(fields).some(([key, number]) => value[key] !== number)) {
    return { error: 'Invalid date or nonexistent local time (daylight saving transition).' };
  }
  if (value.getPossibleOffsets().length !== 1) return { error: 'Local time occurs twice during a daylight saving transition.' };
  return { value };
}

// Resolve presentation differences back to an exact original span; never substitute words or dates.
export function sourceSpan(quote, source) {
  if (typeof quote !== 'string' || !quote) return null;
  if (source.includes(quote)) return quote;
  function indexed(text) {
    let compact = ''; const indexes = [];
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (/[\s*_.]/.test(character)) continue;
      compact += character.toLowerCase().replace(/[–—]/g, '-'); indexes.push(index);
    }
    return { compact, indexes };
  }
  const full = indexed(source), wanted = indexed(quote).compact;
  if (!wanted) return null;
  const position = full.compact.indexOf(wanted);
  if (position < 0) return null;
  return source.slice(full.indexes[position], full.indexes[position + wanted.length - 1] + 1);
}

// Parse only source text. AI-produced date components and UTC values are never inputs.
export function normalizeTime(timeText, evidence, source, receivedAt, institutionTimezone = defaultZone, contextDate = null) {
  const result = { version: TIME_NORMALIZER_VERSION, status: 'invalid', start: null, end: null, date: null,
    timezone: institutionTimezone, timezoneSource: 'institution', reason: null };
  const fail = (status, reason) => ({ ...result, status, reason });
  if (typeof evidence !== 'string' || !evidence || !source.includes(evidence) ||
      typeof timeText !== 'string' || !timeText || !evidence.includes(timeText)) {
    return fail('invalid', 'Time text and evidence must be exact substrings of the original email.');
  }
  if (!IANAZone.isValidZone(institutionTimezone)) return fail('invalid', 'Invalid institution timezone.');
  const reference = DateTime.fromISO(receivedAt || '', { setZone: true });
  if (!reference.isValid) return fail('ambiguous', 'A valid email received timestamp is required as the date reference.');
  // IANA zones are interpreted by Luxon, abbreviations/numeric offsets by Chrono.
  const zoneMatch = timeText.match(/\b[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/);
  const zone = zoneMatch?.[0] || institutionTimezone;
  if (!IANAZone.isValidZone(zone)) return fail('invalid', 'Unrecognized timezone in source text.');
  result.timezone = zone;
  if (zoneMatch) result.timezoneSource = 'explicit';
  const text = (zoneMatch ? timeText.replace(zoneMatch[0], '') : timeText)
    .replace(/\\[rn]/g, ' ').replace(/[*_]/g, ' ')
    .replace(/\b(?:event\s+date|date|time)\s*:\s*/gi, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ');
  // Numeric dates with both fields <= 12 have two valid readings.
  if (/\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|1[0-2])(?:\/\d{2,4})?\b/.test(text)) {
    return fail('ambiguous', 'Numeric date has an ambiguous month/day order.');
  }
  const parsingReference = contextDate ? DateTime.fromISO(contextDate, { zone }).startOf('day') : reference;
  if (!parsingReference.isValid) return fail('invalid', 'Invalid activity date context.');
  if (/\b(?:every|weekly|daily|monthly)\b/i.test(text) && !/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d|\d{4}-\d{2}-\d{2}/i.test(text)) {
    return fail('ambiguous', 'Recurring schedules need explicit occurrence dates.');
  }
  const referenceOffset = parsingReference.setZone(zone).offset;
  let matches = chrono.casual.parse(text, { instant: parsingReference.toJSDate(), timezone: referenceOffset }, { forwardDate: !contextDate });
  if (matches.length !== 1) return fail(matches.length ? 'ambiguous' : 'invalid', matches.length ? 'More than one time occurrence; extract each separately.' : 'No valid date or time could be parsed.');
  if (matches[0].start.isCertain('timezoneOffset') && !zoneMatch) {
    matches = chrono.casual.parse(text, { instant: parsingReference.toJSDate(), timezone: matches[0].start.get('timezoneOffset') }, { forwardDate: !contextDate });
  }
  const parsed = matches[0];
  const parts = parsed.start;
  // Reject unsupported timezone abbreviations instead of silently using the institution zone.
  const abbreviations = text.match(/\b(?:[A-Z]{2,5})\b/g) || [];
  if (abbreviations.some(word => !['AM', 'PM', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC', 'MON', 'TUE', 'TUES', 'WED', 'THU', 'THUR', 'FRI', 'SAT', 'SUN', 'AT', 'TO', 'FROM', 'ON'].includes(word)) && !parts.isCertain('timezoneOffset') && !zoneMatch) {
    return fail('ambiguous', 'Unrecognized or ambiguous timezone abbreviation.');
  }
  if (/\b(?:IST|CST|BST|AST)\b/i.test(text)) return fail('ambiguous', 'Timezone abbreviation has multiple regional meanings; use an IANA zone or numeric offset.');
  const timezoneWords = text.toUpperCase().match(/\b(?:UTC|GMT|EST|EDT|ET|PST|PDT|PT|MST|MDT|MT|CST|CDT|CT|IST|BST|AST|CET|CEST|JST|AEST|AEDT)\b/g) || [];
  if (new Set(timezoneWords).size > 1) return fail('ambiguous', 'Multiple timezone interpretations appear in this expression.');
  const explicitOffset = parts.isCertain('timezoneOffset');
  const resolvedZone = explicitOffset ? FixedOffsetZone.instance(parts.get('timezoneOffset')) : zone;
  if (explicitOffset) {
    const minutes = parts.get('timezoneOffset');
    result.sourceTimezone = resolvedZone.name;
    // PostgreSQL and Intl both accept Etc/GMT IANA names. Fractional offsets display in UTC.
    result.timezone = minutes % 60 === 0 && Math.abs(minutes) <= 840
      ? (minutes === 0 ? 'UTC' : `Etc/GMT${minutes > 0 ? '-' : '+'}${Math.abs(minutes / 60)}`) : 'UTC';
    result.timezoneSource = 'explicit';
  }
  const hasDate = parts.isCertain('day') || parts.isCertain('weekday') || /\b(today|tomorrow|yesterday)\b/i.test(text);
  if (!hasDate && !contextDate) return fail('ambiguous', 'No date is associated with this time.');
  const date = DateTime.fromObject(Object.fromEntries(dateKeys.map(key => [key, parts.get(key)])), { zone: resolvedZone });
  if (!date.isValid) return fail('invalid', 'Invalid calendar date.');
  // For omitted years, use the next occurrence from the received date (Chrono forwardDate).
  result.date = date.toISODate();
  if (!hasDate && contextDate) result.dateSource = 'activity';
  if (weekdays.test(text) && parts.isCertain('weekday') && parts.isCertain('day') && date.weekday % 7 !== parts.get('weekday')) {
    return fail('ambiguous', 'The weekday and calendar date disagree.');
  }
  if (!parts.isCertain('hour')) {
    const endDate = parsed.end ? DateTime.fromObject(Object.fromEntries(dateKeys.map(key => [key, parsed.end.get(key)])), { zone: resolvedZone }) : null;
    return { ...result, status: 'date_only', endDate: endDate?.isValid ? endDate.toISODate() : null, reason: 'No explicit clock time was supplied.' };
  }
  const resolve = component => {
    if (component.get('hour') <= 12 && !component.isCertain('meridiem') && !/\b(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:hours?|hrs?)\b/i.test(text) && !/\b0\d:[0-5]\d\b/.test(text) && component.get('hour') !== 0) {
      return { error: 'AM or PM is unspecified.', ambiguous: true };
    }
    const componentZone = component.isCertain('timezoneOffset') ? FixedOffsetZone.instance(component.get('timezoneOffset')) : resolvedZone;
    return wallTime(component, componentZone);
  };
  const start = resolve(parts);
  if (start.error) return fail(start.ambiguous || /twice/.test(start.error) ? 'ambiguous' : 'invalid', start.error);
  let end = null;
  if (parsed.end) {
    const finish = resolve(parsed.end);
    if (finish.error) return fail(finish.ambiguous || /twice/.test(finish.error) ? 'ambiguous' : 'invalid', finish.error);
    // Chrono advances reversed ranges to tomorrow. Require explicit wording for a changed date.
    const dateMentions = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/gi) || [];
    if (finish.value.toISODate() !== start.value.toISODate() && dateMentions.length < 2 && !/\b(?:next|following) (?:day|morning)|overnight\b/i.test(text)) {
      return fail('ambiguous', 'Range crosses midnight without an explicit end date.');
    }
    if (finish.value <= start.value) return fail('invalid', 'End time must follow the start; no overnight duration is assumed.');
    end = finish.value.toUTC().toISO();
  }
  return { ...result, status: 'normalized', start: start.value.toUTC().toISO(), end, date: start.value.toISODate() };
}

export function normalizeEventTimes(entries, source, receivedAt, timezone = defaultZone) {
  if (!Array.isArray(entries)) return [];
  const times = entries.filter(entry => entry && ['event', 'deadline', 'schedule'].includes(entry.type) && typeof entry.activityId === 'string' && entry.activityId.trim() && (entry.type === 'deadline' || (typeof entry.occurrenceId === 'string' && entry.occurrenceId.trim()))).map(entry => {
    const activity = String(entry.activityId || '').trim();
    const occurrence = String(entry.occurrenceId || '').trim();
    const evidence = sourceSpan(entry.evidence, source) || entry.evidence;
    // The model sometimes joins date and time lines with invented punctuation. Parse the verified source span instead.
    const timeText = sourceSpan(entry.timeText, evidence || '') || evidence;
    const normalized = normalizeTime(timeText, evidence, source, receivedAt, timezone);
    // An occurrence identity uses source wording, so retries preserve event/RSVP identity.
    const identity = `${activity}:${occurrence}:${timeText}`;
    return {
      type: entry.type, label: String(entry.label || ''), activity_id: activity, occurrence_id: occurrence,
      source_event_id: identity, normalization_version: TIME_NORMALIZER_VERSION,
      extraction: { text: evidence, timeText }, normalized,
    };
  });
  // A schedule milestone may inherit its date only from one explicitly linked occurrence.
  for (const entry of times) {
    if (entry.type !== 'schedule' || entry.normalized.reason !== 'No date is associated with this time.') continue;
    const parents = times.filter(parent => parent.type === 'event' && parent.activity_id === entry.activity_id &&
      parent.occurrence_id === entry.occurrence_id && ['normalized', 'date_only'].includes(parent.normalized.status));
    if (parents.length === 1) {
      entry.normalized = normalizeTime(entry.extraction.timeText, entry.extraction.text, source, receivedAt,
        parents[0].normalized.timezone, parents[0].normalized.date);
      entry.normalized.inheritedDateFrom = parents[0].source_event_id;
    }
  }
  return times.map(entry => entry.type === 'event' ? { ...entry,
    related_times: times.filter(other => other !== entry && other.type !== 'event' && other.activity_id === entry.activity_id &&
      (!other.occurrence_id || other.occurrence_id === entry.occurrence_id)),
  } : entry);
}

