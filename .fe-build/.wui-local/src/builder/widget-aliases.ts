import data from "./data/widget-aliases.json";

/** Legacy builder widget type -> current type (shared with PHP backends via the JSON file). */
export const WIDGET_ALIASES: Readonly<Record<string, string>> = data.aliases;

export function resolveWidgetAlias(type: string): string {
  return WIDGET_ALIASES[type] ?? type;
}
