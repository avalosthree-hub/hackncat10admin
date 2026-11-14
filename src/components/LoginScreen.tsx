import { useState } from "react";
import { message } from "../lib/admin";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured || busy) return;
    setBusy(true);
    try {
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Account created. Check your email if confirmation is on, then sign in.");
    } catch (error) { setMsg(message(error)); }
    finally { setBusy(false); }
  }

  return (
    <main className="login"><form className="loginCard" onSubmit={submit}>
      <div className="logoMark">🐾</div>
      <span className="eyebrow">YOUR AGGIE COMMUNITY</span>
      <h1>Welcome to fetchy.</h1>
      <p>Campus updates, all in one place.</p>
      <input aria-label="Email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input aria-label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      {!isSupabaseConfigured && <p className="error" role="status">To enable sign-in, copy .env.example to .env.local, add this project’s Supabase URL and anon key, and restart the dev server.</p>}
      <button type="submit" disabled={!isSupabaseConfigured || busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
      <button type="button" disabled={busy} className="ghost" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
      {msg && <p className="muted" role="status">{msg}</p>}
    </form></main>
  );
}
