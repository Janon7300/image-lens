// Pure geometry shared by the content script and regression tests.
globalThis.ImageLensLayout = {
  card(region, viewport) {
    const {w, h} = viewport;
    if (region.unplaced || ![region.x, region.y, region.w, region.h, w, h].every(Number.isFinite) || w < 80 || h < 80) return null;
    // Text dictates height; a model rectangle must never become a page-sized mask.
    const width = Math.min(480, w - 24, Math.max(Math.min(180, w - 24), region.w * w));
    const left = Math.max(12, Math.min(w - width - 12, (region.x + region.w / 2) * w - width / 2));
    const top = Math.max(12, Math.min(h - 60, region.y * h));
    return {left, top, width, maxHeight: Math.min(160, h - top - 12)};
  },
  overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
};
