// Resize an image file to a max dimension and return a JPEG data URL.
// Keeps localStorage usage reasonable (catalog products with raw photos
// would blow the 5-10MB origin quota in a few entries).
export async function fileToResizedDataUrl(
  file: File,
  maxDim = 800,
  quality = 0.85,
): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas non supporté");
    ctx.drawImage(img, 0, 0, w, h);
    // PNG for transparency support, JPEG for size
    const useJpeg = file.type !== "image/png";
    return canvas.toDataURL(useJpeg ? "image/jpeg" : "image/png", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
