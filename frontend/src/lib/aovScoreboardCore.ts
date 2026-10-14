/**
 * Đọc ảnh tổng kết trận Liên Quân (màn "Kết quả" sau trận) — phần lõi không phụ thuộc trình duyệt.
 *
 * Bố cục ảnh cố định theo CHIỀU CAO và căn giữa theo chiều ngang (máy 16:9 hay 20:9 đều vậy):
 *   - Tỉ số hạ gục 2 đội ở trên cùng, 2 bên trục giữa.
 *   - Khung đội xanh (trái) và đội đỏ (phải), mỗi khung 5 hàng:
 *       [ảnh tướng] [điểm] [tên] [K / D / A / vàng]
 * Toạ độ dưới đây đo trên ảnh mẫu, tính theo đơn vị H (chiều cao ảnh), gốc x = giữa ảnh.
 * Mỗi ô được cắt riêng → làm sạch (xám, phóng to, tách chữ khỏi nền) → OCR → phân tích.
 */

export type Side = "blue" | "red";
export type CellKind = "teamKills" | "score" | "name" | "kills" | "deaths" | "assists" | "gold";

export type Region = { x: number; y: number; w: number; h: number };

export type Cell = {
  key: string;
  kind: CellKind;
  side: Side;
  /** 1–5; 0 cho tỉ số đội. */
  slot: number;
  region: Region;
};

/* ───────────── Bố cục (đơn vị H, gốc x = giữa ảnh) ───────────── */

const LAYOUT = {
  /** Tỉ số hạ gục ở trên cùng. */
  teamKills: { blue: [-0.36, -0.14], red: [0.14, 0.36], y: [0.0, 0.11] },
  /** Mép trái mỗi khung (so với giữa ảnh) và bề rộng khung. */
  panel: { blueLeft: -0.89, redLeft: 0.004, width: 0.886 },
  /** 5 hàng người chơi: từ y0 tới y1. */
  rows: { y0: 0.199, y1: 0.835, count: 5 },
  /** Phần trong 1 hàng chứa chữ (bỏ huy hiệu bên dưới tên). */
  rowBand: [0.14, 0.72],
  /**
   * Các cột trong khung (đơn vị H tính từ mép trái khung). K / D / A / vàng đọc từng ô riêng:
   * dấu "/" giữa các số rất mờ, đọc gộp thì Tesseract hay dính số.
   */
  columns: {
    // Ngay sau ảnh tướng (~0.187H): bắt đầu muộn hơn sẽ cắt mất chữ số đầu (8→3, 6→5, 10.4→0.4)
    score: [0.19, 0.33],
    // Kết thúc trước cột K (0.515) — nếu chồng lên, chữ số K lọt vào cuối tên
    name: [0.33, 0.51],
    kills: [0.515, 0.578],
    deaths: [0.58, 0.637],
    assists: [0.64, 0.7],
    gold: [0.7, 0.81],
  },
} as const;

/** Danh sách ô cần đọc cho ảnh kích thước W × H (pixel). */
export const buildCells = (W: number, H: number): Cell[] => {
  const cx = W / 2;
  const clampRegion = (x: number, y: number, w: number, h: number): Region => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  };

  const cells: Cell[] = [];
  for (const side of ["blue", "red"] as Side[]) {
    const [kx0, kx1] = LAYOUT.teamKills[side];
    const [ky0, ky1] = LAYOUT.teamKills.y;
    cells.push({
      key: `${side}-kills`,
      kind: "teamKills",
      side,
      slot: 0,
      region: clampRegion(cx + kx0 * H, ky0 * H, (kx1 - kx0) * H, (ky1 - ky0) * H),
    });

    const panelLeft = cx + (side === "blue" ? LAYOUT.panel.blueLeft : LAYOUT.panel.redLeft) * H;
    const rowH = ((LAYOUT.rows.y1 - LAYOUT.rows.y0) * H) / LAYOUT.rows.count;
    for (let slot = 1; slot <= LAYOUT.rows.count; slot += 1) {
      const rowTop = LAYOUT.rows.y0 * H + (slot - 1) * rowH;
      const bandTop = rowTop + LAYOUT.rowBand[0] * rowH;
      const bandH = (LAYOUT.rowBand[1] - LAYOUT.rowBand[0]) * rowH;
      for (const kind of ["score", "name", "kills", "deaths", "assists", "gold"] as const) {
        const [c0, c1] = LAYOUT.columns[kind];
        cells.push({
          key: `${side}-${slot}-${kind}`,
          kind,
          side,
          slot,
          region: clampRegion(panelLeft + c0 * H, bandTop, (c1 - c0) * H, bandH),
        });
      }
    }
  }
  return cells;
};

