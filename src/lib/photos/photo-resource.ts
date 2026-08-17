export type PhotoResourceRow = {
  id: string;
  object_key?: string | null;
  width?: number | null;
  height?: number | null;
  thumbnail_object_key?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
};

export type PhotoResource = {
  id: string;
  key: string;
  resource: "thumbnail" | "canonical";
  width: number | null;
  height: number | null;
};

function usableKey(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Selects a visible private object without exposing its storage key. */
export function selectPhotoResource(row: PhotoResourceRow): PhotoResource | null {
  const thumbnailKey = usableKey(row.thumbnail_object_key);
  if (thumbnailKey) {
    return {
      id: row.id,
      key: thumbnailKey,
      resource: "thumbnail",
      width: row.thumbnail_width ?? row.width ?? null,
      height: row.thumbnail_height ?? row.height ?? null,
    };
  }
  const canonicalKey = usableKey(row.object_key);
  if (!canonicalKey) return null;
  return {
    id: row.id,
    key: canonicalKey,
    resource: "canonical",
    width: row.width ?? null,
    height: row.height ?? null,
  };
}
