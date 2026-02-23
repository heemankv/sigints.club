type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] as JsonValue)}`);
  return `{${entries.join(",")}}`;
}
