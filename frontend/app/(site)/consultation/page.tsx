import { ConsultationForm } from "@/themes/corporate-demo-v1/components/ConsultationForm"

export default function ConsultationPage() {
  return (
    <div className="container mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-bold">درخواست مشاوره</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        فرم زیر را پر کنید؛ در اسرع وقت با شما تماس می‌گیریم.
      </p>
      <div className="mt-8">
        <ConsultationForm />
      </div>
    </div>
  )
}
