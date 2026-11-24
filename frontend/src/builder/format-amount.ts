export function formatAmountDigits(amount: number, thousandSeparator = ",", locale = "fa"): string {
  const isFa = (!locale || locale.toLowerCase().startsWith("fa"))
  const formatter = new Intl.NumberFormat(isFa ? "fa-IR" : "en-US", {
    numberingSystem: isFa ? "arabext" : "latn",
    maximumFractionDigits: 4,
  })
  return formatter.formatToParts(Math.max(0, amount)).map((part) => {
    if (part.type !== "group" || thousandSeparator === ",") return part.value
    return thousandSeparator
  }).join("")
}

