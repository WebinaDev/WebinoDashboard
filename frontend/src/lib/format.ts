export function formatInteger(value: number, locale: string): string {
  const useFaDigits = locale.startsWith("fa")
  return new Intl.NumberFormat(useFaDigits ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
    numberingSystem: useFaDigits ? "arabext" : "latn",
  }).format(value)
}

export function formatLocalizedDate(locale: string, date: Date): string {
  if (locale.startsWith("fa")) {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      dateStyle: "medium",
      numberingSystem: "arabext",
    }).format(date)
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date)
}

export function formatNowDate(locale: string): string {
  if (locale.startsWith("fa")) {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      dateStyle: "medium",
      numberingSystem: "arabext",
    }).format(new Date())
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date()
  )
}
