import { codeMatchesPath, splitCode } from "../custom-code"
import type { CustomCode } from "../globals"

/**
 * Code Manager output (head / end of body) for the current path. Only users with the builder "design" capability can
 * save custom code; it runs as-is on the live site by design (like Elementor/Webflow custom code).
 */
export function CustomCodeSlot({ entries, location, path }: { entries: CustomCode[] | undefined; location: "head" | "body_end"; path: string }) {
  const active = (entries ?? []).filter((entry) => entry.location === location && codeMatchesPath(entry, path))
  if (!active.length) return null
  return (
    <>
      {active.flatMap((entry) =>
        splitCode(entry.code).map((part, index) =>
          part.kind === "script" ? (
            part.src ? (
              <script key={`${entry.id}-${index}`} src={part.src} async={part.async} defer={part.defer} />
            ) : (
              <script key={`${entry.id}-${index}`} dangerouslySetInnerHTML={{ __html: part.body }} />
            )
          ) : (
            <div key={`${entry.id}-${index}`} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: part.body }} />
          ),
        ),
      )}
    </>
  )
}
