"use client"

import { createContext, useContext } from "react"

import { DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"

export type DesignApi = { globals: BuilderGlobals; updateGlobals: (next: BuilderGlobals) => void }

const DesignContext = createContext<DesignApi>({ globals: DEFAULT_GLOBALS, updateGlobals: () => undefined })

export const DesignProvider = DesignContext.Provider

export function useDesign(): DesignApi {
  return useContext(DesignContext)
}
