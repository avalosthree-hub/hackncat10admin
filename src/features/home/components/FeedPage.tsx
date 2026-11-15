import EmailAttachments from "../../../components/EmailAttachments";
import { useEffect, useRef, useState } from "react";
import { fetchFeed } from "../api/feed";
import type { Cursor, FeedPost } from "../api/feed";
import { message } from "../../admin/api/admin";

// Preserve the student inbox interaction while using the existing authorized feed RPC.
export default function FeedPage({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    generation.current += 1; pending.current = false;
    setLoading(true); setError(""); setPosts([]); setCursor(null);
    fetchFeed().then(data => { if (active) { setPosts(data.posts); setCursor(data.hasMore ? data.nextCursor : null); } }).catch(err => { if (active) setError(message(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; generation.current += 1; };
  }, [userId, version]);
  async function loadMore() {
    if (!cursor || pending.current || loading) return;
    const request = generation.current;
    pending.current = true; setLoading(true); setError("");
    try {
      const data = await fetchFeed(cursor);
      if (request !== generation.current) return;
      setPosts(current => [...new Map([...current, ...data.posts].map(post => [post.id, post])).values()]);
      setCursor(data.hasMore ? data.nextCursor : null);
    } catch (err) { if (request === generation.current) setError(message(err)); }
    finally { if (request === generation.current) { pending.current = false; setLoading(false); } }
  }
  const labels = ["All", ...new Set(posts.flatMap(post => post.hashtags ?? []))];
  const shown = posts.filter(post => filter === "All" || post.hashtags?.includes(filter));
  return <>
    <div className="hero"><div><span className="heroTag">✦ YOUR CAMPUS. YOUR COMMUNITY.</span><h1>Hey, Aggies.<br /><em>Let’s fetch.</em></h1><p>All the opportunities, events, and updates you need. One feed, zero clutter.</p></div><div className="heroArt" aria-hidden="true"><img src="/aggie-fetch-logo.png" alt="" width={180} height={180} /></div></div>
    <div className="sectionTitle"><div><h2>Your feed <span>✦</span></h2><p className="muted">Published updates from the lists you subscribe to.</p></div><button className="secondary" disabled={loading} onClick={() => setVersion(v => v + 1)}>Refresh</button></div>
    <div className="chips">{labels.map(label => <button key={label} className={filter === label ? "chip active" : "chip"} onClick={() => setFilter(label)}>{label}</button>)}</div>
    {error && <p className="notice error" role="alert">{error}<button className="ghost" onClick={() => cursor ? void loadMore() : setVersion(v => v + 1)}>Retry</button></p>}
    {loading && <p role="status">Loading your feed…</p>}
    {!loading && !error && !shown.length && <div className="card emptyState">No posts to show from your subscribed lists.</div>}
    {shown.map(post => <article className="card item" key={post.id}><button className="item-head" aria-expanded={open === post.id} onClick={() => setOpen(open === post.id ? null : post.id)}><div className="row"><strong>{post.title || "Untitled announcement"}</strong><span className="chevron">{open === post.id ? "▲" : "▼"}</span></div><p className="muted small">{post.list.name} · {new Date(post.created_at).toLocaleDateString()}</p><p className="preview-text muted">{post.caption}</p><div className="topicChips">{post.hashtags?.map(label => <span className="topicChip" key={label}>{label}</span>)}</div></button>{open === post.id && <div className="details"><p className="body">{post.content}</p><EmailAttachments attachments={post.attachments}/></div>}</article>)}
    {cursor && <div className="loadMorePosts"><button disabled={loading} onClick={() => { void loadMore(); }}>Load more announcements</button><p className="muted small">Topic filters apply to loaded announcements.</p></div>}
  </>;
}
