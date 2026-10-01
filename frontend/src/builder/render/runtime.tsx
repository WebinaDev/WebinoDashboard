"use client"

import { createContext, useContext } from "react"

import type { RuntimeContext } from "../types"

const Runtime = createContext<RuntimeContext>({})

export function BuilderRuntimeProvider({ value, children }: { value: RuntimeContext; children: React.ReactNode }) {
  return <Runtime.Provider value={value}>{children}</Runtime.Provider>
}

export function useBuilderRuntime(): RuntimeContext {
  return useContext(Runtime)
}
