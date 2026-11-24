// Node test helper: resolve extensionless relative imports to .ts (the app uses bundler resolution).
export async function resolve(specifier, context, next) {
  const target = specifier.startsWith("@/") ? new URL(`../src/${specifier.slice(2)}`, import.meta.url).href : specifier
  const finish = (result) => result.url.endsWith(".json")
    ? { ...result, importAttributes: { ...context.importAttributes, type: "json" } }
    : result
  try {
    return finish(await next(target, context))
  } catch (error) {
    if ((target.startsWith(".") || target.startsWith("file:")) && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const ext of [".ts", ".tsx", "/index.ts", ".js"]) {
        try {
          return finish(await next(target + ext, context))
        } catch {
          /* try next */
        }
      }
    }
    throw error
  }
}
