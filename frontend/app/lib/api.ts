import { toast } from "./toast";
import { getJson as sdkGetJson, postJson as sdkPostJson, deleteJson as sdkDeleteJson } from "./sdkBackend";

export const backendUrl = () => process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

function fireToast(msg: string) {
  toast(msg, "error");
}

export async function fetchJson<T>(path: string): Promise<T> {
  try {
    return await sdkGetJson<T>(backendUrl(), path);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to connect to server";
    fireToast(msg);
    throw err;
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    return await sdkPostJson<T>(backendUrl(), path, body);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to connect to server";
    fireToast(msg);
    throw err;
  }
}

export async function deleteJson<T>(path: string, body: unknown): Promise<T> {
  try {
    return await sdkDeleteJson<T>(backendUrl(), path, body);
  } catch (err: any) {
    const msg = err?.message ?? "Failed to connect to server";
    fireToast(msg);
    throw err;
  }
}
