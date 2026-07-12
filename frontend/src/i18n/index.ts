import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { resources } from "./resources"

const defaultLocale =
  typeof window !== "undefined"
    ? (localStorage.getItem("locale") ?? "fa")
    : "fa"

void i18n.use(initReactI18next).init({
  resources,
  lng: defaultLocale,
  fallbackLng: "en",
  defaultNS: "common",
  ns: [
    "common",
    "auth",
    "nav",
    "dashboard",
    "catalog",
    "cart",
    "checkout",
    "modules",
    "settings",
    "setup",
    "orders",
    "store_settings",
    "phase2",
    "phase3",
    "sidebar",
    "site_admin",
  ],
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
