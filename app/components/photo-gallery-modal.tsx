"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type GallerySpace = { schoolName: string; space: { id: number; name: string } };

export function PhotoGalleryModal({
  gallerySpace,
  onClose,
}: {
  gallerySpace: GallerySpace;
  onClose: () => void;
}) {
  const [galleryIndex, setGalleryIndex] = useState(0);
  const galleryQuery = useQuery({
    queryKey: ["space-pictures", gallerySpace.space.id],
    queryFn: async () => {
      const res = await fetch(`/api/space-pictures/${gallerySpace.space.id}`);
      if (!res.ok) throw new Error("Couldn't load photos for this space.");
      return (await res.json()) as { pictureUrls: string[] };
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const total = galleryQuery.data?.pictureUrls.length ?? 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (total > 1 && event.key === "ArrowRight") setGalleryIndex((i) => (i + 1) % total);
      else if (total > 1 && event.key === "ArrowLeft") setGalleryIndex((i) => (i - 1 + total) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [galleryQuery.data?.pictureUrls.length, onClose]);

  return (
    <div
      className="photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${gallerySpace.space.name} photos`}
      onClick={onClose}
    >
      <div className="photo-modal" onClick={(event) => event.stopPropagation()}>
        <header className="photo-modal-header">
          <div>
            <h3>{gallerySpace.space.name}</h3>
            <div className="meta">{gallerySpace.schoolName}</div>
          </div>
          <button type="button" className="photo-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="photo-modal-body">
          {galleryQuery.isLoading ? <div className="photo-modal-status">Loading photos...</div> : null}
          {galleryQuery.error ? <div className="photo-modal-status">{(galleryQuery.error as Error).message}</div> : null}
          {galleryQuery.data && galleryQuery.data.pictureUrls.length === 0 ? (
            <div className="photo-modal-status">No photos available for this space.</div>
          ) : null}
          {galleryQuery.data && galleryQuery.data.pictureUrls.length > 0 ? (() => {
            const urls = galleryQuery.data.pictureUrls;
            const safeIndex = Math.min(galleryIndex, urls.length - 1);
            const total = urls.length;
            return (
              <div className="photo-modal-carousel">
                <div className="photo-modal-stage">
                  <Image
                    key={urls[safeIndex]}
                    src={urls[safeIndex]}
                    alt={`${gallerySpace.space.name} photo ${safeIndex + 1} of ${total}`}
                    className="photo-modal-image"
                    fill
                    sizes="min(92vw, 980px)"
                    unoptimized
                  />
                  {total > 1 ? (
                    <>
                      <button
                        type="button"
                        className="photo-modal-nav prev"
                        onClick={() => setGalleryIndex((i) => (i - 1 + total) % total)}
                        aria-label="Previous photo"
                      >‹</button>
                      <button
                        type="button"
                        className="photo-modal-nav next"
                        onClick={() => setGalleryIndex((i) => (i + 1) % total)}
                        aria-label="Next photo"
                      >›</button>
                    </>
                  ) : null}
                </div>
                {total > 1 ? (
                  <div className="photo-modal-counter" aria-live="polite">{safeIndex + 1} / {total}</div>
                ) : null}
              </div>
            );
          })() : null}
        </div>
      </div>
    </div>
  );
}
