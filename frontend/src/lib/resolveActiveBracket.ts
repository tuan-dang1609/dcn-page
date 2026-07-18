export type BracketDateCandidate = {
  id: number;
  name?: string | null;
  date_start?: string | null;
};

/** Calendar day key YYYY-MM-DD (prefers date-only prefix to avoid TZ shift). */
export const toDateKey = (value: unknown): string | null => {
  if (value == null || value === "") return null;

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Pick the bracket that should be shown "now".
 * - Prefer brackets whose date_start is today (first by id if duplicates).
 * - Else latest past date_start (same name+date → first by id).
 * - Else earliest upcoming.
 * - Else first bracket by id.
 */
export const resolveActiveBracketId = (
  brackets: BracketDateCandidate[],
  now: Date = new Date(),
): number | null => {
  if (!brackets.length) return null;

  const sorted = [...brackets]
    .filter((bracket) => Number.isFinite(Number(bracket.id)))
    .map((bracket) => ({
      id: Number(bracket.id),
      name: String(bracket.name ?? "")
        .trim()
        .toLowerCase(),
      key: toDateKey(bracket.date_start),
    }))
    .sort((a, b) => a.id - b.id);

  if (!sorted.length) return null;

  const todayKey = toDateKey(now);
  if (!todayKey) return sorted[0].id;

  const withDates = sorted.filter((bracket) => Boolean(bracket.key));
  if (!withDates.length) return sorted[0].id;

  const startingToday = withDates.filter((bracket) => bracket.key === todayKey);
  if (startingToday.length) {
    return pickFirstAmongSameNameDate(startingToday).id;
  }

  const past = withDates.filter((bracket) => bracket.key! <= todayKey);
  if (past.length) {
    past.sort((a, b) => {
      const byDate = b.key!.localeCompare(a.key!);
      if (byDate !== 0) return byDate;
      return a.id - b.id;
    });
    const latestKey = past[0].key!;
    const atLatest = past.filter((bracket) => bracket.key === latestKey);
    return pickFirstAmongSameNameDate(atLatest).id;
  }

  const upcoming = withDates
    .filter((bracket) => bracket.key! > todayKey)
    .sort((a, b) => a.key!.localeCompare(b.key!) || a.id - b.id);

  return upcoming[0]?.id ?? sorted[0].id;
};

const pickFirstAmongSameNameDate = <
  T extends { id: number; name: string; key: string | null },
>(
  items: T[],
): T => {
  if (items.length <= 1) return items[0];

  const first = items[0];
  const sameGroup = items.filter(
    (item) => item.name === first.name && item.key === first.key,
  );

  return sameGroup[0] ?? first;
};
