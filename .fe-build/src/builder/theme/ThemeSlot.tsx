import { Fragment, type ReactNode } from "react"

import { StorefrontDocument, loadResolvedTemplate } from "../public-document"
import { fillDocumentTokens } from "./tokens"
import { requestThemeContext } from "./request"
import type { ThemeKind, ThemeQuery } from "./context"
import type { RuntimeContext } from "../types"

export async function ThemeSlot({
  kind,
  children,
  runtime,
  tokens,
  context,
}: {
  kind: ThemeKind
  children?: ReactNode
  runtime?: RuntimeContext
  tokens?: Record<string, string | null | undefined>
  context?: Partial<ThemeQuery>
}) {
  const query = await requestThemeContext(context)
  const resolved = await loadResolvedTemplate(kind, query)
  if (!resolved) return <Fragment>{children}</Fragment>
  const document = tokens ? fillDocumentTokens(resolved, tokens) : resolved
  return <StorefrontDocument document={document} runtime={runtime} context={query} />
}
