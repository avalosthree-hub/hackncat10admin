import { useCallback, useEffect, useState } from "react";
import type { Assignment, Counts, Institution, MailingList, RecentPost, Sender } from "../lib/admin";
import { getCounts, getInstitution, getMailingLists, getRecentPosts, getSenders, message } from "../lib/admin";
import { navigate } from "../lib/routes";
import type { Route } from "../lib/routes";
import MailingLists from "./MailingLists";
import Events from "./Events";
import Administrators from "./Administrators";

export type Workspace = { institution: Institution; lists: MailingList[]; senders: Sender[] };

export default function AdminStudio({ assignment, route, onAccessRefresh }: { assignment: Assignment; route: Route; onAccessRefresh: () => void }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    Promise.all([getInstitution(assignment.institution_id), getMailingLists(assignment.institution_id), getSenders(assignment.institution_id)])
      .then(([institution, lists, senders]) => { if (active) setWorkspace({ institution, lists, senders }); })
      .catch(err => { if (active) setError(message(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assignment.institution_id, version]);

  return <>
    <div className="pageHeading"><div><span className="eyebrow">INSTITUTION WORKSPACE</span><h1>{workspace?.institution.name || "Institution administration"}</h1><p className="muted">Manage the lists and events that keep your campus connected.</p></div><div className="pageActions"><span className="roleBadge">{assignment.role}</span><button className="secondary" disabled={loading} onClick={() => { refresh(); onAccessRefresh(); }}>Refresh</button></div></div>
    {error && <div className="notice error" role="alert">{error}<button className="ghost" onClick={refresh}>Try again</button></div>}
    {loading && <p role="status" className="loadingState">Loading institution workspace…</p>}
    {!error && workspace && <>
      {route.page === "overview" && <Overview key={version} institution={workspace.institution} />}
      {route.page === "events" && <Events key={`${workspace.institution.id}:${version}`} workspace={workspace} eventId={route.eventId} />}
      {route.page === "lists" && <MailingLists workspace={workspace} listId={route.listId} onRefresh={refresh} />}
      {route.page === "administrators" && (assignment.role === "owner" ? <Administrators institution={workspace.institution.id} currentUserId={assignment.user_id} onChange={refresh} /> : <div className="card"><h2>Owner access required</h2><p>Only institution owners can manage administrators.</p><button onClick={() => navigate("/admin/overview")}>Back to overview</button></div>)}
    </>}
  </>;
}

function Overview({ institution }: { institution: Institution }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [error, setError] = useState("");
  const [postsError, setPostsError] = useState("");
  const [postsLoading, setPostsLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getCounts(institution.id).then(data => { if (active) setCounts(data); }).catch(err => { if (active) setError(message(err)); });
    getRecentPosts(institution.id).then(data => { if (active) setPosts(data); }).catch(err => { if (active) setPostsError(message(err)); }).finally(() => { if (active) setPostsLoading(false); });
    return () => { active = false; };
  }, [institution.id]);
  return <>
    <div className="sectionTitle"><div><h2>Overview <span>✦</span></h2><p className="muted">A quick look at your institution’s feed.</p></div></div>
    {error && <p className="notice error" role="alert">Could not load totals: {error}</p>}
    <div className="statsGrid">{[["Mailing lists", counts?.lists, "↗"], ["Registered senders", counts?.senders, "✉"], ["Administrators", counts?.administrators, "♙"]].map(([label, value, icon]) => <div className="statCard" key={label}><div className="statIcon" aria-hidden="true">{icon}</div><strong>{value ?? "—"}</strong><span>{label}</span></div>)}</div>
    <div className="card gettingStarted"><div><h2>Build a better campus feed.</h2><p>Register approved senders and choose the topics your community needs.</p></div><button className="primary" onClick={() => navigate("/admin/lists")}>Manage mailing lists →</button></div>
    <section className="card"><div className="sectionTitle"><div><h2>Recent email posts</h2><p className="muted small">Latest five posts in your institution.</p></div></div>{postsLoading ? <p role="status">Loading recent posts…</p> : postsError ? <p role="alert" className="error">{postsError}</p> : !posts.length ? <div className="emptyState">No email posts yet. Add a mailing list and register a sender to get started.</div> : <div className="recentPosts">{posts.map(post => <article className="recentPost" key={post.id}><div className="row"><h3>{post.title || "Untitled post"}</h3><span className="roleBadge">{post.status}</span></div><p>{post.caption}</p><div className="topicChips">{post.hashtags?.map(label => <span className="topicChip" key={label}>{label}</span>)}</div><time className="muted small" dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time></article>)}</div>}</section>
  </>;
}
