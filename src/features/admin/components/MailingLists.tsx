import { useState } from "react";
import type { MailingList, Sender } from "../api/admin";
import { addSenders, addSender, createList, deleteList, message, removeSender, updateList, updateSender } from "../api/admin";
import { navigate } from "../../../app/hooks/useRoute";
import type { Workspace } from "./AdminStudio";
import SavedSenderPicker from "./SavedSenderPicker";
import Modal from "../../../components/Modal";

type Action = { kind: "create" } | { kind: "edit" | "delete"; list: MailingList } | { kind: "addSender"; list: MailingList } | { kind: "editSender" | "removeSender"; sender: Sender };

export default function MailingLists({ workspace, listId, onRefresh }: { workspace: Workspace; listId?: string; onRefresh: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const current = workspace.lists.find(list => list.id === listId);
  const lists = workspace.lists.filter(list => [list.tag, list.description ?? "", ...workspace.senders.filter(s => s.list_id === list.id).map(s => s.sender_email)].join(" ").toLowerCase().includes(search.toLowerCase()));
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
      <div className="sectionTitle"><div><h2>{current.tag}</h2><p className="muted">Manage this list’s description and approved senders.</p></div><div className="pageActions"><button className="secondary" onClick={() => setAction({ kind: "edit", list: current })}>Edit list</button><button className="dangerOutline" onClick={() => setAction({ kind: "delete", list: current })}>Delete list</button></div></div>
      <section className="card"><h2>About this list</h2><p className="listDescription muted">{current.description || "No description yet. Add one with Edit list."}</p></section>
      <section className="card"><h2>Institution topic labels</h2><p className="muted small">All mailing lists use the institution’s shared topics for future emails.</p><a className="textLink" href="#/admin/topics">Manage institution topics →</a></section>
      <section className="card"><div className="sectionTitle"><div><h2>Registered sender addresses</h2><p className="muted small">Saved institution senders can be approved for this and other lists.</p></div><button className="primary" onClick={() => setAction({ kind: "addSender", list: current })}>+ Add sender</button></div>
        {!workspace.senders.some(sender => sender.list_id === current.id) ? <div className="emptyState">No approved senders yet. Register an email address to route its incoming emails here.</div> : <ul className="senderList">{workspace.senders.filter(sender => sender.list_id === current.id).map(sender => <li key={sender.id}><div><strong>{sender.sender_email}</strong><small className="muted">Added {new Date(sender.created_at).toLocaleDateString()}</small></div><div className="pageActions"><button className="ghost" onClick={() => setAction({ kind: "editSender", sender })}>Edit / move</button><button className="ghost dangerText" onClick={() => setAction({ kind: "removeSender", sender })}>Remove</button></div></li>)}</ul>}
      </section>
    </> : <>
      <div className="sectionTitle"><div><h2>Mailing Lists <span>✦</span></h2><p className="muted">{workspace.lists.length} lists · {workspace.directory.length} saved senders · {workspace.senders.length} approvals</p></div><button className="primary" onClick={() => setAction({ kind: "create" })}>+ Create mailing list</button></div>
      <label className="listSearch">Find a mailing list<input type="search" placeholder="Search by name, description, or sender…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {!lists.length ? <div className="card emptyState">{workspace.lists.length ? "No mailing lists match your search." : "No mailing lists yet. Create your first list to start routing campus emails."}</div> : <div className="listCards">{lists.map(list => <article className="card listCard" key={list.id}><div className="row"><h3><a href={`#/admin/lists/${list.id}`}>{list.tag}</a></h3><span className="listSymbol" aria-hidden="true">✉</span></div>{list.description && <p className="listDescription muted small">{list.description}</p>}<div className="senderPreview"><strong className="small">Approved senders</strong>{workspace.senders.filter(sender => sender.list_id === list.id).map(sender => <span key={sender.id}>{sender.sender_email}</span>)}{!workspace.senders.some(sender => sender.list_id === list.id) && <span>No senders registered</span>}</div><div className="listCardActions"><a className="textLink" href={`#/admin/lists/${list.id}`}>Manage list →</a><button className="ghost" onClick={() => setAction({ kind: "edit", list })}>Edit</button><button className="ghost dangerText" onClick={() => setAction({ kind: "delete", list })}>Delete</button></div></article>)}</div>}
    </>}
    {action && <ListAction key={JSON.stringify(action)} action={action} workspace={workspace} onClose={() => setAction(null)} onComplete={completed} />}
  </>;
}

