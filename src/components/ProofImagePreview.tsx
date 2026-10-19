import React, { useEffect, useState } from "react";
import { resolveProofImageUrl } from "../lib/storage";

interface ProofImagePreviewProps {
  src?: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function ProofImagePreview({
  src,
  alt = "Payment proof",
  className = "",
  onClick,
}: ProofImagePreviewProps) {
  const [resolvedSrc, setResolvedSrc] = useState(src || "");

  useEffect(() => {
    let active = true;
    if (!src) {
      setResolvedSrc("");
      return;
    }
    if (src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")) {
      setResolvedSrc(src);
      return;
    }
    resolveProofImageUrl(src).then((url) => {
      if (active && url) {
        setResolvedSrc(url);
      }
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (!resolvedSrc) {
    return (
      <div className={`grid place-items-center bg-stone-100 text-xs text-stone-400 dark:bg-zinc-800 ${className}`}>
        Loading receipt...
      </div>
    );
  }

  return <img src={resolvedSrc} alt={alt} className={className} onClick={onClick} />;
}
