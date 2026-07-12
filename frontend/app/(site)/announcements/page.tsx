import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function AnnouncementsPage() {
  let rows: { id: number; title: string; body?: string | null; type?: string; pinned?: boolean }[] = []
  try {
    const res = await apiServer<{ data: typeof rows }>("/api/v1/public/announcements")
    rows = res.data ?? []
  } catch {
    rows = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">اطلاعیه‌ها</h1>
      <ul className="mt-8 space-y-4">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl border p-5">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{a.title}</h2>
              {a.pinned ? (
                <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs">سنجاق</span>
              ) : null}
            </div>
            {a.body ? <p className="text-muted-foreground mt-2 text-sm">{a.body}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
