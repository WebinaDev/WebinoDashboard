"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { SettingsModulesChrome } from "@/components/settings/SettingsModulesChrome"
import { defaultSettingsPath } from "@/lib/settings-nav"
import { SecuritySettingsPanel } from "@/views/settings/panels/SecuritySettingsPanel"
import { AiContentSettingsPanel } from "@/views/settings/panels/AiContentSettingsPanel"
import { AnalyticsSettingsPanel } from "@/views/settings/panels/AnalyticsSettingsPanel"
import { SmsSettingsPanel } from "@/views/settings/panels/SmsSettingsPanel"
import { ShopGeneralSettingsPanel } from "@/views/settings/panels/ShopGeneralSettingsPanel"
import {
  AccountingModianPanel,
  AccountingTaxPanel,
} from "@/views/settings/panels/AccountingSettingsPanels"
import { BotsSettingsPanel } from "@/views/settings/panels/BotsSettingsPanel"
import {
  AdvancedSettingsPanel,
  InvoicesSettingsPanel,
  PricingSettingsPanel,
  ShippingTapinPanel,
  ShippingZonesPanel,
} from "@/views/settings/panels/ShopModulePanels"
import { PaymentHubPanel } from "@/views/settings/panels/PaymentHubPanel"
import { GatewayProviderSettingsPanel } from "@/views/settings/panels/GatewayProviderSettingsPanel"
import { MarketplaceRouter } from "@/views/settings/panels/marketplace/MarketplaceRouter"

function SettingsPanelRouter({ pathname }: { pathname: string }) {
  const path = pathname.replace(/\/$/, "")

  if (path.endsWith("/site/security")) return <SecuritySettingsPanel />
  if (path.endsWith("/site/ai")) return <AiContentSettingsPanel />
  if (path.endsWith("/site/analytics")) return <AnalyticsSettingsPanel />
  if (path.endsWith("/site/sms")) return <SmsSettingsPanel />
  if (path.endsWith("/shop/general")) return <ShopGeneralSettingsPanel />
  if (path.endsWith("/shop/accounting/tax")) return <AccountingTaxPanel />
  if (path.endsWith("/shop/accounting/modian")) return <AccountingModianPanel />
  if (path.endsWith("/shop/bots/bale")) return <BotsSettingsPanel provider="bale" />
  if (path.endsWith("/shop/bots/telegram")) return <BotsSettingsPanel provider="telegram" />
  const marketplace = path.match(/\/shop\/marketplace(?:\/([a-z-]+))?(?:\/([a-z-]+))?$/)
  if (marketplace) return <MarketplaceRouter platform={marketplace[1]} tab={marketplace[2]} />
  if (path.endsWith("/shop/pricing")) return <PricingSettingsPanel />
  if (path.endsWith("/shop/shipping/zones")) return <ShippingZonesPanel />
  if (path.endsWith("/shop/shipping/tapin")) return <ShippingTapinPanel />
  if (path.endsWith("/shop/payments")) return <PaymentHubPanel />
  if (path.endsWith("/shop/zarinpal")) return <GatewayProviderSettingsPanel provider="zarinpal" />
  if (path.endsWith("/shop/digipay")) return <GatewayProviderSettingsPanel provider="digipay" />
  if (path.endsWith("/shop/snapppay")) return <GatewayProviderSettingsPanel provider="snapppay" />
  if (path.endsWith("/shop/torobpay")) return <GatewayProviderSettingsPanel provider="torobpay" />
  if (path.endsWith("/shop/bale-pay")) return <GatewayProviderSettingsPanel provider="bale_pay" />
  if (path.endsWith("/shop/wallet")) return <GatewayProviderSettingsPanel provider="wallet" />
  if (path.endsWith("/shop/c2c")) return <GatewayProviderSettingsPanel provider="c2c" />
  if (path.endsWith("/shop/invoices")) return <InvoicesSettingsPanel />
  if (path.endsWith("/shop/advanced")) return <AdvancedSettingsPanel />

  return null
}

export default function SettingsHubPage() {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  useEffect(() => {
    const path = pathname.replace(/\/$/, "")
    if (path === "/dashboard/settings" || path.endsWith("/settings")) {
      router.replace(defaultSettingsPath())
    }
  }, [pathname, router])

  return (
    <SettingsModulesChrome>
      <SettingsPanelRouter pathname={pathname} />
    </SettingsModulesChrome>
  )
}
