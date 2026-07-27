"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export async function postAiJson<T>(url: string, body: unknown): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const result = await response.json() as T & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new Error(result.error?.message || "AI 요청을 처리하지 못했습니다.");
  }
  return result;
}
