"use client"

import { createContext, useContext } from "react"

import { DEFAULT_GLOBALS, type BuilderGlobals } from "../globals"
import type { RuntimeContext } from "../types"

const Runtime = createContext<RuntimeContext>({})
const Globals = createContext<BuilderGlobals>(DEFAULT_GLOBALS)

export function BuilderRuntimeProvider({ value, children }: { value: RuntimeContext; children: React.ReactNode }) {
  return <Runtime.Provider value={value}>{children}</Runtime.Provider>
}

export function BuilderGlobalsProvider({ value, children }: { value: BuilderGlobals; children: React.ReactNode }) {
  return <Globals.Provider value={value}>{children}</Globals.Provider>
}

export function useBuilderRuntime(): RuntimeContext {
  return useContext(Runtime)
}

export function useBuilderGlobals(): BuilderGlobals {
  return useContext(Globals)
}
