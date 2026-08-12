export type WebpMetadata = { width: number; height: number; hasAlpha: boolean };

function ascii(bytes: Uint8Array, offset: number) {
  return String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);
}

function u16(bytes: Uint8Array, offset: number) { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8); }
function u24(bytes: Uint8Array, offset: number) { return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16); }

/** Reads dimensions from WebP headers without trusting MIME or form metadata. */
export function readWebpMetadata(buffer: ArrayBuffer): WebpMetadata | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset);
    const size = (bytes[offset + 4] ?? 0) | ((bytes[offset + 5] ?? 0) << 8) | ((bytes[offset + 6] ?? 0) << 16) | ((bytes[offset + 7] ?? 0) << 24);
    const data = offset + 8;
    if (size < 0 || data + size > bytes.length) return null;
    if (type === "VP8X" && size >= 10) return { width: u24(bytes, data + 4) + 1, height: u24(bytes, data + 7) + 1, hasAlpha: Boolean((bytes[data] ?? 0) & 0x10) };
    if (type === "VP8 " && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) return { width: u16(bytes, data + 6) & 0x3fff, height: u16(bytes, data + 8) & 0x3fff, hasAlpha: false };
    if (type === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      const bits = (bytes[data + 1] ?? 0) | ((bytes[data + 2] ?? 0) << 8) | ((bytes[data + 3] ?? 0) << 16) | ((bytes[data + 4] ?? 0) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, hasAlpha: true };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

export function isValidWebpFile(file: { type?: string; size: number }, metadata: WebpMetadata | null, limits: { maxEdge: number; maxBytes: number; maxPixels?: number }) {
  if (file.size < 1 || file.size > limits.maxBytes || !metadata) return false;
  const maxPixels = limits.maxPixels ?? 24_000_000;
  return metadata.width >= 1 && metadata.height >= 1 && Math.max(metadata.width, metadata.height) <= limits.maxEdge && metadata.width * metadata.height <= maxPixels;
}
