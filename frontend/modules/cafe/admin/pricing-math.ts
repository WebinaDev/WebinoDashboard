/**
 * «فرمول قیمت‌گذاری کافه» — the arithmetic behind the price-suggestion page.
 *
 * This mirrors `App\Services\Cafe\CafePricingCalculator` exactly, including the rounding,
 * so the live preview on screen matches what the API returns and what gets saved. The page
 * still posts to the server for the authoritative number; this module exists so typing in a
 * field is instant instead of waiting for a round trip on every keystroke.
 *
 *   base    = (ingredients + packaging) × (1 + waste)
 *   full    = base + labour + fixed
 *   pre-tax = full ÷ (1 − profit − commission)
 *   final   = pre-tax × (1 + VAT)
 */

export type PricingRates = {
  waste_percent: number
  target_profit_percent: number
  platform_commission_percent: number
  vat_percent: number
  default_packaging_minor: number
  round_enabled: boolean
  round_to: number
}

export type PricingInput = {
  ingredient_cost: number
  packaging_cost: number
  labour_cost: number
  fixed_cost: number
  waste_percent: number
  target_profit_percent: number
  platform_commission_percent: number
  vat_percent: number
  is_delivery: boolean
}

export type PricingResult = {
  channel: "dine_in" | "delivery"
  costs: { waste: number; base: number; full: number }
  prices: { final: number; beforeVat: number; vat: number; platformCut: number; net: number }
  ratios: {
    foodCostPercent: number
    primeCostPercent: number
    grossMarginPercent: number
    netMarginPercent: number
  }
  /** True when profit + commission left too little room and the denominator was clamped. */
  clamped: boolean
}

export const DEFAULT_RATES: PricingRates = {
  waste_percent: 7,
  target_profit_percent: 22,
  platform_commission_percent: 18,
  vat_percent: 10,
  default_packaging_minor: 0,
  round_enabled: true,
  round_to: 1000,
}

/** Matches the server's headroom floor so an impossible input yields a finite price. */
const MIN_DENOMINATOR = 0.02

function share(percent: number): number {
  const n = Number.isFinite(percent) ? Math.max(0, percent) : 0
  return n > 100 ? n / 100 : n / 100
}

const nonNegative = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)

function roundForMenu(value: number, rates: PricingRates): number {
  if (!rates.round_enabled) return Math.round(value)
  const step = Math.max(1, Math.round(rates.round_to) || 1000)
  return Math.round(value / step) * step
}

export function calculatePrice(input: PricingInput, rates: PricingRates): PricingResult {
  const ingredients = nonNegative(input.ingredient_cost)
  const packaging = nonNegative(input.packaging_cost)
  const labour = nonNegative(input.labour_cost)
  const fixed = nonNegative(input.fixed_cost)

  const waste = share(input.waste_percent)
  const profit = share(input.target_profit_percent)
  const commission = share(input.platform_commission_percent)
  const vat = share(input.vat_percent)
  const channelCommission = input.is_delivery ? commission : 0

  // 1) Ingredients and packaging carry the waste; a discarded shot is paid for by the cup.
  const wasteAmount = (ingredients + packaging) * waste
  const baseCost = ingredients + packaging + wasteAmount

  // 2) Overhead this item must cover.
  const fullCost = baseCost + labour + fixed

  // 3) Margin-on-sale denominator, clamped so extreme inputs stay finite.
  const rawDenominator = 1 - profit - channelCommission
  const clamped = rawDenominator < MIN_DENOMINATOR
  const denominator = clamped ? MIN_DENOMINATOR : rawDenominator

  const priceBeforeVat = fullCost / denominator
  const finalPrice = roundForMenu(priceBeforeVat * (1 + vat), rates)
  const preVatRounded = roundForMenu(priceBeforeVat, rates)

  // Counted back off the rounded price, so the report matches the menu rather than the formula.
  const vatAmount = finalPrice - roundForMenu(finalPrice / (1 + vat), rates)
  const platformCut = input.is_delivery ? finalPrice * commission : 0
  const net = finalPrice - vatAmount - platformCut - fullCost

  const ratio = (value: number) => (finalPrice > 0 ? Number(((value / finalPrice) * 100).toFixed(1)) : 0)

  return {
    channel: input.is_delivery ? "delivery" : "dine_in",
    costs: {
      waste: Math.round(wasteAmount),
      base: Math.round(baseCost),
      full: Math.round(fullCost),
    },
    prices: {
      final: finalPrice,
      beforeVat: preVatRounded,
      vat: vatAmount,
      platformCut: Math.round(platformCut),
      net: Math.round(net),
    },
    ratios: {
      foodCostPercent: ratio(ingredients + packaging),
      primeCostPercent: ratio(fullCost),
      grossMarginPercent: ratio(finalPrice - vatAmount - ingredients - packaging - wasteAmount),
      netMarginPercent: ratio(net),
    },
    clamped,
  }
}

/** Labour + overhead per item, from the numbers a cafe actually knows. */
export function allocateOverhead(monthlyLabour: number, monthlyFixed: number, monthlyItems: number) {
  const items = Math.max(1, Math.round(monthlyItems) || 1)
  return {
    monthly_items: items,
    labour_cost: Math.round(nonNegative(monthlyLabour) / items),
    fixed_cost: Math.round(nonNegative(monthlyFixed) / items),
    monthly_cost: Math.round((nonNegative(monthlyLabour) + nonNegative(monthlyFixed))),
  }
}

/** What a price the cafe already charges leaves behind. */
export function reversePrice(price: number, input: PricingInput) {
  const ingredients = nonNegative(input.ingredient_cost)
  const packaging = nonNegative(input.packaging_cost)
  const waste = share(input.waste_percent)
  const vat = share(input.vat_percent)
  const commission = share(input.platform_commission_percent)

  const fullCost = (ingredients + packaging) * (1 + waste) + nonNegative(input.labour_cost) + nonNegative(input.fixed_cost)
  const vatAmount = price - price / (1 + vat)
  const platformCut = input.is_delivery ? price * commission : 0
  const net = price - vatAmount - platformCut - fullCost
  const ratio = (value: number) => (price > 0 ? Number(((value / price) * 100).toFixed(1)) : 0)

  return {
    price_minor: price,
    vat_minor: Math.round(vatAmount),
    platform_cut_minor: Math.round(platformCut),
    full_cost_minor: Math.round(fullCost),
    net_minor: Math.round(net),
    net_margin_percent: ratio(net),
    food_cost_percent: ratio(ingredients + packaging),
  }
}

/** A menu price that hits a target food-cost ratio — the other school of menu costing. */
export function priceForFoodCostTarget(foodCost: number, targetPercent: number, rates: PricingRates) {
  const target = share(targetPercent)
  if (target <= 0) return roundForMenu(nonNegative(foodCost), rates)
  return roundForMenu(nonNegative(foodCost) / target, rates)
}

/**
 * A traffic-light verdict for the food-cost ratio: below ~25% the item is comfortably
 * priced, 25–35% is the usual café window, and above that the margin is thin.
 */
export function foodCostVerdict(percent: number): "healthy" | "typical" | "thin" {
  if (percent <= 25) return "healthy"
  if (percent <= 35) return "typical"
  return "thin"
}
