import { headers } from "next/headers"

import { inferThemeQuery, type ThemeQuery } from "./context"

export async function requestThemeContext(extra?: Partial<ThemeQuery>): Promise<ThemeQuery> {
  const bag = await headers()
  const raw = bag.get("x-webino-path") || "/"
  const [path, search] = raw.split("?")
  return { ...inferThemeQuery(path || "/", search ?? ""), ...extra }
}
