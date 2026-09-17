/** 聊天截图：压缩、校验与展示辅助（demo：最多 4 张）。 */

export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_MAX_EDGE = 1280;
export const CHAT_IMAGE_JPEG_QUALITY = 0.82;
export const CHAT_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface ChatImageAttachment {
  id: string;
  mime: string;
  dataUrl: string;
  name: string;
}

export function isAllowedChatImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export function defaultImagePrompt(imageCount: number): string {
  if (imageCount <= 0) return "";
  return `请分析这${imageCount > 1 ? `${imageCount}张` : "张"}截图中的报错或问题，给出原因和可执行的解决步骤。`;
}

export function composeUserMessageText(text: string, imageCount: number): string {
  const trimmed = text.trim();
  if (imageCount <= 0) return trimmed;
  const body = trimmed || defaultImagePrompt(imageCount);
  return `${body}\n\n[已附 ${imageCount} 张图片]`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = dataUrl;
  });
}

/** 浏览器端压缩；非浏览器环境（单测）直接返回原 dataUrl。 */
export async function compressImageFile(file: File): Promise<ChatImageAttachment> {
  if (!isAllowedChatImageMime(file.type)) {
    throw new Error(`不支持的图片格式：${file.type || "unknown"}`);
  }
  const original = await readFileAsDataUrl(file);
  if (typeof document === "undefined") {
    return {
      id: crypto.randomUUID(),
      mime: file.type,
      dataUrl: original,
      name: file.name || "image",
    };
  }

  const img = await loadImage(original);
  const scale = Math.min(1, CHAT_IMAGE_MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      id: crypto.randomUUID(),
      mime: file.type,
      dataUrl: original,
      name: file.name || "image",
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  // GIF 动画会变成单帧 JPEG；对报错截图足够。
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl =
    mime === "image/png"
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", CHAT_IMAGE_JPEG_QUALITY);

  return {
    id: crypto.randomUUID(),
    mime,
    dataUrl,
    name: file.name || "screenshot",
  };
}

export async function appendChatImages(
  current: ChatImageAttachment[],
  files: File[]
): Promise<{ next: ChatImageAttachment[]; error?: string }> {
  const room = CHAT_IMAGE_MAX_COUNT - current.length;
  if (room <= 0) {
    return { next: current, error: `最多上传 ${CHAT_IMAGE_MAX_COUNT} 张图片` };
  }
  const selected = files.slice(0, room);
  const added: ChatImageAttachment[] = [];
  for (const file of selected) {
    try {
      added.push(await compressImageFile(file));
    } catch (err) {
      return {
        next: current,
        error: err instanceof Error ? err.message : "图片处理失败",
      };
    }
  }
  const next = [...current, ...added];
  const truncated = files.length > room;
  return {
    next,
    error: truncated ? `最多上传 ${CHAT_IMAGE_MAX_COUNT} 张，已保留前 ${CHAT_IMAGE_MAX_COUNT} 张` : undefined,
  };
}

export function parseDataUrl(dataUrl: string): { mime: string; ok: boolean } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl);
  if (!match) return { mime: "", ok: false };
  const mime = match[1].toLowerCase();
  return { mime, ok: isAllowedChatImageMime(mime) };
}