/* ───────────── Làm sạch ảnh từng ô ───────────── */

export type Rgba = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

export type PreprocessOptions = {
  /** Chiều cao ô sau khi phóng to; chữ chiếm ~40–50% ô → chữ cao ~ 0.45 × targetHeight. */
  targetHeight?: number;
  /** true: tách đen/trắng bằng Otsu; false: chỉ đảo màu + kéo giãn tương phản (giữ nét mảnh). */
  binarize?: boolean;
  /**
   * Nâng ngưỡng Otsu về phía điểm sáng nhất (0–1): nét chữ mảnh lại, bỏ quầng sáng / vầng MVP
   * (mờ hơn chữ). Ảnh nhỏ chữ dễ dính khối → cần nâng.
   */
  thresholdBias?: number;
};

/**
 * Cắt ô, đổi xám, phóng to (Tesseract đọc tốt nhất khi chữ cao 30–50px),
 * đảo thành chữ ĐEN trên nền TRẮNG kèm viền trắng.
 * Chữ trong game sáng hơn nền (trắng / xanh nhạt / hồng / vàng trên nền xanh hoặc tím đậm).
 */
export const preprocessCell = (
  image: Rgba,
  region: Region,
  { targetHeight = 120, binarize = true, thresholdBias = 0 }: PreprocessOptions = {},
): Rgba => {
  const { x, y, w, h } = region;
  // Xám theo độ sáng cảm nhận; với chữ màu (hồng/xanh) lấy kênh sáng nhất để chữ nổi hơn nền tối
  const gray = new Float32Array(w * h);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const p = ((y + j) * image.width + (x + i)) * 4;
      const r = image.data[p];
      const g = image.data[p + 1];
      const b = image.data[p + 2];
      gray[j * w + i] = 0.5 * Math.max(r, g, b) + 0.5 * (0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  const scale = Math.max(1, targetHeight / h);
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  // Phóng to song tuyến
  const up = new Float32Array(outW * outH);
  for (let j = 0; j < outH; j += 1) {
    const sy = Math.min(h - 1, Math.max(0, (j + 0.5) / scale - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let i = 0; i < outW; i += 1) {
      const sx = Math.min(w - 1, Math.max(0, (i + 0.5) / scale - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const top = gray[y0 * w + x0] * (1 - fx) + gray[y0 * w + x1] * fx;
      const bottom = gray[y1 * w + x0] * (1 - fx) + gray[y1 * w + x1] * fx;
      up[j * outW + i] = top * (1 - fy) + bottom * fy;
    }
  }

  // Ngưỡng Otsu
  const histogram = new Array<number>(256).fill(0);
  for (const value of up) histogram[Math.max(0, Math.min(255, Math.round(value)))] += 1;
  const total = up.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * histogram[t];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t += 1) {
    weightB += histogram[t];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  // Kéo giãn tương phản quanh ngưỡng (khi không tách đen/trắng)
  let darkest = 255;
  let brightest = 0;
  for (const value of up) {
    if (value < darkest) darkest = value;
    if (value > brightest) brightest = value;
  }
  const span = Math.max(1, brightest - darkest);
  threshold += thresholdBias * (brightest - threshold);

  // Chữ sáng → đen; nền → trắng. Thêm viền trắng (Tesseract cần lề).
  const pad = 16;
  const W2 = outW + pad * 2;
  const H2 = outH + pad * 2;
  const out = new Uint8ClampedArray(W2 * H2 * 4).fill(255);
  for (let j = 0; j < outH; j += 1) {
    for (let i = 0; i < outW; i += 1) {
      const value = up[j * outW + i];
      const p = ((j + pad) * W2 + (i + pad)) * 4;
      const v = binarize
        ? value > threshold
          ? 0
          : 255
        : Math.round(255 - (255 * (value - darkest)) / span);
      out[p] = v;
      out[p + 1] = v;
      out[p + 2] = v;
      out[p + 3] = 255;
    }
  }
  return { data: out, width: W2, height: H2 };
};

/* ───────────── Phân tích chữ OCR ───────────── */

export type ParsedPlayer = {
  slot: number;
  ign: string;
  performance_score: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  gold: number | null;
};

const digitsFixes: Record<string, string> = { O: "0", o: "0", D: "0", Q: "0", l: "1", I: "1", "|": "1", "!": "1", S: "5", s: "5", B: "8", Z: "2", z: "2", G: "6", g: "9", q: "9" };

/** Sửa ký tự hay đọc nhầm thành chữ trong vùng chỉ có số. */
export const normalizeDigits = (text: string) =>
  text
    .split("")
    .map((ch) => digitsFixes[ch] ?? ch)
    .join("");

/** Tỉ số đội: số nguyên đầu tiên. */
export const parseTeamKills = (text: string): number | null => {
  const match = normalizeDigits(text).match(/\d+/);
  return match ? Number(match[0]) : null;
};

/** Điểm (vd. 8.1, 10.5). OCR hay mất dấu chấm: "81" → 8.1, "105" → 10.5. */
export const parseScore = (text: string): number | null => {
  const clean = normalizeDigits(text).replace(/,/g, ".").replace(/[^\d.]/g, "");
  if (!clean) return null;
  let value: number;
  if (clean.includes(".")) {
    value = Number.parseFloat(clean.replace(/\.(?=.*\.)/g, ""));
  } else if (clean.length >= 2) {
    value = Number(`${clean.slice(0, -1)}.${clean.slice(-1)}`);
  } else {
    value = Number(clean);
  }
  return Number.isFinite(value) && value >= 0 && value <= 20 ? Math.round(value * 10) / 10 : null;
};

/** K / D / A: số nguyên 0–40 (bỏ ký tự rác, sửa chữ hay nhầm thành số). */
export const parseSmallCount = (text: string): number | null => {
  const match = normalizeDigits(text).match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return value <= 40 ? value : null;
};

/** Vàng: 3–5 chữ số (một trận Liên Quân ~ 2.000–30.000). */
export const parseGold = (text: string): number | null => {
  const digits = normalizeDigits(text).replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 5) return null;
  const value = Number(digits);
  return value >= 500 && value <= 40000 ? value : null;
};

/** Tên: bỏ ký tự rác ở 2 đầu do viền / huy hiệu. */
export const cleanName = (text: string) =>
  text
    .replace(/[\r\n]+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.^_\-)]+$/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/* ───────────── Ghép kết quả + kiểm tra ───────────── */

export type AovGameStats = {
  game: {
    blue_kills: number | null;
    red_kills: number | null;
    duration_sec: number;
    duration_mmss: string;
    winner_side: Side | null;
  };
  players: Record<Side, ParsedPlayer[]>;
};

export type OcrWarning = { key: string; message: string };

export const assembleResult = (texts: Record<string, string>): { result: AovGameStats; warnings: OcrWarning[] } => {
  const warnings: OcrWarning[] = [];
  const players: Record<Side, ParsedPlayer[]> = { blue: [], red: [] };

  for (const side of ["blue", "red"] as Side[]) {
    for (let slot = 1; slot <= 5; slot += 1) {
      const cell = (kind: string) => texts[`${side}-${slot}-${kind}`] ?? "";
      const player: ParsedPlayer = {
        slot,
        ign: cleanName(cell("name")),
        performance_score: parseScore(cell("score")),
        kills: parseSmallCount(cell("kills")),
        deaths: parseSmallCount(cell("deaths")),
        assists: parseSmallCount(cell("assists")),
        gold: parseGold(cell("gold")),
      };
      players[side].push(player);
    }
  }

  const blueKills = parseTeamKills(texts["blue-kills"] ?? "");
  const redKills = parseTeamKills(texts["red-kills"] ?? "");

  // Suy ô K còn thiếu: tổng K của 1 đội = tỉ số đội đó.
  // KHÔNG suy D: người chơi còn chết vì trụ / quái nên tổng D ≥ tỉ số đội kia (không bằng).
  const inferred: string[] = [];
  const fillOne = (side: Side, field: "kills", total: number | null) => {
    if (total === null) return;
    const missing = players[side].filter((player) => player[field] === null);
    if (missing.length !== 1) return;
    const known = players[side].reduce((sum, player) => sum + (player[field] ?? 0), 0);
    const value = total - known;
    if (value >= 0 && value <= 40) {
      missing[0][field] = value;
      inferred.push(`${side}-${missing[0].slot}-${field}`);
    }
  };
  fillOne("blue", "kills", blueKills);
  fillOne("red", "kills", redKills);

  for (const side of ["blue", "red"] as Side[]) {
    for (const player of players[side]) {
      const label = `${side === "blue" ? "Xanh" : "Đỏ"} #${player.slot}`;
      const key = (kind: string) => `${side}-${player.slot}-${kind}`;
      if (!player.ign) warnings.push({ key: key("name"), message: `${label}: không đọc được tên` });
      if (player.performance_score === null) warnings.push({ key: key("score"), message: `${label}: không đọc được điểm` });
      for (const [field, name] of [["kills", "K"], ["deaths", "D"], ["assists", "A"]] as const) {
        if (player[field] === null) warnings.push({ key: key(field), message: `${label}: không đọc được ${name}` });
        else if (inferred.includes(key(field))) {
          warnings.push({ key: key(field), message: `${label}: ${name} được suy từ tỉ số — kiểm tra lại` });
        }
      }
      if (player.gold === null) warnings.push({ key: key("gold"), message: `${label}: không đọc được vàng` });
    }
  }
  const sumKills = (side: Side) => players[side].reduce((sum, player) => sum + (player.kills ?? 0), 0);
  for (const [side, kills] of [["blue", blueKills], ["red", redKills]] as const) {
    const label = side === "blue" ? "đội xanh" : "đội đỏ";
    if (kills === null) warnings.push({ key: `${side}-kills`, message: `Không đọc được tỉ số ${label}` });
    else if (kills !== sumKills(side)) {
      warnings.push({ key: `${side}-kills`, message: `Tổng hạ gục ${label} (${sumKills(side)}) ≠ tỉ số (${kills}) — kiểm tra lại K` });
    }
  }
  // Mỗi hạ gục là 1 lần chết của đội kia; đội kia còn có thể chết vì trụ / quái → tổng D ≥ tỉ số đối thủ
  const sumDeaths = (side: Side) => players[side].reduce((sum, player) => sum + (player.deaths ?? 0), 0);
  if (blueKills !== null && sumDeaths("red") < blueKills) {
    warnings.push({ key: "red-deaths", message: `Tổng chết đội đỏ (${sumDeaths("red")}) < tỉ số xanh (${blueKills}) — kiểm tra lại D` });
  }
  if (redKills !== null && sumDeaths("blue") < redKills) {
    warnings.push({ key: "blue-deaths", message: `Tổng chết đội xanh (${sumDeaths("blue")}) < tỉ số đỏ (${redKills}) — kiểm tra lại D` });
  }

  // Ảnh không ghi đội thắng: đoán theo tỉ số, BTC xác nhận lại
  const winner: Side | null =
    blueKills !== null && redKills !== null && blueKills !== redKills ? (blueKills > redKills ? "blue" : "red") : null;
  warnings.push(
    winner
      ? { key: "winner", message: "Đội thắng đang đoán theo tỉ số hạ gục — xác nhận lại" }
      : { key: "winner", message: "Chưa xác định được đội thắng (hoà hoặc thiếu tỉ số) — chọn đội thắng ở bảng bên dưới" },
  );

  return {
    result: {
      game: { blue_kills: blueKills, red_kills: redKills, duration_sec: 0, duration_mmss: "", winner_side: winner },
      players,
    },
    warnings,
  };
};

/** Giá trị đọc được có hợp lệ không (để quyết định đọc lại bằng cách khác). */
export const isCellTextValid = (kind: CellKind, text: string) => {
  switch (kind) {
    case "teamKills":
      return parseTeamKills(text) !== null;
    case "score":
      return parseScore(text) !== null;
    case "kills":
    case "deaths":
    case "assists":
      return parseSmallCount(text) !== null;
    case "gold":
      return parseGold(text) !== null;
    default:
      return cleanName(text).length >= 2;
  }
};

export type CellAttempt = { preprocess: PreprocessOptions; params: Record<string, string> };

/**
 * Các cách đọc 1 ô, thử lần lượt tới khi ra giá trị hợp lệ:
 * chế độ dòng (7) → từ (8) → ký tự (10, cho ô 1 chữ số), cỡ phóng to 120 → 160 → 90.
 */
export const cellAttempts = (kind: CellKind): CellAttempt[] => {
  const whitelist = tesseractParamsFor(kind).tessedit_char_whitelist;
  // Nâng ngưỡng nhẹ: đo trên ảnh mẫu, 0.15 cho số đúng nhiều nhất (0 → chữ dính khối, 0.3+ → mất nét)
  const bias = 0.15;
  const make = (psm: string, targetHeight: number, thresholdBias = bias): CellAttempt => ({
    preprocess: { targetHeight, binarize: true, thresholdBias },
    params: { tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: psm },
  });
  if (kind === "name") return [make("7", 120, 0), make("7", 160, 0), make("8", 120, 0)];
  const single = kind === "kills" || kind === "deaths" || kind === "assists";
  return [
    make("7", 120),
    make("8", 120),
    make("7", 160),
    ...(single ? [make("10", 120), make("10", 160)] : [make("8", 160)]),
    make("7", 120, 0),
    make("7", 90),
  ];
};

/** Cấu hình Tesseract theo loại ô. */
export const tesseractParamsFor = (kind: CellKind) => {
  switch (kind) {
    case "teamKills":
      return { tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7" };
    case "score":
      return { tessedit_char_whitelist: "0123456789.", tessedit_pageseg_mode: "7" };
    case "kills":
    case "deaths":
    case "assists":
    case "gold":
      return { tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "7" };
    default:
      return { tessedit_char_whitelist: "", tessedit_pageseg_mode: "7" };
  }
};