function ListAction({ action, workspace, onClose, onComplete }: { action: Action; workspace: Workspace; onClose: () => void; onComplete: (text: string, newListId?: string) => void }) {
  const [name, setName] = useState("list" in action ? action.list.tag : "");
  const [deleteConfirmation,setDeleteConfirmation] = useState("");
  const [description,setDescription] = useState("list" in action ? action.list.description ?? "" : "");
  const [email, setEmail] = useState("sender" in action ? action.sender.sender_email : "");
  const [selectedSenders,setSelectedSenders] = useState<string[]>([]);
  const [newSender,setNewSender] = useState(!workspace.directory.length);
  const [target, setTarget] = useState("sender" in action ? action.sender.list_id : "list" in action ? action.list.id : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titles = { create: "Create mailing list", edit: "Edit mailing list", delete: "Delete mailing list?", addSender: "Register sender address", editSender: "Edit sender mapping", removeSender: "Remove approved sender?" };
  const destructive = action.kind === "delete" || action.kind === "removeSender";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    const institution = workspace.institution.id;
    try {
      switch (action.kind) {
        case "create": { const id = await createList(institution, name, description); onComplete("Mailing list created. Add sender addresses below.", id); break; }
        case "edit": await updateList(institution, action.list.id, { tag: name, description }); onComplete("Mailing list saved."); break;
        case "delete": await deleteList(institution, action.list.id, action.list.tag, deleteConfirmation); navigate("/admin/lists"); onComplete("Mailing list deleted."); break;
        case "addSender": if(newSender)await addSender(institution, action.list.id, email);else await addSenders(institution, action.list.id, selectedSenders);onComplete("Senders approved for this list."); break;
        case "editSender": await updateSender(institution, action.sender, target, email); onComplete("Sender mapping updated. Historical posts were not changed."); break;
        case "removeSender": await removeSender(institution, action.sender); onComplete("Approved sender removed."); break;
      }
    } catch (err) { setError(message(err)); setBusy(false); }
  }
  return <Modal title={titles[action.kind]} busy={busy} onClose={onClose}><form onSubmit={submit} className="modalForm"><fieldset disabled={busy}>
    {(action.kind === "create" || action.kind === "edit") && <label>Mailing list name<input autoFocus value={name} maxLength={150} required onChange={e => setName(e.target.value)} placeholder="e.g. College of Engineering" /></label>}
    {(action.kind === "create" || action.kind === "edit") && <label>Description (optional)<textarea value={description} maxLength={1000} rows={3} onChange={e=>setDescription(e.target.value)} placeholder="What updates will students receive from this list?" /><small className="muted">Describe the purpose and kinds of announcements shared here.</small></label>}
    {action.kind === "addSender" && <>
      <div className="chips"><button type="button" className={!newSender?"chip active":"chip"} onClick={()=>{setNewSender(false);setEmail("");}}>Choose saved senders</button><button type="button" className={newSender?"chip active":"chip"} onClick={()=>{setNewSender(true);setEmail("");}}>Add new address</button></div>
      {!newSender && <SavedSenderPicker directory={workspace.directory} approved={workspace.senders.filter(s=>s.list_id===target).map(s=>s.sender_email)} selected={selectedSenders} onChange={setSelectedSenders}/>}

    </>}
    {(action.kind === "editSender" || (action.kind === "addSender" && newSender)) && <label>Sender email address<input autoFocus type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="announcements@university.edu" /><small className="muted">New addresses are saved to the institution directory for reuse.</small></label>}
    {action.kind === "editSender" && <label>Move approval to<select value={target} required onChange={e=>setTarget(e.target.value)}>{workspace.lists.map(list=><option value={list.id} key={list.id}>{list.tag}</option>)}</select></label>}
    {(action.kind === "addSender" || action.kind === "editSender") && <p className="muted small">A sender may be approved for multiple lists. New incoming emails appear in every approved list.</p>}
    {action.kind === "delete" && <div className="destructiveWarning"><p>Delete <strong>{action.list.tag}</strong>?</p><p>Its sender mappings and student subscriptions will be deleted. Existing email posts will lose their list association and may disappear from feeds. This cannot be undone.</p></div>}
    {action.kind === "delete" && <label>Type <strong>{action.list.tag}</strong> to confirm deletion<input autoFocus aria-label="Confirm mailing list name" autoComplete="off" autoCapitalize="none" spellCheck={false} value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value)} required /><small className="muted">The list name must match exactly, including capitalization.</small></label>}
    {action.kind === "removeSender" && <div className="destructiveWarning"><p>Remove <strong>{action.sender.sender_email}</strong>?</p><p>This list will no longer receive future emails from this address. Its approvals on other lists and historical posts stay unchanged.</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modalActions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" disabled={busy||(action.kind==="delete"&&deleteConfirmation!==action.list.tag)||(action.kind==="addSender"&&(newSender?!email.trim():!selectedSenders.length))} className={destructive ? "danger" : "primary"}>{busy ? "Saving…" : destructive ? action.kind === "delete" ? "Delete mailing list" : "Remove sender" : action.kind === "create" ? "Create list" : action.kind==="addSender"&&!newSender?`Approve ${selectedSenders.length} sender${selectedSenders.length===1?"":"s"}`:"Save changes"}</button></div>
  </fieldset></form></Modal>;
}
