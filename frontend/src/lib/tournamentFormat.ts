/** Định dạng dùng chung cho trang giải đấu (tổng quan, đầu trang con). */

const VN_TZ = "Asia/Ho_Chi_Minh";

const toDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dayMonth = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    day: "numeric",
    month: "numeric",
    timeZone: VN_TZ,
  }).format(date);

/** "9–12/10" nếu cùng tháng, ngược lại "28/9 – 3/10". */
export const formatDateRange = (start?: string | null, end?: string | null) => {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return "—";
  if (!s || !e) return dayMonth((s ?? e)!);

  const [sd, sm] = dayMonth(s).split("/");
  const [ed, em] = dayMonth(e).split("/");
  if (sm === em) return sd === ed ? `${sd}/${sm}` : `${sd}–${ed}/${em}`;
  return `${sd}/${sm} – ${ed}/${em}`;
};

/** "T5, 9/10 · 18:00" */
export const formatShortDateTime = (value?: string | null) => {
  const date = toDate(value);
  if (!date) return "—";

  const parts = new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: VN_TZ,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("weekday")}, ${get("day")}/${get("month")} · ${get("hour")}:${get("minute")}`;
};

const parseVndAmounts = (text: string) => {
  let total = 0;
  for (const match of text.matchAll(/(\d[\d.,\s]*)\s*VND/gi)) {
    const amount = Number(match[1].replace(/[^\d]/g, ""));
    if (Number.isFinite(amount) && amount > 0) total += amount;
  }
  return total;
};

/** Cộng các khoản "... VND" trong danh sách giải thưởng. */
export const formatTotalPrize = (prizes?: Array<{ prize?: string }>) => {
  if (!prizes?.length) return "—";

  const total = prizes.reduce(
    (sum, item) => sum + parseVndAmounts(String(item?.prize ?? "")),
    0,
  );

  return total > 0 ? `${total.toLocaleString("vi-VN")} đ` : "—";
};

export const isIndividualTournament = (mode?: string | null) =>
  String(mode ?? "org").toLowerCase() === "individual";
