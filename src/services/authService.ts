import { AuthStatus } from "../types";

export async function getAuthUrl(): Promise<string> {
  const res = await fetch("/api/auth/url");
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP error! status: ${res.status}`);
  }
  return data.url;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status");
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
