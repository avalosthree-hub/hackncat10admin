import { useState } from "react";
import { normalizeLabels } from "../lib/admin";

export default function TopicEditor({ labels, onChange, disabled }: { labels: string[]; onChange: (labels: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function add() {
    try {
      const next = normalizeLabels([...labels, draft]);
      if (next.length === labels.length) { setError("That topic label is already included."); return; }
      onChange(next); setDraft(""); setError("");
    } catch (err) { setError((err as Error).message); }
  }
  return <fieldset className="topicEditor" disabled={disabled}>
    <legend>Allowed topic labels</legend>
    <p className="muted small">The AI chooses from these labels for future emails. Existing posts keep their labels.</p>
    <div className="topicChips">{labels.map((label, index) => <span className="topicChip" key={`${label}-${index}`}>{label}<button type="button" aria-label={`Remove ${label}`} onClick={() => onChange(labels.filter((_, i) => i !== index))}>×</button></span>)}{!labels.length && <span className="muted small">No topic labels configured.</span>}</div>
    <div className="addRow"><input aria-label="New topic label" value={draft} maxLength={100} placeholder="e.g. Research Opportunities" onChange={e => { setDraft(e.target.value); setError(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /><button type="button" onClick={add}>Add label</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </fieldset>;
}
