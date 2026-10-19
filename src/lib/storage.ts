import { supabase } from "@/integrations/supabase/client";

/**
 * Converts a base64 data URL to a binary Blob for storage upload
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Uploads a payment proof image to the private 'payment-proofs' storage bucket.
 * If successful, returns the storage reference path 'payment-proofs/<filename>'.
 * If the bucket is not available or upload encounters an error, falls back to the original
 * data URL string so order placement and checkout never fail.
 */
export async function uploadPaymentProofImage(
  dataUrlOrFile: string | File,
  orderCode: string
): Promise<string> {
  try {
    let blob: Blob;
    let contentType = "image/jpeg";

    if (typeof dataUrlOrFile === "string") {
      if (!dataUrlOrFile.startsWith("data:image/")) {
        // Already a storage path, URL, or plain identifier
        return dataUrlOrFile;
      }
      blob = dataUrlToBlob(dataUrlOrFile);
      contentType = blob.type || "image/jpeg";
    } else {
      blob = dataUrlOrFile;
      contentType = dataUrlOrFile.type || "image/jpeg";
    }

    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const cleanCode = (orderCode || "order").replace(/[^a-zA-Z0-9-]/g, "");
    const filename = `${cleanCode}_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("payment-proofs")
      .upload(filename, blob, {
        contentType,
        upsert: true,
      });

    if (!error && data?.path) {
      return `payment-proofs/${data.path}`;
    }

    console.warn("[Storage] Bucket upload unavailable, preserving image data in database payload:", error?.message);
    return typeof dataUrlOrFile === "string" ? dataUrlOrFile : "";
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn("[Storage] Upload exception, falling back:", errorMsg);
    return typeof dataUrlOrFile === "string" ? dataUrlOrFile : "";
  }
}

/**
 * Resolves a displayable image URL from a proof image reference.
 * Handles data URLs, external HTTP URLs, and private Supabase Storage paths.
 */
export async function resolveProofImageUrl(proofRef: string): Promise<string> {
  if (!proofRef) return "";
  if (proofRef.startsWith("data:") || proofRef.startsWith("http://") || proofRef.startsWith("https://")) {
    return proofRef;
  }
  if (proofRef.startsWith("payment-proofs/")) {
    const storagePath = proofRef.replace(/^payment-proofs\//, "");
    try {
      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(storagePath, 3600);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch (err) {
      console.warn("[Storage] Failed to resolve signed URL for proof:", err);
    }
  }
  return proofRef;
}
