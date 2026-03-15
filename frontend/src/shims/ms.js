function plural(value, unit) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function fmtShort(ms) {
  const abs = Math.abs(ms);
  if (abs >= 24 * 60 * 60 * 1000)
    return `${Math.round(ms / (24 * 60 * 60 * 1000))}d`;
  if (abs >= 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))}h`;
  if (abs >= 60 * 1000) return `${Math.round(ms / (60 * 1000))}m`;
  if (abs >= 1000) return `${Math.round(ms / 1000)}s`;
  return `${ms}ms`;
}

function fmtLong(ms) {
  const abs = Math.abs(ms);
  if (abs >= 24 * 60 * 60 * 1000)
    return plural(Math.round(ms / (24 * 60 * 60 * 1000)), "day");
  if (abs >= 60 * 60 * 1000)
    return plural(Math.round(ms / (60 * 60 * 1000)), "hour");
  if (abs >= 60 * 1000) return plural(Math.round(ms / (60 * 1000)), "minute");
  if (abs >= 1000) return plural(Math.round(ms / 1000), "second");
  return plural(ms, "millisecond");
}

function parse(str) {
  const value = String(str || "").trim();
  const match = value.match(/^(-?(?:\d+)?\.?\d+)\s*(ms|s|m|h|d)?$/i);
  if (!match) return undefined;

  const n = Number(match[1]);
  if (!Number.isFinite(n)) return undefined;

  const unit = String(match[2] || "ms").toLowerCase();
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "s") return n * 1000;
  return n;
}

function ms(value, options) {
  if (typeof value === "string") return parse(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return options && options.long ? fmtLong(value) : fmtShort(value);
  }
  throw new Error("Value must be a non-empty string or a finite number");
}

ms.parse = parse;
ms.long = fmtLong;
ms.short = fmtShort;

module.exports = ms;
module.exports.default = ms;
