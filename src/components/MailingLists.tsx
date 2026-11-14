import { useState } from "react";
import type { MailingList, Sender } from "../lib/admin";
import { addSender, createList, deleteList, message, removeSender, updateList, updateSender } from "../lib/admin";
import { navigate } from "../lib/routes";
import type { Workspace } from "./AdminStudio";
import Modal from "./Modal";
import TopicEditor from "./TopicEditor";

type Action = { kind: "create" } | { kind: "edit" | "delete"; list: MailingList } | { kind: "addSender"; list: MailingList } | { kind: "editSender" | "removeSender"; sender: Sender };

export default function MailingLists({ workspace, listId, onRefresh }: { workspace: Workspace; listId?: string; onRefresh: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const current = workspace.lists.find(list => list.id === listId);
  const lists = workspace.lists.filter(list => [list.tag, ...(list.hashtags ?? []), ...workspace.senders.filter(s => s.list_id === list.id).map(s => s.sender_email)].join(" ").toLowerCase().includes(search.toLowerCase()));
  function completed(text: string, newListId?: string) {
    setAction(null); setSuccess(text);
    if (newListId) navigate(`/admin/lists/${newListId}`);
    onRefresh();
  }
  if (listId && !current) return <div className="card"><h2>Mailing list unavailable</h2><p>This list does not exist or is outside your institution.</p><button onClick={() => navigate("/admin/lists")}>Back to mailing lists</button></div>;
  return <>
    {success && <p className="notice success" role="status">{success}</p>}
    {current ? <>
      <button className="back" onClick={() => navigate("/admin/lists")}>← All mailing lists</button>
      <div className="sectionTitle"><div><h2>{current.tag}</h2><p className="muted">Manage this list’s topic labels and approved senders.</p></div><div className="pageActions"><button className="secondary" onClick={() => setAction({ kind: "edit", list: current })}>Edit list & topics</button><button className="dangerOutline" onClick={() => setAction({ kind: "delete", list: current })}>Delete list</button></div></div>
      <section className="card"><h2>Topic labels</h2><p className="muted small">Allowed categories for future AI-generated posts. Existing post labels stay unchanged.</p><div className="topicChips">{current.hashtags?.length ? current.hashtags.map((label, index) => <span className="topicChip" key={`${label}-${index}`}>{label}</span>) : <p className="muted">No labels configured. Add topics with “Edit list & topics”.</p>}</div></section>
      <section className="card"><div className="sectionTitle"><div><h2>Registered sender addresses</h2><p className="muted small">Sender mappings route future incoming emails to this list.</p></div><button className="primary" onClick={() => setAction({ kind: "addSender", list: current })}>+ Add sender</button></div>
        {!workspace.senders.some(sender => sender.list_id === current.id) ? <div className="emptyState">No approved senders yet. Register an email address to route its incoming emails here.</div> : <ul className="senderList">{workspace.senders.filter(sender => sender.list_id === current.id).map(sender => <li key={sender.id}><div><strong>{sender.sender_email}</strong><small className="muted">Added {new Date(sender.created_at).toLocaleDateString()}</small></div><div className="pageActions"><button className="ghost" onClick={() => setAction({ kind: "editSender", sender })}>Edit / move</button><button className="ghost dangerText" onClick={() => setAction({ kind: "removeSender", sender })}>Remove</button></div></li>)}</ul>}
      </section>
    </> : <>
      <div className="sectionTitle"><div><h2>Mailing Lists <span>✦</span></h2><p className="muted">{workspace.lists.length} lists · {workspace.senders.length} registered sender addresses</p></div><button className="primary" onClick={() => setAction({ kind: "create" })}>+ Create mailing list</button></div>
      <label className="listSearch">Find a mailing list<input type="search" placeholder="Search by name, topic, or sender…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {!lists.length ? <div className="card emptyState">{workspace.lists.length ? "No mailing lists match your search." : "No mailing lists yet. Create your first list to start routing campus emails."}</div> : <div className="listCards">{lists.map(list => <article className="card listCard" key={list.id}><div className="row"><h3><a href={`#/admin/lists/${list.id}`}>{list.tag}</a></h3><span className="listSymbol" aria-hidden="true">✉</span></div><div className="topicChips">{list.hashtags?.length ? list.hashtags.map((label, index) => <span className="topicChip" key={`${label}-${index}`}>{label}</span>) : <span className="muted small">No topic labels</span>}</div><div className="senderPreview"><strong className="small">Approved senders</strong>{workspace.senders.filter(sender => sender.list_id === list.id).map(sender => <span key={sender.id}>{sender.sender_email}</span>)}{!workspace.senders.some(sender => sender.list_id === list.id) && <span>No senders registered</span>}</div><div className="listCardActions"><a className="textLink" href={`#/admin/lists/${list.id}`}>Manage list →</a><button className="ghost" onClick={() => setAction({ kind: "edit", list })}>Edit</button><button className="ghost dangerText" onClick={() => setAction({ kind: "delete", list })}>Delete</button></div></article>)}</div>}
    </>}
    {action && <ListAction key={JSON.stringify(action)} action={action} workspace={workspace} onClose={() => setAction(null)} onComplete={completed} />}
  </>;
}

function ListAction({ action, workspace, onClose, onComplete }: { action: Action; workspace: Workspace; onClose: () => void; onComplete: (text: string, newListId?: string) => void }) {
  const [name, setName] = useState("list" in action ? action.list.tag : "");
  const [labels, setLabels] = useState<string[]>("list" in action ? action.list.hashtags ?? [] : []);
  const [email, setEmail] = useState("sender" in action ? action.sender.sender_email : "");
  const [target, setTarget] = useState("sender" in action ? action.sender.list_id : "list" in action ? action.list.id : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titles = { create: "Create mailing list", edit: "Edit list & topic labels", delete: "Delete mailing list?", addSender: "Register sender address", editSender: "Edit sender mapping", removeSender: "Remove approved sender?" };
  const destructive = action.kind === "delete" || action.kind === "removeSender";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const institution = workspace.institution.id;
    try {
      switch (action.kind) {
        case "create": { const id = await createList(institution, name); onComplete("Mailing list created. Add topics and sender addresses below.", id); break; }
        case "edit": await updateList(institution, action.list.id, { tag: name, hashtags: labels }); onComplete("Mailing list saved. Topic changes apply to future posts."); break;
        case "delete": await deleteList(institution, action.list.id); navigate("/admin/lists"); onComplete("Mailing list deleted."); break;
        case "addSender": await addSender(institution, action.list.id, email); onComplete("Sender registered. Future emails from this address will route to this list."); break;
        case "editSender": await updateSender(institution, action.sender, target, email); onComplete("Sender mapping updated. Historical posts were not changed."); break;
        case "removeSender": await removeSender(institution, action.sender); onComplete("Approved sender removed."); break;
      }
    } catch (err) { setError(message(err)); setBusy(false); }
  }
  return <Modal title={titles[action.kind]} busy={busy} onClose={onClose}><form onSubmit={submit} className="modalForm"><fieldset disabled={busy}>
    {(action.kind === "create" || action.kind === "edit") && <label>Mailing list name<input autoFocus value={name} maxLength={150} required onChange={e => setName(e.target.value)} placeholder="e.g. College of Engineering" /></label>}
    {action.kind === "edit" && <TopicEditor labels={labels} onChange={setLabels} disabled={busy} />}
    {(action.kind === "addSender" || action.kind === "editSender") && <><label>Sender email address<input autoFocus type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="announcements@university.edu" /></label>{action.kind === "editSender" && <label>Route future emails to<select value={target} required onChange={e => setTarget(e.target.value)}>{workspace.lists.map(list => <option value={list.id} key={list.id}>{list.tag}</option>)}</select></label>}<p className="muted small">Each address can belong to one list. Changes affect future incoming emails; historical posts stay unchanged.</p></>}
    {action.kind === "delete" && <div className="destructiveWarning"><p>Delete <strong>{action.list.tag}</strong>?</p><p>Its sender mappings and student subscriptions will be deleted. Existing email posts will lose their list association and may disappear from feeds. This cannot be undone.</p></div>}
    {action.kind === "removeSender" && <div className="destructiveWarning"><p>Remove <strong>{action.sender.sender_email}</strong>?</p><p>Future emails from this address will no longer route to this list. Historical posts will remain unchanged.</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modalActions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className={destructive ? "danger" : "primary"}>{busy ? "Saving…" : destructive ? action.kind === "delete" ? "Delete mailing list" : "Remove sender" : action.kind === "create" ? "Create list" : "Save changes"}</button></div>
  </fieldset></form></Modal>;
}
