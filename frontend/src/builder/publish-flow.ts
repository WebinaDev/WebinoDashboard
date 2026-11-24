export async function publishAfterGlobals(publishGlobals: () => Promise<boolean>, publishDocument: () => Promise<unknown>): Promise<boolean> {
  if (!await publishGlobals()) return false
  await publishDocument()
  return true
}
