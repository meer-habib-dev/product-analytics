/**
 * V1 error grouping: normalized name + normalized message + first meaningful
 * application stack frame. Line/column numbers are excluded on purpose:
 * they change with every release build and would split one bug into many groups.
 */

export interface ErrorSignature {
  name: string;
  message: string;
  culprit?: string;
  fingerprint: string;
  title: string;
}

export function computeErrorSignature(input: { name?: unknown; message?: unknown; stack?: unknown }): ErrorSignature {
  const name = cleanString(input.name) || "Error";
  const message = cleanString(input.message) || "(no message)";
  const culprit = typeof input.stack === "string" ? firstApplicationFrame(input.stack) : undefined;
  const key = [normalizeName(name), normalizeMessage(message), culprit ?? ""].join("|");
  return {
    name: name.slice(0, 200),
    message: message.slice(0, 1000),
    culprit,
    fingerprint: hash64(key),
    title: `${name}: ${message}`.slice(0, 200),
  };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(name: string): string {
  return name.toLowerCase();
}

/** Strips values that vary between occurrences of the same bug (ids, numbers, quoted input). */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/0x[0-9a-f]+/g, "<hex>")
    .replace(/(["'`])(?:(?!\1).){1,200}\1/g, "<str>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

const FRAMEWORK_PATTERNS = [
  /node_modules/,
  /\[native code\]/,
  /InternalBytecode/,
  /ReactNativeRenderer/,
  /react-native\/Libraries/,
  /^native$/,
];

/**
 * Returns "functionName (file)" for the first frame that looks like app code.
 * Handles V8/Hermes ("at fn (file:1:2)") and JSC ("fn@file:1:2") formats.
 */
export function firstApplicationFrame(stack: string): string | undefined {
  for (const line of stack.split("\n").slice(0, 50)) {
    const frame = parseFrame(line.trim());
    if (!frame) continue;
    if (FRAMEWORK_PATTERNS.some((p) => p.test(frame.file) || p.test(frame.fn))) continue;
    const file = basename(frame.file);
    // Anonymous frames in a single minified bundle carry no stable identity.
    if ((frame.fn === "" || frame.fn === "anonymous" || frame.fn === "?anon_0_") && /bundle/.test(file)) continue;
    return `${frame.fn || "anonymous"} (${file})`;
  }
  return undefined;
}

function parseFrame(line: string): { fn: string; file: string } | undefined {
  const v8 = /^at (?:(.+?) )?\(?(?:address at )?([^()]+?)(?::\d+)?(?::\d+)?\)?$/.exec(line);
  if (v8) return { fn: (v8[1] ?? "").trim(), file: (v8[2] ?? "").trim() };
  const jsc = /^(.*?)@(.+?)(?::\d+)?(?::\d+)?$/.exec(line);
  if (jsc) return { fn: (jsc[1] ?? "").trim(), file: (jsc[2] ?? "").trim() };
  return undefined;
}

function basename(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1) || withoutQuery;
}

/** Two independent 32-bit FNV-1a hashes; collision-safe enough for per-project grouping and sync (no async crypto needed). */
export function hash64(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
