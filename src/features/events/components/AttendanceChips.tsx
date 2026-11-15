import { attendanceSignal } from '../api/attendance';
import type { Metrics } from '../api/events';
export default function AttendanceChips({metrics,capacity}:{metrics?:Metrics;capacity:number|null}) {
 const signal=attendanceSignal(metrics?.going??0,metrics?.interested??0,capacity);
 return <><span className={`attendanceChip ${signal.level}`}>{signal.label}</span><span className="attendanceChip" title="Going to Going + Interested, capped at capacity. Not Going is excluded.">Projected attendance: {signal.range}</span></>;
}
