"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function SearchBar() {
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
    router.push(q ? `/feed?q=${encodeURIComponent(q)}` : "/feed");
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
