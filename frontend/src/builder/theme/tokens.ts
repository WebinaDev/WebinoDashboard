export function fillDocumentTokens<T>(document: T, tokens: Record<string, string | null | undefined>): T {
  let json = JSON.stringify(document)
  for (const [key, value] of Object.entries(tokens)) {
    const safe = JSON.stringify(value ?? "").slice(1, -1)
    json = json.split(`{{${key}}}`).join(safe)
  }
  return JSON.parse(json) as T
}
