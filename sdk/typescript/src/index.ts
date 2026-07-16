import type { paths } from "./schema"

export type { paths } from "./schema"

export type DashboardClientOptions = {
  baseUrl: string
  token?: string
  credentials?: RequestCredentials
}

export class DashboardClient {
  private readonly baseUrl: string
  private readonly token?: string
  private readonly credentials: RequestCredentials

  constructor(opts: DashboardClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "")
    this.token = opts.token
    this.credentials = opts.credentials ?? (opts.token ? "omit" : "include")
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: this.credentials,
      headers,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) {
      throw new Error(typeof data?.message === "string" ? data.message : `HTTP ${res.status}`)
    }
    return data as T
  }

  login(email: string, password: string, opts?: { otp?: string; recoveryCode?: string }) {
    return this.request<unknown>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        ...(opts?.otp ? { otp: opts.otp } : {}),
        ...(opts?.recoveryCode ? { recovery_code: opts.recoveryCode } : {}),
      }),
    })
  }

  refresh() {
    return this.request<unknown>("/api/v1/auth/refresh", { method: "POST" })
  }

  logout() {
    return this.request<unknown>("/api/v1/auth/logout", { method: "POST" })
  }

  gate() {
    return this.request<unknown>("/api/v1/auth/gate")
  }

  check() {
    return this.request<unknown>("/api/v1/auth/check")
  }

  openapi() {
    return this.request<Record<string, unknown>>("/api/v1/openapi.json")
  }

  api<T>(method: string, path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: method.toUpperCase(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  }
}
