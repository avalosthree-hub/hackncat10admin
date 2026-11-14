import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import Student from "./Student";
import Admin from "./Admin";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<"student" | "admin" | null>(null);
  const [loading, setLoading] = useState(true);
  // Admins can preview the student page. This only changes what is shown;
  // database access is still decided by the account's real role.
  const [previewStudent, setPreviewStudent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      return;
    }
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setRole((data?.role as "student" | "admin") ?? "student"));
  }, [session]);

  if (loading) return <p className="center">Loading...</p>;
  if (!session) return <Login />;
  if (!role) return <p className="center">Loading...</p>;

  return (
    <div className="app">
      <header>
        <h1>Student Inbox</h1>
        <div>
          <span className="muted">{session.user.email} ({role})</span>{" "}
          {role === "admin" && (
            <button className="ghost" onClick={() => setPreviewStudent(!previewStudent)}>
              {previewStudent ? "Back to admin view" : "Preview student view"}
            </button>
          )}{" "}
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      {role === "admin" && previewStudent && (
        <p className="muted small">Student preview. As an admin this shows every email; real students only see emails routed to them.</p>
      )}
      {role === "admin" && !previewStudent ? <Admin /> : <Student userId={session.user.id} />}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Account created. Check your email if confirmation is on, then sign in.");
  }

  return (
    <form className="card login" onSubmit={submit}>
      <h1>Student Inbox</h1>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      <button type="submit">{mode === "in" ? "Sign in" : "Create account"}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
      {msg && <p className="muted">{msg}</p>}
    </form>
  );
}
