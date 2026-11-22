// Mock backend for local render auditing of the café dashboard pages.
// Shapes mirror the payloads declared in the frontend types.
// Mirrors backend ApiResponseFormatter: every 2xx JSON body is wrapped in `success`.
// Without the `success` key the frontend's unwrapApiResponse leaves the payload alone and
// callers see a double-nested {data:{data:…}}, which is not what production returns.
const json = (res, body, status = 200) => {
  const safe = status >= 200 && status < 300 && body && typeof body === "object" && !("success" in body)
    ? { success: true, ...body }
    : body
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(safe))
}

// Only paginated controllers emit `meta`; plain list controllers return `{ data: [...] }`.
// Emitting `meta: {}` here used to make `normalizeApiPayload` hand pages a `{data, meta}`
// object instead of an array, manufacturing `.map is not a function` crashes that the real
// API never triggers. Keep this faithful to the backend.
const EMPTY_LIST = { data: [] }

const ROUTES = {
  // ---- middleware auth gate ----
  "GET /api/v1/auth/gate": {
    data: { authenticated: true, setup_completed: true, password_must_change: false, staff: true },
  },
  // ---- bootstrap / auth ----
  "GET /api/v1/bootstrap": {
    data: {
      user: {
        id: 1,
        name: "Audit Admin",
        email: "audit@example.test",
        role: "admin",
        capabilities: ["*"],
        ui_preferences: { locale: "fa", theme: "light", accent: "default" },
      },
      tenant: {
        id: 1,
        name: "Cafe Blue Dez",
        slug: "cafebluedez",
        domain: "cafebluedez.ir",
        branding: null,
        default_currency: "IRT",
        site_type_slug: "cafe",
        setup_completed: true,
      },
      license: { status: "active", active: true, demo: false, checked_at: null, unreachable: false },
      activations: [
        { module_slug: "cafe", submodule_slug: "menu", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "qr", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "reservations", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "hours", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "gallery", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "venue", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "engagement", enabled: true, licensed: true },
        { module_slug: "commerce", submodule_slug: "catalog", enabled: true, licensed: true },
        { module_slug: "commerce", submodule_slug: "orders", enabled: true, licensed: true },
      ],
      otp_auth: { login_enabled: false, register_enabled: false, length: 5 },
      menu_acl: [],
    },
  },

  // ---- auth user (PermissionGate) ----
  "GET /api/v1/auth/user": {
    data: {
      id: 1,
      name: "Audit Admin",
      email: "audit@example.test",
      role: "admin",
      capabilities: ["*"],
    },
  },
  "GET /api/v1/auth/me": {
    data: { id: 1, name: "Audit Admin", email: "audit@example.test", role: "admin", capabilities: ["*"] },
  },

  // ---- cafe settings ----
  "GET /api/v1/cafe/menu-settings": { data: { menus: [], banners: [], settings: null } },
  "GET /api/v1/cafe/gallery-settings": { data: { items: [], settings: null } },
  "GET /api/v1/cafe/hours-settings": { data: { days: [], settings: null } },
  "GET /api/v1/cafe/venue-settings": { data: { settings: null, branches: [] } },
  "GET /api/v1/cafe/qr-settings": { data: { settings: null } },
  "GET /api/v1/cafe/qr": { data: [] },
  "GET /api/v1/cafe/engagement-settings": { data: { settings: null } },

  // ---- public site kernel ----
  "GET /api/v1/public/kernel/activations": {
    data: {
      activations: [
        { module_slug: "cafe", submodule_slug: "menu", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "qr", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "reservations", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "hours", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "gallery", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "venue", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "engagement", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "item", enabled: true, licensed: true },
      ],
    },
  },
  // Must match the public list above: the admin shell and the site resolver read the same
  // tenant activations, and a short list here 404s routes that the public list enables.
  "GET /api/v1/kernel/activations": {
    data: {
      activations: [
        { module_slug: "cafe", submodule_slug: "menu", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "qr", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "reservations", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "hours", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "gallery", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "venue", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "engagement", enabled: true, licensed: true },
        { module_slug: "cafe", submodule_slug: "item", enabled: true, licensed: true },
      ],
    },
  },

  // ---- public storefront (mirrors PublicCafeController::venue / PublicCafeEventController) ----
  // Shape matters: AboutView and CataloguePage read `venue.tenant.active_theme_slug` directly,
  // so a missing `tenant` here renders the route error boundary instead of the page.
  "GET /api/v1/public/cafe/venue": {
    data: {
      tenant: { name: "کافه بلو", active_theme_slug: "cafe-starter" },
      menu: { currency: "IRT", hero_title: null, hero_subtitle: null, notice: null },
      hours: { timezone: "Asia/Tehran" },
      gallery: { images: [] },
      venue: {
        mini_site_enabled: true,
        tagline: null, description: null, address: null, phone: null,
        instagram: null, map_url: null, cover_image: null,
      },
      ordering: { enabled: true, mode: "table", closed_reason: null },
    },
  },
  "GET /api/v1/public/cafe/events": { data: [] },
  // PublicCatalogController::index always ships these keys, so the mock must too — a bare
  // `[]` here hides shape bugs and makes the catalogue look like a server crash.
  "GET /api/v1/public/catalog": {
    data: {
      categories: [],
      items: [],
      menus: [],
      banners: [],
      branches: [],
      hours: { timezone: "Asia/Tehran", days: [] },
      engagement: { likes_enabled: false, feedback_enabled: false },
      currency_display: { currency: "IRT", currency_position: "after", thousand_separator: ",", decimal_separator: "." },
    },
  },
  "GET /api/v1/public/tenant": {
    data: {
      name: "کافه بلو",
      store_display_name: "کافه بلو",
      active_theme_slug: "cafe-starter",
      host_mode: "primary",
      currency: "IRT",
      currency_symbol: "تومان",
      thousand_separator: ",",
      site_type_slug: "cafe",
      branding: null,
    },
  },

  // ---- themes (ThemeController::index / ThemeBuilderController) ----
  // Both always answer these keys; the fallback `{data:[]}` made the pages dereference
  // `undefined.map` / `undefined.find`, which is not how the real API behaves.
  "GET /api/v1/themes": {
    data: {
      site_type_slug: "cafe",
      active_theme_slug: "cafe-starter",
      default_theme_slug: "cafe-starter",
      suggested_theme_slug: null,
      branding: null,
      themes: [],
      // ThemeCatalog::ACCENTS / FONTS — the page maps over both to build its pickers.
      accents: ["#c46b3a", "#2f6f4e", "#1f4e79", "#7a3d8f"],
      fonts: ["vazirmatn", "iranyekan", "shabnam"],
    },
  },
  "GET /api/v1/theme-builder": { data: { kinds: [] } },
  "GET /api/v1/theme-builder/library": { data: { presets: [], kits: [] } },
  "GET /api/v1/theme-builder/templates": { data: { templates: [] } },

  // ---- inventory (InventoryController::summary) ----
  "GET /api/v1/inventory/summary": {
    data: { low_stock_products: [], out_of_stock_count: 0, low_stock_threshold: 3 },
  },

  // ---- catalog ----
  "GET /api/v1/categories": EMPTY_LIST,
  "GET /api/v1/products": EMPTY_LIST,
  "GET /api/v1/menus": EMPTY_LIST,
  "GET /api/v1/cafe/branches": { data: [] },
  "GET /api/v1/cafe/tables": { data: [] },

  // ---- operations ----
  "GET /api/v1/cafe/feedback": { data: [] },
  "GET /api/v1/cafe/likes": { data: [] },
  "GET /api/v1/cafe/kitchen-orders/live": { data: [], meta: { server_time: new Date().toISOString(), since: null } },
  "GET /api/v1/cafe/kitchen-orders": { data: [] },
  "GET /api/v1/cafe/reservations": { data: [] },
  "GET /api/v1/cafe/pricing": { data: [] },
  "GET /api/v1/cafe/floor": {
    data: [],
    meta: {
      summary: {
        total: 0, free: 0, ordering: 0, served: 0, cleaning: 0, reserved: 0,
        seated: 0, guests_seated: 0, open_value_minor: 0,
      },
      polled_at: new Date().toISOString(),
    },
  },
  "GET /api/v1/cafe/deliveries": { data: [], meta: { polled_at: new Date().toISOString() } },
  "GET /api/v1/cafe/pos/shift": { data: null },
  "GET /api/v1/cafe/pos/shifts": { data: [] },
  "GET /api/v1/cafe/manager/overview": {
    data: {
      range: "today",
      window: { from: null, to: null },
      currency: "IRT",
      sales: { orders: 0, revenue_minor: 0, aov_minor: 0, discounts_minor: 0, tax_minor: 0, shipping_minor: 0 },
      channels: [],
      statuses: {},
      tables: { total: 0, occupied: 0, seats: 0, seated_seats: 0, occupancy_percent: 0, seat_utilization_percent: 0 },
      delivery: { queued: 0, claimed: 0, picked_up: 0, delivered: 0, failed: 0, active: 0 },
      tills: { open_shifts: 0, closed_today: 0, variance_minor: 0, shifts_with_variance: 0 },
      top_items: [],
      hourly: [],
    },
  },
}

// The next server proxies browser calls to this mock; page code calls same-origin /api/v1/*.
export function startMockApi(port = 8099) {
  return new Promise((resolve) => {
    const handler = (req, res) => {
      const url = new URL(req.url, "http://localhost")
      const key = `${req.method} ${url.pathname}`
      if (ROUTES[key]) return json(res, ROUTES[key])
      // Unknown: succeed with an empty envelope so pages render "no data" instead of throwing.
      if (url.pathname.startsWith("/api/")) return json(res, EMPTY_LIST)
      json(res, { message: "not found" }, 404)
    }
    // eslint-disable-next-line no-undef
    import("node:http").then(({ createServer }) => {
      const server = createServer(handler)
      server.listen(port, "0.0.0.0", () => resolve(server))
    })
  })
}
