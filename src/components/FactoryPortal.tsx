"use client";
import { useCallback, useEffect, useState } from "react";
import { FactoryProvisioner } from "./FactoryProvisioner";

type Session = { authenticated: boolean; user?: { email: string }; expiresAt?: number };
const field = "mt-2 min-h-11 w-full rounded-lg border border-muted bg-bg px-3 py-2.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
export default function FactoryPortal() {
  const [session, setSession] = useState<Session>({ authenticated: false });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState("");
  const request = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, { ...init, credentials: "same-origin" });
    if (response.status === 401) { setSession({ authenticated: false }); setError("Factory session ended. Sign in again. / 会话已结束，请重新登录。"); }
    return response;
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/factory/session", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000) }).then(async res => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Factory sign-in unavailable.");
      if (active) setSession(data);
    }).catch(() => { if (active) setError("Factory sign-in could not be checked. Try signing in below. / 无法检查登录状态，请在下方登录。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch("/api/factory/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }), signal: AbortSignal.timeout(20000) });
      const data = await res.json(); if (!res.ok) {
        const chinese = res.status === 401 ? "请核对工厂登录邮箱和密码。" : res.status === 403 ? "工厂权限不可用或已过期，请联系 Peter。" : res.status === 429 ? "登录尝试过多，请稍后重试；设备上传不受影响。" : "暂时无法登录，请稍后重试。";
        throw new Error(`${data.error || "Sign-in failed."} / ${chinese}`);
      }
      setPassword(""); setSession(data);
    } catch (e) { setPassword(""); setError(e instanceof Error ? e.message : "Sign-in failed. Try again. / 登录失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function logout() {
    setError("");
    try {
      const res = await fetch("/api/factory/session", { method: "DELETE", credentials: "same-origin", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error();
      setSession({ authenticated: false }); setPassword("");
    } catch { setError("Sign-out did not finish. Try again. / 退出未完成，请重试。"); }
  }
  const loginForm = <form onSubmit={event => void signIn(event)} className="max-w-lg">
    <h3 className="text-lg font-semibold text-ink">Factory login / 工厂登录</h3>
    <p className="mt-3 text-sm leading-6 text-muted">Use Account A’s email and password from your private guide. The email is a login name; no mailbox, Google sign-in or registration is needed.</p>
    <p className="mt-2 text-sm leading-6 text-muted" lang="zh-CN">使用机密指南中 Account A 的邮箱和密码。邮箱仅为登录用户名，无需收取邮件、使用 Google 或注册新账号。</p>
    <label htmlFor="factory-login" className="mt-4 block text-sm font-medium">Factory email / 工厂登录邮箱<input id="factory-login" className={field} type="email" autoComplete="username" required maxLength={120} value={login} onChange={e => setLogin(e.target.value)} disabled={busy} /></label>
    <label htmlFor="factory-login-password" className="mt-4 block text-sm font-medium">Password / 密码<input id="factory-login-password" className={field} type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
    <button className="mt-5 min-h-11 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-bg hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50" disabled={busy} aria-label="Sign in to factory account / 登录工厂账号">{busy ? "Signing in… / 登录中…" : "Sign in / 登录"}</button>
    <p className="mt-3 text-xs leading-5 text-muted">Factory testing access only. Your batch limit and expiry still apply. / 仅限工厂测试，原有设备名额和权限有效期仍然适用。</p>
  </form>;
  return <>
    {error && <p role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900">{error}</p>}
    {session.authenticated && session.expiresAt && <p className="mb-4 text-sm text-muted">Factory session until {new Date(session.expiresAt * 1000).toLocaleString()} · 工厂会话有效期</p>}
    <FactoryProvisioner key={session.user?.email ?? "signed-out"} auth={{ isAuthenticated: session.authenticated, isLoading: loading, user: session.user ?? null, request, logout, loginForm }} />
  </>;
}
