/** Interaction builder (#55): trigger → action on this element or a target, no animation library. */
export type InteractionTrigger = "click" | "hover" | "inview"
export type InteractionAction = "show" | "hide" | "toggle" | "toggleClass" | "addClass" | "removeClass" | "scrollTo" | "openPopup"
export type Interaction = { trigger: InteractionTrigger; action: InteractionAction; target?: string; className?: string }

export const INTERACTION_TRIGGERS: InteractionTrigger[] = ["click", "hover", "inview"]
export const INTERACTION_ACTIONS: InteractionAction[] = ["show", "hide", "toggle", "toggleClass", "addClass", "removeClass", "scrollTo", "openPopup"]

const ID = /^[A-Za-z][\w-]{0,63}$/
const CLASS = /^[A-Za-z_][\w-]{0,63}$/

/** Keep only well-formed interactions (ids/classes are plain tokens, never selectors). Max 10 per element. */
export function sanitizeInteractions(value: unknown): Interaction[] {
  if (!Array.isArray(value)) return []
  const out: Interaction[] = []
  for (const raw of value.slice(0, 10)) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const trigger = INTERACTION_TRIGGERS.includes(r.trigger as InteractionTrigger) ? (r.trigger as InteractionTrigger) : null
    const action = INTERACTION_ACTIONS.includes(r.action as InteractionAction) ? (r.action as InteractionAction) : null
    if (!trigger || !action) continue
    const target = typeof r.target === "string" ? r.target.trim().replace(/^#/, "") : ""
    const className = typeof r.className === "string" ? r.className.trim() : ""
    if (target && !ID.test(target)) continue
    if (action.endsWith("Class") || action === "toggleClass") {
      if (!CLASS.test(className)) continue
    }
    if ((action === "scrollTo" || action === "openPopup") && !target) continue
    out.push({ trigger, action, ...(target ? { target } : {}), ...(className ? { className } : {}) })
  }
  return out
}

export function interactionAttrs(value: unknown): Record<string, string> {
  const list = sanitizeInteractions(value)
  return list.length ? { "data-wb-ix": JSON.stringify(list) } : {}
}

/** Apply one action. `self` is the element carrying the interaction. */
export function runInteraction(ix: Interaction, self: HTMLElement, doc: Document = document): void {
  const target = ix.target ? doc.getElementById(ix.target) : self
  if (ix.action === "openPopup") {
    const link = doc.createElement("a")
    link.href = `#popup-${ix.target}`
    link.style.display = "none"
    doc.body.appendChild(link)
    link.click()
    link.remove()
    return
  }
  if (!target) return
  switch (ix.action) {
    case "show":
      target.hidden = false
      target.style.removeProperty("display")
      break
    case "hide":
      target.hidden = true
      break
    case "toggle":
      target.hidden = !target.hidden
      break
    case "toggleClass":
      target.classList.toggle(ix.className!)
      break
    case "addClass":
      target.classList.add(ix.className!)
      break
    case "removeClass":
      target.classList.remove(ix.className!)
      break
    case "scrollTo":
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
      break
  }
}

/** Bind every [data-wb-ix] element under root. Returns cleanup. */
export function bindInteractions(root: HTMLElement): () => void {
  const cleanups: (() => void)[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-wb-ix]"))) {
    let list: Interaction[] = []
    try {
      list = sanitizeInteractions(JSON.parse(el.dataset.wbIx ?? "[]"))
    } catch {
      continue
    }
    for (const ix of list) {
      if (ix.trigger === "click") {
        const fn = (event: Event) => {
          if (ix.action === "scrollTo" || ix.action === "openPopup") event.preventDefault()
          runInteraction(ix, el)
        }
        el.addEventListener("click", fn)
        if (!el.matches("a,button,[tabindex]")) {
          el.tabIndex = 0
          el.setAttribute("role", el.getAttribute("role") ?? "button")
        }
        const key = (event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            if (!el.matches("a,button")) event.preventDefault()
            if (!el.matches("a,button")) runInteraction(ix, el)
          }
        }
        el.addEventListener("keydown", key)
        cleanups.push(() => {
          el.removeEventListener("click", fn)
          el.removeEventListener("keydown", key)
        })
      } else if (ix.trigger === "hover") {
        // Hover toggles in and back out (show↔hide, add↔remove) so it reverts on leave.
        const enter = () => runInteraction(ix, el)
        const reverse: Interaction = { ...ix, action: ix.action === "show" ? "hide" : ix.action === "hide" ? "show" : ix.action === "addClass" ? "removeClass" : ix.action === "removeClass" ? "addClass" : ix.action }
        const leave = () => {
          if (ix.action !== "scrollTo" && ix.action !== "openPopup") runInteraction(reverse, el)
        }
        el.addEventListener("pointerenter", enter)
        el.addEventListener("pointerleave", leave)
        cleanups.push(() => {
          el.removeEventListener("pointerenter", enter)
          el.removeEventListener("pointerleave", leave)
        })
      } else if (typeof IntersectionObserver !== "undefined") {
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect()
            runInteraction(ix, el)
          }
        })
        io.observe(el)
        cleanups.push(() => io.disconnect())
      }
    }
  }
  return () => cleanups.forEach((fn) => fn())
}
