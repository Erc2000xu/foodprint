export type PrivateUploadRequest = {
  groupId: string;
  userId: string;
  filename: string;
  contentType: "image/webp";
  bytes: number;
};

export type StoredObject = {
  provider: "supabase" | "cos";
  objectKey: string;
};

/** Private media only: callers must never persist signed URLs as object IDs. */
export interface StorageProvider {
  uploadImage(input: PrivateUploadRequest, file: Blob): Promise<StoredObject>;
  createReadUrl(object: StoredObject, expiresInSeconds: number): Promise<string>;
  softDelete(object: StoredObject): Promise<void>;
}
