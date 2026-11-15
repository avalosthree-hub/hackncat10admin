import type { Assignment } from "../features/admin/api/admin";
import type { Route } from "../app/hooks/useRoute";

type Props = { email: string; assignment?: Assignment; assignments: Assignment[]; route: Route; onInstitutionChange: (id: string) => void; onLogout: () => void };

export default function Sidebar({ email, assignment, assignments, route, onInstitutionChange, onLogout }: Props) {
  const items = assignment ? [
    { page: "overview", name: "Overview", icon: "▦", href: "#/admin/overview" },
    { page: "lists", name: "Mailing Lists", icon: "✉", href: "#/admin/lists" },
    { page: "events", name: "Events", icon: "▣", href: "#/admin/events" },
    { page: "event-review", name: "Event Review", icon: "⇄", href: "#/admin/event-review" },
    { page: "topics", name: "Institution Topics", icon: "#", href: "#/admin/topics" },
    { page: "senders", name: "Approved Senders", icon: "@", href: "#/admin/senders" },
    ...(assignment.role === "owner" ? [{ page: "administrators", name: "Administrators", icon: "♙", href: "#/admin/administrators" }] : []),
  ] : [];
  return <aside className="sidebar">
    <a className="brand" href={assignment ? "#/admin/overview" : "#/feed"}><img className="brandIcon" src="/aggie-fetch-logo.png" alt="" width={44} height={44} /><div><strong>fetchy.</strong><small>YOUR AGGIE FEED</small></div></a>
    {assignments.length > 1 && <label className="institutionPicker">Institution<select value={assignment?.institution_id ?? ""} onChange={e => onInstitutionChange(e.target.value)}>{assignments.map(item => <option key={item.institution_id} value={item.institution_id}>{item.institution_name || "Institution"} · {item.role}</option>)}</select></label>}
    <nav aria-label="Main navigation"><div className="sideLabel">MANAGE YOUR CAMPUS</div>{items.map(item => <a key={item.page} href={item.href} className={route.page === item.page ? "nav active" : "nav"} aria-current={route.page === item.page ? "page" : undefined}><span aria-hidden="true">{item.icon}</span><span className="navLabel">{item.name}</span></a>)}
    <div className="sideLabel">DISCOVER</div><a href="#/feed" className={route.page === "feed" ? "nav active" : "nav"} aria-current={route.page === "feed" ? "page" : undefined}><span aria-hidden="true">⌂</span><span className="navLabel">Student Feed</span></a></nav>
    <div className="sideBottom"><div className="avatar">{(email[0] || "A").toUpperCase()}</div><div className="userText"><strong>{assignment ? assignment.role === "owner" ? "Institution Owner" : "Administrator" : "Student Account"}</strong><small>{email}</small></div><button className="iconBtn" title="Sign out" aria-label="Sign out" onClick={onLogout}>↪</button></div>
  </aside>;
}
