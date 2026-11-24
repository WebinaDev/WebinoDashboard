"use client"

import type { ResolvedAdminRoute } from "@/kernel/types"

import AccPersons from "./AccPersons"

/**
 * اشخاص — mounted at `/dashboard/accounting/persons`.
 *
 * The component below is the WebinoERP page unchanged: same fields, same calls, same
 * empty states. It is wrapped here rather than imported directly because the kernel
 * loads `{page}-page-client` by convention, and renaming 19 ERP files would make a
 * later diff against the ERP unreadable.
 */
export default function PersonsPage({ route }: { route: ResolvedAdminRoute }) {
  // `route` is accepted for the kernel's contract; the ERP page reads its section from
  // the path segment it is mounted under, which matches the route slug above.
  void route

  return <AccPersons />
}
