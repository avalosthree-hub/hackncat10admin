import { useEffect, useState } from "react";
import { assignAdministrator, getAdministrators, message, removeAdministrator } from "../api/admin";
import type { Administrator } from "../api/admin";
import Modal from "../../../components/Modal";

export default function Administrators({ institution, currentUserId, onChange }: { institution: string; currentUserId: string; onChange: () => void }) {
  const [rows, setRows] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState<"add" | Administrator | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getAdministrators(institution).then(data => { if (active) setRows(data); }).catch(err => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [institution, version]);
  function open(value: "add" | Administrator) { setDialog(value); setEmail(""); setFormError(""); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !dialog) return; setBusy(true); setFormError("");
    try {
      if (dialog === "add") await assignAdministrator(institution, email);
      else await removeAdministrator(institution, dialog.user_id);
      setSuccess(dialog === "add" ? "Administrator added." : "Administrator access removed. Their student account is unchanged.");
      setDialog(null); setVersion(v => v + 1); onChange();
    } catch (err) { setFormError(message(err)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="sectionTitle"><div><h2>Administrators <span>✦</span></h2><p className="muted">Manage staff access to this institution.</p></div><button className="primary" onClick={() => open("add")}>+ Add administrator</button></div>
    {success && <p role="status" className="notice success">{success}</p>}
    {error && <p role="alert" className="notice error">{error}<button className="ghost" onClick={() => setVersion(v => v + 1)}>Retry</button></p>}
    <section className="card"><p className="muted small">Owners manage administrator access. Administrators manage mailing lists, topic labels, and sender addresses. Owner roles cannot be changed here.</p>{loading ? <p role="status">Loading administrators…</p> : !error && !rows.length ? <p className="emptyState">No administrators found.</p> : <ul className="senderList">{rows.map(admin => <li key={admin.user_id}><div><strong>{admin.email || "Registered account"}{admin.user_id === currentUserId ? " (you)" : ""}</strong><small className="muted">Added {new Date(admin.created_at).toLocaleDateString()}</small></div><div className="pageActions"><span className="roleBadge">{admin.role}</span>{admin.role === "admin" && <button className="ghost dangerText" onClick={() => open(admin)}>Remove</button>}</div></li>)}</ul>}</section>
    {dialog && <Modal title={dialog === "add" ? "Add administrator" : "Remove administrator?"} busy={busy} onClose={() => setDialog(null)}><form className="modalForm" onSubmit={submit}><fieldset disabled={busy}>{dialog === "add" ? <><label>University email address<input autoFocus type="email" value={email} maxLength={254} required placeholder="staff@university.edu" onChange={e => setEmail(e.target.value)} /></label><p className="muted small">The account must already be registered and belong to this institution. This grants the administrator role.</p></> : <p>Remove administrator access for <strong>{dialog.email}</strong>? They will keep their normal student account.</p>}{formError && <p role="alert" className="error">{formError}</p>}<div className="modalActions"><button type="button" className="secondary" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className={dialog === "add" ? "primary" : "danger"}>{busy ? "Saving…" : dialog === "add" ? "Add administrator" : "Remove administrator"}</button></div></fieldset></form></Modal>}
  </>;
}
