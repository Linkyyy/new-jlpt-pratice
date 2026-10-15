import { messages } from "./messages";
import type { Locale } from "../display-preferences";

const table = new Map(messages.map(([zh, ja, en]) => [zh, { zh, ja, en }]));
export function translatePeriod(period: string, source: string | undefined, t: (text: string) => string) {
  return source === "favorites" && !["全部收藏夹", "默认收藏夹", "所选收藏夹"].includes(period) ? period : t(period);
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = messages.filter(([source]) => /\{\d+\}/.test(source)).sort((a, b) => b[0].replace(/\{\d+\}/g, "").length - a[0].replace(/\{\d+\}/g, "").length).map(([source, ja, en]) => {
  const indices: number[] = [];
  let cursor = 0, expression = "^";
  for (const match of source.matchAll(/\{(\d+)\}/g)) {
    expression += escape(source.slice(cursor, match.index)) + "([\\s\\S]*?)";
    indices.push(Number(match[1])); cursor = match.index! + match[0].length;
  }
  expression += escape(source.slice(cursor)) + "$";
  return { regex: new RegExp(expression), indices, zh: source, ja, en };
});
export function translate(value: string | number | boolean | null | undefined, locale: Locale, params?: Readonly<Record<string, string | number>>, depth = 0): string {
  if (typeof value === "boolean") return "";
  const source = String(value ?? "");
  if (params) {
    const template = table.get(source)?.[locale] ?? source;
    return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] === undefined ? match : String(params[key]));
  }
  if (locale === "zh" || !source) return source;
  const exact = table.get(source)?.[locale];
  if (exact !== undefined) return exact;
  const date = source.match(/^(\d{4})年(\d{1,2})月$/);
  if (date) return locale === "ja" ? source : new Intl.DateTimeFormat("en", { year: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1)));
  for (const pattern of patterns) {
    const match = source.match(pattern.regex);
    if (match) {
      const values = new Map(pattern.indices.map((index, position) => [index, match[position + 1]]));
      return pattern[locale].replace(/\{(\d+)\}/g, (_, index: string) => {
        const content = values.get(Number(index)) ?? "";
        return depth < 6 && content !== source ? translate(content, locale, undefined, depth + 1) : content;
      });
    }
  }
  if (source.includes(" · ")) return source.split(" · ").map(part => translate(part, locale)).join(" · ");
  return source;
}
