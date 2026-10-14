import type { Worker } from "tesseract.js";
import {
  assembleResult,
  buildCells,
  cellAttempts,
  isCellTextValid,
  preprocessCell,
  type AovGameStats,
  type OcrWarning,
  type Rgba,
} from "@/lib/aovScoreboardCore";

/**
 * Đọc ảnh tổng kết trận Liên Quân ngay trên trình duyệt (Tesseract.js, không gửi ảnh lên server).
 * Logic cắt ô / làm sạch / phân tích nằm ở aovScoreboardCore.ts (dùng chung với script thử).
 * Tesseract.js tải mã + dữ liệu ngôn ngữ (eng, vie) từ CDN ở lần đọc đầu, sau đó trình duyệt lưu cache.
 */

export type ScoreboardReadResult = {
  fileName: string;
  /** null khi ảnh này lỗi (không mở được / đọc hỏng) — xem error. */
  result: AovGameStats | null;
  warnings: OcrWarning[];
  error?: string;
};

export type OcrProgress = { file: number; files: number; cell: number; cells: number };

/** Ảnh thấp hơn mức này thì chữ số chỉ vài pixel — đọc kém, nên dùng ảnh chụp gốc. */
const LOW_RES_HEIGHT = 600;

/** Bị huỷ (rời trang) giữa chừng. */
export class OcrCancelledError extends Error {
  constructor() {
    super("Đã huỷ đọc ảnh");
  }
}

const loadImage = async (file: File): Promise<Rgba> => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trình duyệt không hỗ trợ canvas");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width, height };
};

const toCanvas = (image: Rgba) => {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas;
};

let workersPromise: Promise<{ digits: Worker; names: Worker }> | null = null;
/** Tăng mỗi lần huỷ: vòng đọc đang chạy so số này để dừng sớm. */
let generation = 0;

/** 2 worker dùng lại giữa các lần đọc: số (eng) và tên (vie + eng). */
const getWorkers = () => {
  if (!workersPromise) {
    workersPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const [digits, names] = await Promise.all([createWorker("eng"), createWorker(["vie", "eng"])]);
      return { digits, names };
    })().catch((error) => {
      workersPromise = null;
      throw error;
    });
  }
  return workersPromise;
};

/**
 * Giải phóng worker (khi rời trang). Lấy và xoá promise NGAY (trước khi await) để lần mount sau
 * tạo worker mới thay vì nhận worker đang bị tắt; vòng đọc đang chạy dừng nhờ `generation`.
 */
export const disposeScoreboardOcr = async () => {
  generation += 1;
  const pending = workersPromise;
  workersPromise = null;
  if (!pending) return;
  const workers = await pending.catch(() => null);
  await Promise.all([workers?.digits.terminate(), workers?.names.terminate()]);
};

/** Đọc 1 ảnh → kết quả + cảnh báo. */
const readOne = async (
  file: File,
  workers: { digits: Worker; names: Worker },
  myGeneration: number,
  onCell: (cell: number, cells: number) => void,
): Promise<ScoreboardReadResult> => {
  const image = await loadImage(file);
  const cells = buildCells(image.width, image.height);
  const texts: Record<string, string> = {};

  for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
    if (myGeneration !== generation) throw new OcrCancelledError();
    const cell = cells[cellIndex];
    onCell(cellIndex + 1, cells.length);
    const worker = cell.kind === "name" ? workers.names : workers.digits;
    let text = "";
    for (const attempt of cellAttempts(cell.kind)) {
      await worker.setParameters(attempt.params as Parameters<Worker["setParameters"]>[0]);
      const { data } = await worker.recognize(toCanvas(preprocessCell(image, cell.region, attempt.preprocess)));
      text = data.text.trim();
      if (isCellTextValid(cell.kind, text)) break;
    }
    texts[cell.key] = text;
  }

  const { result, warnings } = assembleResult(texts);
  if (image.height < LOW_RES_HEIGHT) {
    warnings.unshift({
      key: "low-res",
      message: `Ảnh nhỏ (${image.width}×${image.height}) — chữ số chỉ vài pixel nên dễ đọc sai; dùng ảnh chụp màn hình gốc sẽ chính xác hơn`,
    });
  }
  return { fileName: file.name, result, warnings };
};

/**
 * Đọc nhiều ảnh (mỗi ảnh 1 ván), theo thứ tự đã chọn. Ảnh lỗi không làm hỏng cả lượt:
 * trả { result: null, error } cho ảnh đó và đọc tiếp ảnh sau. Huỷ giữa chừng → OcrCancelledError.
 */
export const readAovScoreboards = async (
  files: File[],
  onProgress?: (progress: OcrProgress) => void,
): Promise<ScoreboardReadResult[]> => {
  const myGeneration = generation;
  const workers = await getWorkers();
  if (myGeneration !== generation) throw new OcrCancelledError();
  const results: ScoreboardReadResult[] = [];

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    try {
      results.push(
        await readOne(file, workers, myGeneration, (cell, cells) =>
          onProgress?.({ file: fileIndex + 1, files: files.length, cell, cells }),
        ),
      );
    } catch (error) {
      if (error instanceof OcrCancelledError || myGeneration !== generation) throw new OcrCancelledError();
      results.push({
        fileName: file.name,
        result: null,
        warnings: [],
        error: error instanceof Error ? error.message : "Không đọc được ảnh",
      });
    }
  }

  return results;
};
