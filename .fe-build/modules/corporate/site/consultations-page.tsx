import type { ResolvedSiteRoute } from "@/kernel/types"
import { getServerTranslations } from "@/lib/server-translations"
import { ConsultationForm } from "@/themes/shared/content/ConsultationForm"

export default async function Page(_props: { route: ResolvedSiteRoute }) {
  const t = await getServerTranslations("site")

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto mb-8 max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("consultation")}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("consultation_intro")}</p>
      </div>
      <ConsultationForm />
    </div>
  )
}
