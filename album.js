// The BTS photo album, live in the browser (page thread, round 3 note 10 revised; scene/ALBUM.md). Loaded by index.html after
// bible.js when the Bible close-up (the hub) opens: the same viewer as the family Bible (bible.js makeBook) with the album's
// config - frames/album.glb (dark oxblood leatherette, "PHOTOGRAPHS", cord bows; hinge node al_front_hinge at the score line),
// its rest transform from frames/album.json, the leaves hinged at the score line (album.json `leaf`), the prints
// frames/album_p01..12.jpg (scene/art/album_pages.py; placeholders until Josiah's Drive folder is link-shared). The lift,
// the opening, the leaf run and the sounds are the Bible's; the card leaves are stiffer, so the run turns one leaf and the rest
// are turned by hand (click a page, <- ->, the strip). Until album.glb lands it is built on bible.glb at the album's spot.
// window.album = { mount(canvasEl, meta, albumJson), show(), hide(), lift(), release(), turn(dir), unmount(), get state(), ... }
(() => {
'use strict';
const B = window.BIBLE_CFG;
const ALBUM_CFG = Object.assign({}, B, {
  name: 'album', glb: 'frames/album.glb', fallbackGlb: 'frames/bible.glb', hinge: 'al_front_hinge', fallbackHinge: 'bb_front_hinge',
  rest: { translation: [2.143, 2.792, 0.436], rotation_z_deg: 4 },                  // ALBUM.md: T(2.143, 2.792, 0.436) * Rz(4)
  block: { xs: -0.0585, xf: 0.0755, h: 0.225, zt: 0.035 },                           // album.json `leaf`: hinged at the score line x0, on the block top
  closed: { w: 0.19, h: 0.26, cz: 0.025, pitch: 0.1, dy: 0.03 }, open: { w: 0.30, h: 0.25, pitch: 0.2, dy: 0.025, pw: 0.15, ph: 0.25, ppitch: 0.16, pdy: 0.02 },
  leaves: [['album_p01', 'album_p02'], ['album_p03', 'album_p04'], ['album_p05', 'album_p06'], ['album_p07', 'album_p08'], ['album_p09', 'album_p10'], ['album_p11', 'album_p12'], [null, null]],
  stopAt: 1, links: [], turn_s: 0.55, turn_gap: 0.8, hand_turn_s: 0.6, cover: 'album', paper: '#15120f', sound: 'leaf', card: true,
});
/** albumJson = frames/album.json (the render thread's contract): rest, hinge, leaf box; pages from frames/album_pages.json when given */
window.album = window.makeBook(ALBUM_CFG);
window.album.configFrom = function (aj, pj) {
  const over = {};
  if (aj) {
    if (aj.rest) over.rest = aj.rest;
    if (aj.leaf) over.block = { xs: aj.leaf.x0, xf: aj.leaf.x1, h: aj.leaf.y1 - aj.leaf.y0, zt: aj.leaf.z_top };
    if (aj.size) { const [sx, sy] = aj.size; over.closed = Object.assign({}, ALBUM_CFG.closed, { w: sx * 1.15, h: sy * 1.1 }); }
  }
  if (pj && Array.isArray(pj.leaves) && pj.leaves.length) {       // album_pages.json: the art files in order; art 01 is the block's top (the recto of leaf 0)
    const names = pj.leaves.map(l => String(l.file || l).replace(/^album_page_(\d+)\.png$/, (m, d) => 'album_p' + d)), leaves = [];
    while (names.length) leaves.push([names.shift(), names.shift() || null]);
    if (leaves[leaves.length - 1][1]) leaves.push([null, null]);     // the last leaf turned shows the black card
    over.leaves = leaves;
  }
  return over;
};
})();
