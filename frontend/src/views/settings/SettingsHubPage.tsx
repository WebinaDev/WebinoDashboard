"use client"

import { ShopStoriesSettingsPanel } from "@/views/settings/panels/ShopStoriesSettingsPanel"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

import { SettingsModulesChrome } from "@/components/settings/SettingsModulesChrome"
import { defaultSettingsPath } from "@/lib/settings-nav"
import { SecuritySettingsPanel } from "@/views/settings/panels/SecuritySettingsPanel"
import { SiteGeneralSettingsPanel } from "@/views/settings/panels/SiteGeneralSettingsPanel"
import { SitePrivacySettingsPanel } from "@/views/settings/panels/SitePrivacySettingsPanel"
import { BrandStyleSettingsPanel } from "@/views/settings/panels/BrandStyleSettingsPanel"
import { MenusSettingsPanel } from "@/views/settings/panels/MenusSettingsPanel"
import { ThemeBuilderSettingsPanel } from "@/views/settings/panels/ThemeBuilderSettingsPanel"
import { TemplatesSettingsPanel } from "@/views/settings/panels/TemplatesSettingsPanel"
import { SystemLogsSettingsPanel } from "@/views/settings/panels/SystemLogsSettingsPanel"
import { AiContentSettingsPanel } from "@/views/settings/panels/AiContentSettingsPanel"
import { AnalyticsSettingsPanel } from "@/views/settings/panels/AnalyticsSettingsPanel"
import { SmsSettingsPanel } from "@/views/settings/panels/SmsSettingsPanel"
import { SeoSettingsPanel } from "@/views/settings/panels/SeoSettingsPanel"
import { PerformanceSettingsPanel } from "@/views/settings/panels/PerformanceSettingsPanel"
import { StorefrontAppearancePanel } from "@/views/settings/panels/StorefrontAppearancePanel"
import { ProductNotificationsPanel } from "@/views/settings/panels/ProductNotificationsPanel"
import { NewsletterSubscribersPanel } from "@/views/settings/panels/NewsletterSubscribersPanel"
import { NotificationsSettingsPanel } from "@/views/settings/panels/NotificationsSettingsPanel"
import { PwaSettingsPanel } from "@/views/settings/panels/PwaSettingsPanel"
import { InstagramSettingsPanel } from "@/views/settings/panels/InstagramSettingsPanel"
import { DashboardSiteSettingsPanel } from "@/views/settings/panels/DashboardSiteSettingsPanel"
import { ShopGeneralSettingsPanel } from "@/views/settings/panels/ShopGeneralSettingsPanel"
import { ShopProductsSettingsPanel } from "@/views/settings/panels/ShopProductsSettingsPanel"
import {
  ShopArchiveSettingsPanel,
  ShopDownloadsSettingsPanel,
  ShopLoyaltySettingsPanel,
  ShopMapsSettingsPanel,
  ShopReviewsSettingsPanel,
} from "@/views/settings/panels/ShopExtrasSettingsPanels"
import {
  AccountingModianPanel,
  AccountingTaxPanel,
} from "@/views/settings/panels/AccountingSettingsPanels"
import { BotsSettingsPanel } from "@/views/settings/panels/BotsSettingsPanel"
import {
  AdvancedSettingsPanel,
  InvoicesSettingsPanel,
  ShippingTapinPanel,
  ShippingZonesPanel,
} from "@/views/settings/panels/ShopModulePanels"
import { PricingSettingsPanel } from "@/views/settings/panels/pricing/PricingSettingsPanel"
import { PaymentHubPanel } from "@/views/settings/panels/PaymentHubPanel"
import { ShippingHubPanel } from "@/views/settings/panels/ShippingHubPanel"
import { ShippingCarrierSettingsPanel } from "@/views/settings/panels/ShippingCarrierSettingsPanel"
import { GatewayProviderSettingsPanel } from "@/views/settings/panels/GatewayProviderSettingsPanel"
import { MarketplaceRouter } from "@/views/settings/panels/marketplace/MarketplaceRouter"

