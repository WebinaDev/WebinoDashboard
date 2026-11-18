import { redirect } from "next/navigation"

import { dashboardPath } from "@/kernel/paths"

export default function Page() {
  redirect(`${dashboardPath("users")}?role=staff`)
}
