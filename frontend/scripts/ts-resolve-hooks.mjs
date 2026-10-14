// Node test helper: resolve extensionless relative imports to .ts (the app uses bundler resolution).
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try {
          return await next(specifier + ext, context)
        } catch {
          /* try next */
        }
      }
    }
    throw error
  }
}