function SettingsPanelRouter({ pathname }: { pathname: string }) {
  const path = pathname.replace(/\/$/, "")

  if (path.endsWith("/site/general")) return <SiteGeneralSettingsPanel />
  if (path.endsWith("/site/privacy")) return <SitePrivacySettingsPanel />
  if (path.endsWith("/site/style")) return <BrandStyleSettingsPanel />
  if (path.endsWith("/site/menus")) return <MenusSettingsPanel />
  if (path.endsWith("/site/theme")) return <ThemeBuilderSettingsPanel />
  if (path.endsWith("/site/templates")) return <TemplatesSettingsPanel />
  if (path.endsWith("/site/system-logs")) return <SystemLogsSettingsPanel />
  if (path.endsWith("/site/security")) return <SecuritySettingsPanel />
  if (path.endsWith("/site/ai")) return <AiContentSettingsPanel />
  if (path.endsWith("/site/analytics")) return <AnalyticsSettingsPanel />
  if (path.endsWith("/site/sms")) return <SmsSettingsPanel />
  if (path.endsWith("/site/notifications")) return <NotificationsSettingsPanel />
  if (path.endsWith("/site/pwa")) return <PwaSettingsPanel />
  if (path.endsWith("/site/instagram")) return <InstagramSettingsPanel />
  if (path.endsWith("/site/dashboard")) return <DashboardSiteSettingsPanel />
  if (path.endsWith("/shop/general")) return <ShopGeneralSettingsPanel />
  if (path.endsWith("/shop/products")) return <ShopProductsSettingsPanel />
  if (path.endsWith("/shop/downloads")) return <ShopDownloadsSettingsPanel />
  if (path.endsWith("/shop/reviews")) return <ShopReviewsSettingsPanel />
  if (path.endsWith("/shop/stories")) return <ShopStoriesSettingsPanel />
  if (path.endsWith("/shop/maps")) return <ShopMapsSettingsPanel />
  if (path.endsWith("/shop/loyalty")) return <ShopLoyaltySettingsPanel />
  if (path.endsWith("/shop/storefront-appearance")) return <StorefrontAppearancePanel />
  if (path.endsWith("/shop/product-notifications")) return <ProductNotificationsPanel />
  if (path.endsWith("/shop/newsletter")) return <NewsletterSubscribersPanel />
  if (path.endsWith("/shop/theme-optimizer") || path.endsWith("/site/performance")) return <PerformanceSettingsPanel />
  if (path.endsWith("/site/seo") || path.endsWith("/site/seo-redirects")) return <SeoSettingsPanel />
  if (path.endsWith("/shop/archive")) return <ShopArchiveSettingsPanel />
  if (path.endsWith("/shop/accounting/tax")) return <AccountingTaxPanel />
  if (path.endsWith("/shop/accounting/modian")) return <AccountingModianPanel />
  if (path.endsWith("/shop/bots/bale")) return <BotsSettingsPanel provider="bale" />
  if (path.endsWith("/shop/bots/telegram")) return <BotsSettingsPanel provider="telegram" />
  const marketplace = path.match(/\/shop\/marketplace(?:\/([a-z-]+))?(?:\/([a-z-]+))?$/)
  if (marketplace) return <MarketplaceRouter platform={marketplace[1]} tab={marketplace[2]} />
  const pricing = path.match(/\/shop\/pricing(?:\/([a-z-]+))?$/)
  if (pricing) return <PricingSettingsPanel tab={pricing[1]} />
  if (path.endsWith("/shop/shipping/zones")) return <ShippingZonesPanel />
  if (path.endsWith("/shop/shipping/tapin")) return <ShippingTapinPanel />
  if (path.endsWith("/shop/shipping/hub") || path.endsWith("/shop/shipping/carriers")) {
    return <ShippingHubPanel />
  }
  const shippingCarrier = path.match(/\/shop\/shipping\/carriers\/([a-z0-9-]+)$/)
  if (shippingCarrier) {
    return <ShippingCarrierSettingsPanel carrier={shippingCarrier[1].replace(/-/g, "_")} />
  }
  if (path.endsWith("/shop/gateways") || path.endsWith("/shop/payments")) return <PaymentHubPanel />
  if (path.endsWith("/shop/invoices")) return <InvoicesSettingsPanel />
  if (path.endsWith("/shop/advanced")) return <AdvancedSettingsPanel />

  // Dynamic gateway settings: /dashboard/settings/shop/{gateway-slug}
  const gatewayMatch = path.match(/\/shop\/([a-z0-9-]+)$/)
  if (gatewayMatch) {
    const slug = gatewayMatch[1]
    const reserved = new Set([
      "general",
      "products",
      "downloads",
      "reviews",
      "stories",
      "maps",
      "loyalty",
      "archive",
      "pricing",
      "shipping",
      "storefront-appearance",
      "theme-optimizer",
      "product-notifications",
      "newsletter",
      "gateways",
      "payments",
      "invoices",
      "advanced",
      "bots",
      "marketplace",
      "accounting",
      "ext",
    ])
    if (!reserved.has(slug)) {
      return <GatewayProviderSettingsPanel provider={slug.replace(/-/g, "_")} />
    }
  }

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
