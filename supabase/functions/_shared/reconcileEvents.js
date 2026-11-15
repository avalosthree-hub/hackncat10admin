function words(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word.length > 2));
}
function similarity(a, b) {
  const left = words(a), right = words(b);
  const common = [...left].filter(word => right.has(word)).length;
  return common / Math.max(1, Math.min(left.size, right.size));
}

// Map clear matches to existing keys before the database upsert; never move an RSVP between rows.
export function reconcileEvents(times, existing) {
  const used = new Set();
  return times.map(entry => {
    if (entry.type !== 'event') return entry;
    const evidence = entry.extraction?.text || '';
    const timeText = entry.extraction?.timeText || '';
    const candidates = existing.filter(event => !used.has(event.id)).map(event => {
      const oldText = event.evidence?.extraction?.text || '';
      const oldDate = event.event_date || event.evidence?.normalized?.date || event.evidence?.extraction?.date;
      const sameDate = oldDate && oldDate === entry.normalized?.date;
      const titleMatch = similarity(event.title, entry.label);
      let score = 0;
      if (event.source_event_key === entry.source_event_id) score = 5;
      else if (evidence && evidence === oldText) score = 4;
      else if (timeText && oldText.includes(timeText) && titleMatch >= 0.5) score = 3;
      else if (sameDate && titleMatch >= 0.75) score = 2;
      return { event, score };
    }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
    if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0].score)) return entry;
    used.add(candidates[0].event.id);
    return { ...entry, source_event_id: candidates[0].event.source_event_key };
  });
}

