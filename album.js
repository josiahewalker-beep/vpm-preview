// The BTS photo album, live in the browser (page thread, round 3 note 10 revised; scene/ALBUM.md). Loaded by index.html after
// bible.js when the Bible close-up (the hub) opens: the same viewer as the family Bible (bible.js makeBook) with the album's
// config - frames/album.glb (dark oxblood leatherette, "PHOTOGRAPHS", cord bows; hinge node al_front_hinge at the score line),
// its rest transform from frames/album.json, the leaves hinged at the score line (album.json `leaf`), the prints
// frames/album_p01..30.jpg (scene/art/album_pages.py: 53 BTS photographs on 30 faces = 15 card leaves + the black card; the face list
// and the leaf count come from frames/album_pages.json / album.json at mount, the `leaves` below are only the fallback). The lift,
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
  stopAt: 1, links: [], turn_s: 0.55, turn_gap: 0.8, hand_turn_s: 0.6, cover: 'album', paper: '#15120f', sound: null, card: true,   // round 5 note 2: the album makes no sound at all (no leaf, no cover, no drop)
  chamfer: 0,                                                                         // no corner protectors on the album
  // round 4 note 4: tuned against c_bible's album region (page4/tune.py, SwiftShader at 720x450, the polygon from closeups.json eroded 4 px):
  // live vs still mean RGB +1.2 / -1.0 / -1.6 %, luminance 0.0 % (it started at -74 %: the dark leatherette needs the room's reflection, env 1.5, and ~2x exposure;
  // the oxblood map reads browner in Cycles, so the cover's own colour is tinted toward green, not the lights: the prints and the black card stay neutral)
  lights: { key: 1.05, sky: 0xf2e4d0, ground: 0x6b4a30, hemi: 0.45, fill: 0.22, rim: 0.2, exposure: 1.95, shadow: 0.38, env: 1.5, tint: [1, 1, 1], coverTint: [1.0, 1.3, 0.9], envTint: [0.95, 1.0, 0.62] },
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
    // round 4: the leaf count is capped by album.json (`leaf.count`, the block the render thread built: 30): plain black card beyond the art,
    // but never more than one blank leaf after the last print (today: 30 faces -> 15 printed leaves + the blank = 16 live leaves on the block)
    const want = aj && aj.leaf && aj.leaf.count ? Math.min(aj.leaf.count, leaves.length + (leaves[leaves.length - 1][0] ? 1 : 0)) : leaves.length;
    while (leaves.length < want) leaves.push([null, null]);
    over.leaves = leaves;
  }
  return over;
};
})();
