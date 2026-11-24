import type { ModuleManifest } from "@/kernel/types"

/**
 * Full ERP ledger (double-entry journals, chart of accounts, receivables/payables,
 * cheques, warehouses, Iranian tax).
 *
 * Deliberately separate from the `accounting` submodule inside `commerce`: that one is
 * the till's ledger, which posts one journal per paid order and holds no chart of
 * accounts of its own. This module is the statutory book, ported whole from WebinoERP
 * and kept feature-identical, so it lives under its own nav section and its own
 * `/api/v1/erp-accounting` API.
 *
 * Every route here maps to a real file: `modules/accounting/admin/{page}-page.tsx`.
 */
export const accountingManifest: ModuleManifest = {
  slug: "erp-accounting",
  nameFa: "حسابداری",
  nameEn: "Accounting",
  siteTypes: ["cafe", "ecommerce", "coffee"],
  submodules: [
    "dashboard",
    "persons",
    "products",
    "invoices",
    "journals",
    "ledger",
    "reports",
    "cash",
    "checks",
    "receipts",
    "warehouses",
    "settings",
  ],
  adminNav: { section: "accounting", order: 20 },
  adminRoutes: [
    { path: "accounting", submodule: "dashboard", page: "dashboard", labelKey: "nav.accounting", section: "accounting", order: 20, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/fiscal-year", submodule: "settings", page: "fiscal-year", labelKey: "nav.accounting_fiscal_year", section: "accounting", order: 21, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/chart", submodule: "journals", page: "chart", labelKey: "nav.accounting_chart", section: "accounting", order: 22, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/journals", submodule: "journals", page: "journals", labelKey: "nav.accounting_journals", section: "accounting", order: 23, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/ledger", submodule: "ledger", page: "ledger", labelKey: "nav.accounting_ledger", section: "accounting", order: 24, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/reports", submodule: "reports", page: "reports", labelKey: "nav.accounting_reports", section: "accounting", order: 25, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/persons", submodule: "persons", page: "persons", labelKey: "nav.accounting_persons", section: "accounting", order: 26, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/products", submodule: "products", page: "products", labelKey: "nav.accounting_products", section: "accounting", order: 27, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/invoices", submodule: "invoices", page: "invoices", labelKey: "nav.accounting_invoices", section: "accounting", order: 28, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/cash-accounts", submodule: "cash", page: "cash-accounts", labelKey: "nav.accounting_cash_accounts", section: "accounting", order: 29, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/receipts", submodule: "receipts", page: "receipts", labelKey: "nav.accounting_receipts", section: "accounting", order: 30, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/checks", submodule: "checks", page: "checks", labelKey: "nav.accounting_checks", section: "accounting", order: 31, capability: "accounting.manage", menuKey: "accounting" },
    // The reconciliation engine existed for months with no caller. This is the screen that calls it.
    { path: "accounting/reconciliation", submodule: "cash", page: "reconciliation", labelKey: "nav.accounting_reconciliation", section: "accounting", order: 32, capability: "accounting.manage", menuKey: "accounting" },
    // Rent, electricity, repairs — the most common thing a shop writes down, and previously
    // only expressible by knowing which account to debit on the journal screen.
    { path: "accounting/expenses", submodule: "cash", page: "expenses", labelKey: "nav.accounting_expenses", section: "accounting", order: 33, capability: "accounting.manage", menuKey: "accounting" },
    // What the shop owes suppliers, with due dates — the bill between goods-in and money-out.
    { path: "accounting/supplier-bills", submodule: "cash", page: "supplier-bills", labelKey: "nav.accounting_supplier_bills", section: "accounting", order: 34, capability: "accounting.manage", menuKey: "accounting" },
    // The statement of account every customer eventually asks for, and the credit limit.
    { path: "accounting/parties", submodule: "persons", page: "party-statements", labelKey: "nav.accounting_parties", section: "accounting", order: 35, capability: "accounting.manage", menuKey: "accounting" },
    // The oven and the espresso machine: written down over their life, not vanished into a month.
    { path: "accounting/fixed-assets", submodule: "cash", page: "fixed-assets", labelKey: "nav.accounting_fixed_assets", section: "accounting", order: 36, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/warehouses", submodule: "warehouses", page: "warehouses", labelKey: "nav.accounting_warehouses", section: "accounting", order: 32, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/warehouse-stock", submodule: "warehouses", page: "warehouse-stock", labelKey: "nav.accounting_warehouse_stock", section: "accounting", order: 33, navHidden: true, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/warehouse-inbound", submodule: "warehouses", page: "warehouse-inbound", labelKey: "nav.accounting_warehouse_inbound", section: "accounting", order: 34, navHidden: true, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/warehouse-outbound", submodule: "warehouses", page: "warehouse-outbound", labelKey: "nav.accounting_warehouse_outbound", section: "accounting", order: 35, navHidden: true, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/warehouse-audit", submodule: "warehouses", page: "warehouse-audit", labelKey: "nav.accounting_warehouse_audit", section: "accounting", order: 36, navHidden: true, capability: "accounting.manage", menuKey: "accounting" },
    { path: "accounting/settings", submodule: "settings", page: "settings", labelKey: "nav.accounting_settings", section: "accounting", order: 37, capability: "accounting.manage", menuKey: "accounting" },
  ],

  /** Accounting has no public pages: every route behind it needs `accounting.manage`. */
  siteRoutes: [],
}
