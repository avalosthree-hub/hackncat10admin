export default function TopBar({ admin }: { admin: boolean }) {
  return <header className="topBar"><span className="workspaceLabel">{admin ? "Campus workspace / Admin Studio" : "Campus workspace / Home Feed"}</span><span className="pill">🐾 fetchy community</span></header>;
}
