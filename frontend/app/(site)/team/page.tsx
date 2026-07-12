import { apiServer } from "@/lib/api-server"

export const revalidate = 60

export default async function TeamPage() {
  let members: {
    id: number
    name: string
    role?: string | null
    bio?: string | null
  }[] = []

  try {
    const res = await apiServer<{ data: typeof members }>("/api/v1/public/team")
    members = res.data ?? []
  } catch {
    members = []
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold">تیم ما</h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <div key={m.id} className="rounded-xl border p-6 text-center">
            <div className="bg-muted mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold">
              {m.name.charAt(0)}
            </div>
            <h2 className="mt-4 font-semibold">{m.name}</h2>
            {m.role ? <p className="text-primary text-sm">{m.role}</p> : null}
            {m.bio ? <p className="text-muted-foreground mt-2 text-sm">{m.bio}</p> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
