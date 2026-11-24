"use client";

import type { ResolvedAdminRoute } from "@/kernel/types";

/**
 * دسته چک — mounted at `/dashboard/accounting/cheque-books`.
 *
 * The cheque screen answers "what did we write". This answers the question the bank asks when
 * something is wrong: "which of the serials we printed for you are missing". That is a per-leaf
 * list, not a list of cheques, so it needs its own screen rather than a filter on the old one.
 */
import AccChequeBooks from "./AccChequeBooks";

export default function ChequeBooksPage({
  route,
}: {
  route: ResolvedAdminRoute;
}) {
  void route;

  return <AccChequeBooks />;
}
