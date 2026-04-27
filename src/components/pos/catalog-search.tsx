"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";

export function CatalogSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  const submit = (v: string) => {
    const q = v.trim();
    router.push(q ? `/pos/catalog?q=${encodeURIComponent(q)}` : "/pos/catalog");
  };

  return (
    <div className="relative w-[360px]">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(value);
        }}
        placeholder="이름 · SKU · 바코드 검색"
        className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-base outline-none focus:border-primary"
      />
      {value ? (
        <button
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
