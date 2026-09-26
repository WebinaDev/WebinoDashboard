"use client"

import { marketplaceMeta } from "@/lib/marketplace"
import { BasalamPanel } from "@/views/settings/panels/marketplace/BasalamPanel"
import { DigikalaPanel } from "@/views/settings/panels/marketplace/DigikalaPanel"
import { MarketplaceHubPanel } from "@/views/settings/panels/marketplace/MarketplaceHubPanel"
import { MarketplacePlatformPanel } from "@/views/settings/panels/marketplace/MarketplacePlatformPanel"

export function MarketplaceRouter({ platform, tab }: { platform?: string; tab?: string }) {
  if (!platform || !marketplaceMeta(platform)) return <MarketplaceHubPanel />
  if (platform === "digikala") return <DigikalaPanel tab={tab} />
  if (platform === "basalam") return <BasalamPanel tab={tab} />
  return <MarketplacePlatformPanel platform={platform} tab={tab} />
}
