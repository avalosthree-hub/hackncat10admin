import { useEffect, useState } from "react";

export type Route = { page: "overview" | "lists" | "administrators" | "feed"; listId?: string };
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/$/, "");
  if (path === "/feed") return { page: "feed" };
  if (path === "/admin/administrators") return { page: "administrators" };
  const match = path.match(/^\/admin\/lists(?:\/([0-9a-f-]{36}))?$/i);
  if (match) return { page: "lists", listId: match[1] };
  return { page: "overview" };
}
export function navigate(path: string) { window.location.hash = path; }
export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
