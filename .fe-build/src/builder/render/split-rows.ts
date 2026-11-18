/** "a|b|c" per line → string[][]; a literal "\n" inside a cell becomes a newline. */
export function splitRows(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim().replace(/\\n/g, "\n")))
}
