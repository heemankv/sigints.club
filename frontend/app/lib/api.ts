import { toast } from "./toast";

export const backendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

function fireToast(msg: string) {
  toast(msg, "error");
}

export async function fetchJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, { cache: "no-store" });
  } catch {
    const msg = "Failed to connect to server";
    fireToast(msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    const msg = `Backend error ${res.status}`;
    fireToast(msg);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    const msg = "Failed to connect to server";
    fireToast(msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    const text = await res.text();
    const msg = `Backend error ${res.status}: ${text}`;
    fireToast(msg);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function deleteJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${backendUrl()}${path}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    const msg = "Failed to connect to server";
    fireToast(msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    const msg = `Backend error ${res.status}`;
    fireToast(msg);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
