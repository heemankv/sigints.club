"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function SearchBar() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  if (pathname === "/") return null;
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = value.trim();
    if (!q) {
      router.push("/feed");
      return;
    }
    router.push(`/feed?q=${encodeURIComponent(q)}`);
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
