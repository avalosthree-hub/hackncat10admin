import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, normalizeLabels } from '../src/lib/validation.ts';

test('normalizes routing addresses before they are written', () => {
  assert.equal(normalizeEmail('  Research@NCAT.edu  '), 'research@ncat.edu');
});
test('rejects invalid and empty routing addresses', () => {
  for (const input of ['', ' ', 'person', 'person@', 'person @ncat.edu', 'person@ncat', 'a@@ncat.edu']) {
    assert.throws(() => normalizeEmail(input), /valid email/);
  }
});
test('preserves multi-word topic categories and their display spelling', () => {
  assert.deepEqual(normalizeLabels([' Research Opportunities ', 'Internships & Co-ops', 'Scholarships & Funding']),
    ['Research Opportunities', 'Internships & Co-ops', 'Scholarships & Funding']);
});
test('deduplicates topic labels without regard to case', () => {
  assert.deepEqual(normalizeLabels(['Research Opportunities', 'research opportunities', ' RESEARCH OPPORTUNITIES ']), ['Research Opportunities']);
});
test('allows clearing all labels and rejects blank or excessive labels', () => {
  assert.deepEqual(normalizeLabels([]), []);
  assert.throws(() => normalizeLabels(['   ']), /empty/);
  assert.throws(() => normalizeLabels(['a'.repeat(101)]), /100 characters/);
});

import { attendanceSignal } from '../src/features/events/api/attendance.ts';
test('attendance range excludes assumptions about interested students attending', () => {
  assert.deepEqual(attendanceSignal(10, 20, null), { level: 'growing', label: 'Growing traction', range: '10–30', total: 30 });
  assert.equal(attendanceSignal(10, 20, 15).range, '10–15');
  assert.equal(attendanceSignal(10, 0, null).range, '10');
  assert.equal(attendanceSignal(0, 0, null).label, 'No RSVPs yet');
});
test('traction chip thresholds use capacity-capped projected attendance', () => {
  assert.equal(attendanceSignal(0,24,null).level,'early');
  assert.equal(attendanceSignal(0,25,null).level,'growing');
  assert.equal(attendanceSignal(0,75,null).level,'high');
  assert.equal(attendanceSignal(0,100,20).level,'early');
});

import { swipeDirection } from '../src/features/events/api/swipe.ts';
test('review swipes require a deliberate horizontal drag', () => {
 assert.equal(swipeDirection(100,10),'approve');
 assert.equal(swipeDirection(-100,10),'skip');
 assert.equal(swipeDirection(89,0),null);
 assert.equal(swipeDirection(100,100),null);
 assert.equal(swipeDirection(0,200),null);
});

import { evidenceSnippets, highlightEvidence, originalEmail } from '../src/features/events/api/emailEvidence.ts';
test('source quotations come from extraction, not inferred normalized values', () => {
 assert.deepEqual(evidenceSnippets({extraction:{text:'Join the showcase',timeText:'3 pm'},normalized:{name:'Inferred Hall',start:'2027-01-20'}}),['Join the showcase','3 pm']);
});
test('email evidence highlights preserve source text and merge overlapping quotations', () => {
 const text='Hello. Join   THE showcase at 3 pm. Join the showcase again.';
 const parts=highlightEvidence(text,['Join the showcase','3 pm','THE showcase']);
 assert.equal(parts.map(p=>p.text).join(''),text);
 assert.deepEqual(parts.filter(p=>p.highlighted).map(p=>p.text),['Join   THE showcase','3 pm','Join the showcase']);
 assert.ok(highlightEvidence('Meet at A+B (Room 2).',['A+B (Room 2)']).some(p=>p.highlighted));
 assert.ok(!highlightEvidence('An unrelated email',['Invented quote']).some(p=>p.highlighted));
});
test('original email supports nested provider payloads and stored plain text', () => {
 const email=originalEmail({subject:'Fallback',raw_email:JSON.stringify({data:{subject:'Source subject',from:{name:'Campus',email:'campus@ncat.edu'},text:'Original message'}})});
 assert.equal(email.subject,'Source subject');assert.equal(email.sender,'Campus <campus@ncat.edu>');assert.equal(email.body,'Original message');
 assert.equal(originalEmail({raw_email:'Plain message'}).body,'Plain message');
 assert.equal(originalEmail(null).body,'');
});

import { dateSchedule, formatSchedule } from '../src/features/events/api/schedule.ts';
test('all-day and date-only schedules preserve dates without inventing times', () => {
 for(const type of ['all_day','date_only']){
  const fields=dateSchedule(type,'2027-01-20','2027-01-22');
  assert.equal(fields.starts_at,null);assert.equal(fields.ends_at,null);
  assert.equal(fields.event_date,'2027-01-20');assert.equal(fields.event_end_date,'2027-01-22');
  assert.ok(!formatSchedule({...fields,timezone:'America/New_York'}).includes('12:00'));
 }
 assert.equal(dateSchedule('end_date_only','','2027-01-22').event_date,'2027-01-22');
 assert.match(formatSchedule({...dateSchedule('end_date_only','','2027-01-22'),timezone:'America/New_York'}),/^Ends .*time not specified/);
 assert.throws(()=>dateSchedule('all_day','',''),/valid start/);
 assert.throws(()=>dateSchedule('date_only','2027-01-22','2027-01-20'),/on or after/);
 assert.throws(()=>dateSchedule('end_date_only','','2027-02-30'),/valid end/);
});
