"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function SearchBar() {
  if (process.env.NEXT_PUBLIC_SEARCH_ENABLED === "false") {
    return null;
  }
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  // Hooks must come before any conditional returns.
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  if (pathname === "/") return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = value.trim();
    const feedRoutes = new Set(["/feed", "/streams", "/intents", "/slashings"]);
    const base = feedRoutes.has(pathname) ? pathname : "/feed";
    router.push(q ? `${base}?q=${encodeURIComponent(q)}` : base);
  }

  return (
    <form onSubmit={submit}>
      <input
        className="nav-search"
        placeholder="Search makers, intents"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  );
}
