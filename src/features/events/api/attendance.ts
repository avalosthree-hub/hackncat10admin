// A transparent RSVP range, not a statistical attendance forecast.
export function attendanceSignal(going: number, interested: number, capacity: number | null) {
  const upper = Math.max(going, Math.min(going + interested, capacity ?? Infinity));
  const level = upper === 0 ? 'none' : upper < 25 ? 'early' : upper < 75 ? 'growing' : 'high';
  const label = { none: 'No RSVPs yet', early: 'Early traction', growing: 'Growing traction', high: 'High traction' }[level];
  const range = going === upper ? `${going}` : `${going}–${upper}`;
  return { level, label, range, total: going + interested };
}
