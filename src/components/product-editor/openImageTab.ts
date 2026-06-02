/** Ouvre une image (data URL ou URL externe) dans un nouvel onglet.
 *  Chrome bloque l'ouverture directe des data URLs — on crée une mini-page HTML. */
export const openImageTab = (src: string) => {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(
    `<!DOCTYPE html><html><head><title>Image</title>` +
    `<style>body{margin:0;background:#111;display:flex;align-items:center;` +
    `justify-content:center;min-height:100vh;}` +
    `img{max-width:100%;max-height:100vh;object-fit:contain;}</style></head>` +
    `<body><img src="${src}"/></body></html>`
  );
  win.document.close();
};
