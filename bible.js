// The family Bible and the photo album, live in the browser (page thread, scene/BIBLE2.md, scene/ALBUM.md). Loaded by index.html
// when the Bible close-up opens. One viewer, two configs: `makeBook(CFG)` builds an instance; window.bible is the white Bible,
// window.album the black BTS photo album (the same lift, open, leaf run and sounds; its glb, rest transform, hinge node, page block
// and pages come from frames/album.json when the render thread's album lands, and until then it is built on bible.glb at the
// black book's spot on the table).
// Draws frames/bible.glb (the white padded Bible, scene/bible3d.py) with Three.js on a transparent canvas (#bible3d) over
// the page's WebGL canvas, with a camera that reproduces the Blender close-up camera (closeups.json c_bible: 30 mm lens,
// 1920x1200 frame) and the page's framing, so the model rests exactly where the rendered Bible lies on the table.
// Sequence: rest (the page shows the rendered still; this canvas is idle) -> lift() : the Bible rises toward the camera and
// turns to face it -> the padded front board swings open (bb_front_hinge, about its local +y, negative opens) -> a run of
// leaves turns (the title page, Doré plates, KJV text, the NT half-title: frames/bible_p01..10.jpg drawn on curling page meshes) -> settled on the bio
// spread (07 left, 08 right; the IMDb box and the site line on 08 are links) -> release() : the leaves fall back, the
// board closes, the Bible drops back onto the table -> rest.
// window.bible / window.album = { mount(canvasEl, meta, cfgOverrides), show(), hide(), lift(), release(), turn(dir), unmount(), get state(), ... }
(() => {
'use strict';
const THREE_URL = window.CRUX_THREE_URL || new URL('vendor/three.module.min.js', location.href).href;   // shipped with the site (MIT, vendor/three-LICENSE.txt)
let THREE = null, loading = null;
function loadThree() { return loading || (loading = import(THREE_URL).then(m => (THREE = m))); }
// Round 3 note 12: the Bible leafs rapidly to the bio (0.2 s a leaf, 0.12 s apart; the leaf sound is cut to match), then one more spread
// after the bio: "About the film" (09 | 10), the #about panel's content as page art (scene/art/bible_pages.py).
const BIBLE_CFG = {
  name: 'bible', glb: 'frames/bible.glb',                 // the review host can't serve .glb, so it also ships as bible.glb.wasm (same bytes)
  hinge: 'bb_front_hinge', rest: { translation: [2.415, 2.815, 0.436], rotation_z_deg: 322 },
  // the page block (bb_pages in the glb): spine at xs, fore-edge at xf, head/tail at +-h/2, top face at zt (BIBLE2.md, measured from the glb)
  block: { xs: -0.111, xf: 0.109, h: 0.278, zt: 0.0545 },
  closed: { w: 0.25, h: 0.315, cz: 0.032, pitch: 0.1, dy: 0.03 }, open: { w: 0.47, h: 0.30, pitch: 0.2, dy: 0.025, pw: 0.236, ph: 0.30, ppitch: 0.16, pdy: 0.02 },
  // the leaves: recto = the face seen on the right before the turn, verso = the face seen on the left after it (null = a blank face).
  // Round 5: the title page is the recto of leaf 0 (it faces the reader as the cover opens, its verso blank), 06 is the New Testament
  // half-title; frames/bible_pages.json `leaves` (scene/art/bible_pages.py) carries the same list and wins when present (mount()).
  leaves: [['bible_p01', null], ['bible_p02', 'bible_p03'], ['bible_p04', 'bible_p05'], ['bible_p06', 'bible_p07'], ['bible_p08', 'bible_p09'], ['bible_p10', null]],
  stopAt: 4,                                              // the leaf run turns leaves 0..stopAt-1: the bio spread (07 | 08); one more turn = About the film (09 | 10)
  // the link boxes (fractions in frames/bible_pages.json): the bio page 08 (the recto of leaf 4) and About the film page 10 (the recto of leaf 5);
  // url = the json's <key>_url (index.html passes them as `urls`); a key without a url goes to meta.onLink(key) (the poster)
  links: [{ leaf: 4, face: 'recto', key: 'imdb_box', label: 'Josiah Walker on IMDb' }, { leaf: 4, face: 'recto', key: 'site_line', label: 'josiahwalker.com' },
          { leaf: 5, face: 'recto', key: 'about_press', label: 'Read the write-up · Indie Short Fest' }, { leaf: 5, face: 'recto', key: 'about_poster', label: 'See the poster' },
          { leaf: 5, face: 'recto', key: 'about_vimeo', label: 'The trailer on Vimeo' }, { leaf: 5, face: 'recto', key: 'about_insta', label: '@veryprosperousmenfilm on Instagram' },
          { leaf: 5, face: 'recto', key: 'about_bio', label: 'Josiah Walker · bio' }],
  lift_s: 1.3, open_s: 1.15, turn_s: 0.2, turn_gap: 0.12, run_delay: 0.15, close_s: 0.62, drop_s: 0.8, back_turn_s: 0.34, hand_turn_s: 0.72,
  cover: 'cover', paper: '#efe6d2', sound: 'leaf',       // sound: 'leaf' = the recorded page turns + cover creak + drop (pagesnd.js); null = silent (the album)
  // round 4 note 6: the leaf corners are chamfered (m along each edge from the corner) so they sit inside the board's brass corner
  // protectors (bible.glb: the inner triangles' hypotenuse at x + y = 0.2144 from the board centre; the block's corner is at (0.109, 0.139))
  chamfer: 0,   // Josiah 10-01: the page corners stay intact (was 0.0375, cut to sit inside the brass corners)
  // the live lights, matched to the Cycles still (round 3 note 6 for the cross, round 4 note 4 for the books): key / hemisphere sky, ground / fill / rim
  // intensities, the environment's strength on the cover, the renderer's exposure; the shadow catcher's darkness
  // (tint: a multiplier on every light's colour, envTint on the room reflection.) Round 4 note 4, tuned against c_bible's Bible region as the album's
  // (page4/tune.py): live vs still mean RGB -0.3 / +2.1 / -2.2 %, luminance 0.0 % (was +3.1 / +8.2 / +15.2 %, +7.9 %). coverTint tints the cover's map only.
  lights: { key: 1.05, sky: 0xf2e4d0, ground: 0x6b4a30, hemi: 0.45, fill: 0.22, rim: 0.2, exposure: 0.9, shadow: 0.38, env: 0.55, tint: [1, 1, 1], coverTint: [1.03, 0.98, 0.92], envTint: [1.0, 1.0, 0.78] },
};
function makeBook(CFG0) {
const CFG = Object.assign({}, CFG0);
let LIFT_S = CFG.lift_s, OPEN_S = CFG.open_s, TURN_S = CFG.turn_s, TURN_GAP = CFG.turn_gap, RUN_DELAY = CFG.run_delay, CLOSE_S = CFG.close_s, DROP_S = CFG.drop_s, BACK_TURN_S = CFG.back_turn_s;
const FILL = 0.8;
let XS = CFG.block.xs, XF = CFG.block.xf, H = CFG.block.h, ZT = CFG.block.zt, L = XF - XS;
let LEAF_DZ = 0.00025;                                    // the stack's leaf spacing: 0.25 mm, less when there are many leaves (the whole stack stays inside the closed board's thickness)
function setLeafDZ() { LEAF_DZ = Math.min(0.00025, 0.0012 / Math.max(1, LEAVES.length - 1)); }
const NX = 30, NY = 12;                                   // leaf mesh grid (12 rows: the first and last rows are exactly the chamfered corners' height)
let LEAVES = CFG.leaves, BIO_LEAF = CFG.stopAt;
const GLB_URL = () => CFG.glb;

// phones (Josiah's iPhone reloaded the tab on first opening the case, 10-01): the glb's 2K-4K maps are decoded at 1024 px on small screens
const PHONE = Math.max(innerWidth, innerHeight) < 1000;
async function capBitmap(bmp) { if (!PHONE || Math.max(bmp.width, bmp.height) <= 1024) return bmp; const k = 1024 / Math.max(bmp.width, bmp.height);
  try { const s = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'medium' }); bmp.close && bmp.close(); return s; } catch (e) { return bmp; } }
// ---------- a small GLB reader (as crucifix.js: meshes, materials, embedded images; node transforms honoured) ----------
async function loadGLB(url) {
  let r = await fetch(url); if (!r.ok) r = await fetch(url + '.wasm');
  const buf = await r.arrayBuffer(); const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); off += 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off, len)));
    else if (type === 0x004e4942) bin = buf.slice(off, off + len);
    off += len;
  }
  const bv = (i) => { const v = json.bufferViews[i]; return { off: v.byteOffset || 0, len: v.byteLength, stride: v.byteStride || 0 }; };
  const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }, CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  function accessor(i) {
    const a = json.accessors[i], v = bv(a.bufferView), n = TYPES[a.type], T = CT[a.componentType], start = v.off + (a.byteOffset || 0);
    if (!v.stride || v.stride === n * T.BYTES_PER_ELEMENT) return { arr: new T(bin, start, a.count * n), n };
    const out = new T(a.count * n);
    for (let k = 0; k < a.count; k++) { const s = new T(bin, start + k * v.stride, n); out.set(s, k * n); }
    return { arr: out, n };
  }
  const images = await Promise.all((json.images || []).map(async im => {
    const v = bv(im.bufferView); const blob = new Blob([new Uint8Array(bin, v.off, v.len)], { type: im.mimeType });
    return capBitmap(await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  }));
  const texCache = {};
  function texture(ti, srgb) {
    const key = ti + (srgb ? 's' : 'l'); if (texCache[key]) return texCache[key];
    const t = json.textures[ti]; const tex = new THREE.Texture(images[t.source]); tex.flipY = false; tex.needsUpdate = true;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return (texCache[key] = tex);
  }
  const mats = (json.materials || []).map(m => {
    const p = m.pbrMetallicRoughness || {}; const c = p.baseColorFactor || [1, 1, 1, 1]; const name = m.name || '';
    const side = m.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    let mat;
    if (/cover/.test(name)) {         // white pebble leatherette with gold foil (or the album's dark leather): the glb's maps under a light coat (Cycles: coat 0.12)
      const ct = CFG.lights.coverTint || [1, 1, 1];   // a colour multiplier on the cover's map alone (the lights stay neutral for the pages and prints)
      mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c[0] * ct[0], c[1] * ct[1], c[2] * ct[2]), metalness: 1, roughness: 1, side, clearcoat: 0.12, clearcoatRoughness: 0.35, envMapIntensity: CFG.lights.env, specularIntensity: 0.6 });
      mat.userData.base = [c[0], c[1], c[2]]; S.coverMats.push(mat);
    } else if (/ribbon/.test(name)) { // red satin: sheen
      mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c[0], c[1], c[2]), metalness: 0, roughness: p.roughnessFactor ?? 0.3, side, sheen: 0.6, sheenColor: new THREE.Color(1, 0.6, 0.55), sheenRoughness: 0.5, envMapIntensity: 0.4 });
    } else if (/brass|gilt/.test(name)) {   // brushed brass corners, gilt page edges: metal from the ORM map
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), metalness: 1, roughness: 1, side, envMapIntensity: 0.9 });
    } else {                          // endpapers
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), metalness: p.metallicFactor ?? 0, roughness: p.roughnessFactor ?? 0.9, side, envMapIntensity: 0.3 });
    }
    if (p.metallicRoughnessTexture) { const t = texture(p.metallicRoughnessTexture.index, false); mat.metalnessMap = t; mat.roughnessMap = t; }
    if (m.normalTexture) { mat.normalMap = texture(m.normalTexture.index, false); const sc = m.normalTexture.scale ?? 1; mat.normalScale = new THREE.Vector2(sc, -sc); }   // glTF's flipped V, as GLTFLoader does
    if (p.baseColorTexture) mat.map = texture(p.baseColorTexture.index, true);
    mat.name = name; return mat;
  });
  const root = new THREE.Group(); const named = {};
  const nodes = json.scenes[json.scene || 0].nodes;
  const addNode = (ni, parent) => {
    const nd = json.nodes[ni]; const g = new THREE.Group(); g.name = nd.name || ''; if (g.name) named[g.name] = g;
    if (nd.translation) g.position.fromArray(nd.translation); if (nd.rotation) g.quaternion.fromArray(nd.rotation); if (nd.scale) g.scale.fromArray(nd.scale);
    if (nd.matrix) { g.matrix.fromArray(nd.matrix); g.matrix.decompose(g.position, g.quaternion, g.scale); }
    if (nd.mesh !== undefined) for (const pr of json.meshes[nd.mesh].primitives) {
      const geo = new THREE.BufferGeometry();
      for (const [k, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']]) {
        if (pr.attributes[k] !== undefined) { const a = accessor(pr.attributes[k]); geo.setAttribute(name, new THREE.BufferAttribute(a.arr, a.n)); }
      }
      if (pr.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(pr.indices).arr, 1));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, pr.material !== undefined ? mats[pr.material] : new THREE.MeshStandardMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
      // Josiah 10-01: the brass corner protectors keep their outside cap and edge wraps only. Their inside caps lay over the corners of
      // the paste-down endpapers (the first and last spreads read as pages with the corners cut off); the back board's screws sat on that inside face too.
      const cm = /^bb_corner_([fb])\d$/.exec(g.name);
      if (cm && geo.attributes.position) {
        const P = geo.attributes.position, idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: P.count }, (_, i) => i);
        let lo = Infinity, hi = -Infinity; for (let i = 0; i < P.count; i++) { const z = P.getZ(i); if (z < lo) lo = z; if (z > hi) hi = z; }
        const inner = (z) => cm[1] === 'f' ? z < lo + 0.001 : z > hi - 0.001, keep = [];
        for (let t = 0; t < idx.length; t += 3) {
          const v = [idx[t], idx[t + 1], idx[t + 2]], xs = v.map(i => P.getX(i)), ys = v.map(i => P.getY(i));
          const cap = v.every(i => inner(P.getZ(i))) && Math.max(...xs) - Math.min(...xs) > 0.01 && Math.max(...ys) - Math.min(...ys) > 0.01;
          if (!cap) keep.push(v[0], v[1], v[2]);
        }
        geo.setIndex(keep);
      }
      if (/^bb_corner_b\d_(screw|slot)\d$/.test(g.name)) mesh.visible = false;
    }
    parent.add(g); (nd.children || []).forEach(c => addNode(c, g));
  };
  nodes.forEach(n => addNode(n, root));
  return { root, named };
}

// ---------- state ----------
const S = { canvas: null, meta: null, renderer: null, scene: null, cam: null, model: null, hinge: null, shadow: null, key: null, raf: 0, ready: false, failed: false,
            state: 'rest', p: 0, p0: 0, t0: 0, cover: 0, open: 0, visible: false, onState: null, leaves: [], turning: [], queue: [], runT: 0,
            focus: 1, hover: null, pagesLoaded: false, small: false, urls: {}, boxes: null, idle: 0, coverMats: [], hemi: null, fill: null, rim: null };
const rest = { pos: null, quat: null };
function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
function easeQuad(k) { return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k); }
function emit() { if (S.onState) try { S.onState(S.state); } catch (e) {} }

function restPose() {
  // hero.py: grouped(family_bible, (tx + 0.415, ty - 0.035, top), 322) with tx, ty, top = 2.0, 2.85, 0.436  (bible.json `rest`)
  const r = (S.meta.rest && S.meta.rest.translation) || CFG.rest.translation, rz = (S.meta.rest && S.meta.rest.rotation_z_deg) || CFG.rest.rotation_z_deg;
  const M = new THREE.Matrix4().makeTranslation(r[0], r[1], r[2]).multiply(new THREE.Matrix4().makeRotationZ(rz * Math.PI / 180));
  rest.pos = new THREE.Vector3(); rest.quat = new THREE.Quaternion(); M.decompose(rest.pos, rest.quat, new THREE.Vector3());
}
function camBasis() {
  const m = S.meta; const c = new THREE.Vector3().fromArray(m.cam), a = new THREE.Vector3().fromArray(m.aim);
  const f = a.clone().sub(c).normalize(); const r = f.clone().cross(new THREE.Vector3(0, 0, 1)).normalize(); const u = r.clone().cross(f);
  return { c, f, r, u };
}
/** the Bible turned to the camera: fit a w x h box (local x, y) so that local (cx, 0, cz) sits at the visible centre, pitched (top edge away) */
function fitPose(w, h, cx, cz, pitch, dy, wf) {
  const { c, f, r, u } = camBasis(); const fr = S.meta.framing();
  const fovH = 2 * Math.atan(18 / S.meta.lens), aspect = S.meta.res[0] / S.meta.res[1];
  const tanV = Math.tan(fovH / 2) / aspect, tanH = Math.tan(fovH / 2);
  const dV = h / (FILL * fr.sc[1] * 2 * tanV), dH = w / ((wf || 0.9) * fr.sc[0] * 2 * tanH);
  const d = Math.max(dV, dH);
  const sx = (fr.fc[0] + (0.5 - fr.vc[0]) * fr.sc[0]) - 0.5, sy = (fr.fc[1] + (0.5 - fr.vc[1]) * fr.sc[1]) - 0.5 + (dy || 0) * fr.sc[1];
  const target = c.clone().addScaledVector(f, d).addScaledVector(r, sx * 2 * tanH * d).addScaledVector(u, sy * 2 * tanV * d);
  const R = new THREE.Matrix4().makeBasis(r, u, f.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(R);
  if (pitch) q.premultiply(new THREE.Quaternion().setFromAxisAngle(r, -pitch));
  const pos = target.sub(new THREE.Vector3(cx, 0, cz).applyQuaternion(q));
  return { pos, quat: q };
}
function closedPose() { const c = CFG.closed; return fitPose(c.w, c.h, 0.0, c.cz, c.pitch, c.dy); }
function openPose() {
  const portrait = S.canvas.clientWidth < S.canvas.clientHeight, o = CFG.open;
  if (portrait && S.focus !== 0) return fitPose(o.pw, 0.01, S.focus > 0 ? (XS + XF) / 2 : (XS + XF) / 2 - L - 0.004, ZT, 0.06, 0, S.meta.zoomW || 0.97);   // one page across the full width, nearly square-on (Josiah 10-01: bigger, crisp)   // a phone: focus 0 = the whole spread across the width (Josiah 10-01), +/-1 = one page filling it
  return fitPose(o.w, o.h, XS - 0.002, ZT, o.pitch, o.dy);
}

function setup() {
  const m = S.meta;
  S.renderer = new THREE.WebGLRenderer({ canvas: S.canvas, alpha: true, antialias: !PHONE, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });   // preserved: index.html reads this canvas each frame and composites it under its film pass
  S.renderer.setClearColor(0x000000, 0); S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.0;
  S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.scene = new THREE.Scene();
  const fovH = 2 * Math.atan(18 / m.lens), aspect = m.res[0] / m.res[1];
  S.cam = new THREE.PerspectiveCamera(2 * Math.atan(Math.tan(fovH / 2) / aspect) * 180 / Math.PI, aspect, 0.02, 20);
  S.cam.up.set(0, 0, 1); S.cam.position.fromArray(m.cam); S.cam.lookAt(new THREE.Vector3().fromArray(m.aim));
  restPose();
  // light: the sun through the right-wall window (elevation 20 deg, azimuth -20 deg: index.html's SUN_D), warm; the room's bounce as fill
  const sun = new THREE.Vector3(Math.cos(0.349) * Math.cos(-0.349), -Math.cos(0.349) * Math.sin(-0.349), Math.sin(0.349)).normalize();
  const LG = CFG.lights;
  S.renderer.toneMappingExposure = LG.exposure;
  const tinted = (hex) => { const c = new THREE.Color(hex), t = LG.tint || [1, 1, 1]; c.r *= t[0]; c.g *= t[1]; c.b *= t[2]; return c; }; S.tinted = tinted;
  const key = new THREE.DirectionalLight(tinted(0xfff1de), LG.key); S.key = key; S.sun = sun;
  key.position.copy(rest.pos).addScaledVector(sun, 1.6); key.target.position.copy(rest.pos); S.scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 0.2; key.shadow.camera.far = 4;
  key.shadow.camera.left = key.shadow.camera.bottom = -0.42; key.shadow.camera.right = key.shadow.camera.top = 0.42; key.shadow.bias = -0.0003; key.shadow.radius = 3;
  S.scene.add(key);
  const hemi = new THREE.HemisphereLight(tinted(LG.sky), tinted(LG.ground), LG.hemi); S.scene.add(hemi); S.hemi = hemi;
  S.scene.environment = roomEnvironment();
  const fill = new THREE.DirectionalLight(tinted(0xffe6d0), LG.fill); fill.position.copy(rest.pos).add(new THREE.Vector3(-0.7, -0.8, 0.9)); fill.target.position.copy(rest.pos); S.scene.add(fill, fill.target); S.fill = fill;
  const read = new THREE.DirectionalLight(tinted(0xfff6ea), 0.0); S.read = read; S.scene.add(read, read.target);
  const rim = new THREE.DirectionalLight(tinted(0xfff3e4), LG.rim); rim.position.copy(rest.pos).add(new THREE.Vector3(0.2, 1.0, 0.3)); rim.target.position.copy(rest.pos); S.scene.add(rim, rim.target); S.rim = rim;
  // a shadow catcher on the table top under the Bible
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.ShadowMaterial({ opacity: LG.shadow, transparent: true, depthWrite: false }));
  sh.receiveShadow = true; sh.position.copy(rest.pos).addScaledVector(new THREE.Vector3(0, 0, 1), -0.0004); sh.quaternion.copy(rest.quat); S.scene.add(sh); S.shadow = sh;
  S.model = new THREE.Group(); S.scene.add(S.model);
}
function roomEnvironment() {
  // a small equirect of the room as the coat and the brass see it: warm walls, a paler ceiling, dark carpet, one bright window on the sun's side (as crucifix.js)
  const W = 256, Hh = 128, data = new Float32Array(W * Hh * 4);
  const key = S.key.position.clone().sub(S.key.target.position).normalize();
  const kaz = Math.atan2(key.y, key.x), kel = Math.asin(key.z);
  for (let j = 0; j < Hh; j++) {
    const el = (0.5 - j / Hh) * Math.PI;
    for (let i = 0; i < W; i++) {
      const az = (i / W - 0.5) * 2 * Math.PI;
      const up = Math.max(0, Math.sin(el)), dn = Math.max(0, -Math.sin(el));
      let r = 0.30 + 0.45 * up - 0.16 * dn, g = 0.22 + 0.40 * up - 0.12 * dn, b = 0.15 + 0.36 * up - 0.09 * dn;
      let d = Math.abs(az - kaz); d = Math.min(d, 2 * Math.PI - d);
      const win = Math.exp(-Math.pow(d / 0.42, 4)) * Math.exp(-Math.pow((el - kel + 0.05) / 0.30, 4));
      const sun = Math.exp(-Math.pow(d / 0.10, 2)) * Math.exp(-Math.pow((el - kel) / 0.08, 2));
      r += 3.2 * win + 5.0 * sun; g += 3.0 * win + 4.4 * sun; b += 2.6 * win + 3.6 * sun;
      const et = CFG.lights.envTint || [1, 1, 1];
      const k = (j * W + i) * 4; data[k] = r * et[0]; data[k + 1] = g * et[1]; data[k + 2] = b * et[2]; data[k + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.FloatType); tex.mapping = THREE.EquirectangularReflectionMapping; tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(S.renderer); const env = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose();
  return env;
}
function resize() {
  const w = S.canvas.clientWidth, h = S.canvas.clientHeight; if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio || 1, PHONE ? 2.5 : 1.5);
  if (S.canvas.width !== Math.round(w * dpr) || S.canvas.height !== Math.round(h * dpr)) { S.renderer.setPixelRatio(dpr); S.renderer.setSize(w, h, false); }
  const fr = S.meta.framing(), FW = S.meta.res[0], FH = S.meta.res[1];
  const ox = (fr.fc[0] - fr.vc[0] * fr.sc[0]) * FW, oy = (1 - fr.fc[1] - (1 - fr.vc[1]) * fr.sc[1]) * FH;
  S.cam.setViewOffset(FW, FH, ox, oy, fr.sc[0] * FW, fr.sc[1] * FH);
}

// ---------- the leaves ----------
// Each leaf is a grid hinged at the spine (x = XS) that turns about the spine's y axis from the right stack (theta 0) to the
// left stack (theta pi). While it turns it bows: the fore-edge leads, the near (tail) corner most of all, and it lays down
// from the corner in like a real leaf. Two meshes share each grid: the recto (front side) and the verso (back side, u mirrored).
// The rows (y) and, per row, the span of the leaf along x: a chamfer of CFG.chamfer cuts each corner at 45 deg (round 4 note 6), so the
// first and last rows are exactly one chamfer high and the rows between share the rest. u (the art) follows the true distance from the spine.
function rowY(j) { const c = Math.min(CFG.chamfer || 0, H / 2 - 0.001); if (!c) return -H / 2 + H * j / NY; if (j === 0) return -H / 2; if (j === NY) return H / 2; return -H / 2 + c + (H - 2 * c) * (j - 1) / (NY - 2); }
function rowSpan(y) { const c = CFG.chamfer || 0, cut = Math.max(0, c - (H / 2 - Math.abs(y))); return [cut, L - cut]; }   // [s0, s1] along the leaf from the spine
function leafGeometry() {
  const geo = new THREE.BufferGeometry(); const n = (NX + 1) * (NY + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), uv2 = new Float32Array(n * 2), idx = [];
  for (let j = 0; j <= NY; j++) { const [s0, s1] = rowSpan(rowY(j)); for (let i = 0; i <= NX; i++) { const k = j * (NX + 1) + i, u = (s0 + (s1 - s0) * i / NX) / L; uv[k * 2] = u; uv[k * 2 + 1] = 1 - j / NY; uv2[k * 2] = 1 - u; uv2[k * 2 + 1] = 1 - j / NY; } }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, c, b, d, c); }   // wound so the recto faces +z (up out of the book)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const back = geo.clone(); back.setAttribute('uv', new THREE.BufferAttribute(uv2, 2)); back.setAttribute('position', geo.attributes.position);   // shared positions
  return { geo, back };
}
const FINE = NX * 2, curveX = new Float64Array(FINE + 1), curveZ = new Float64Array(FINE + 1);
function shapeLeaf(leaf, theta, z0) {
  const P = leaf.geo.attributes.position.array; const bend = (CFG.card ? 0.35 : 1.15) * Math.sin(theta) * (theta < Math.PI / 2 ? 1 : 0.8);   // card leaves (the album) stay nearly flat
  const ds = L / FINE;
  for (let j = 0; j <= NY; j++) {
    const y = rowY(j), lead = 1 + 0.35 * (0.5 - j / NY);         // the tail corner leads
    let x = XS, z = z0;                                          // the row's curve from the spine, at a fine step; the vertices sample it
    for (let i = 0; i <= FINE; i++) {
      curveX[i] = x; curveZ[i] = z;
      const s1 = (i + 0.5) / FINE; let phi = theta + bend * lead * s1; phi = Math.max(0, Math.min(Math.PI, phi));
      x += Math.cos(phi) * ds; z += Math.sin(phi) * ds;
    }
    const [sa, sb] = rowSpan(y);
    for (let i = 0; i <= NX; i++) {
      const sIdx = (sa + (sb - sa) * i / NX) / ds, i0 = Math.min(FINE - 1, Math.floor(sIdx)), f = sIdx - i0;
      const k = (j * (NX + 1) + i) * 3; P[k] = curveX[i0] + (curveX[i0 + 1] - curveX[i0]) * f; P[k + 1] = y; P[k + 2] = curveZ[i0] + (curveZ[i0 + 1] - curveZ[i0]) * f;
    }
  }
  leaf.geo.attributes.position.needsUpdate = true; leaf.geo.computeVertexNormals();
  if (leaf.back.attributes.normal !== leaf.geo.attributes.normal) leaf.back.setAttribute('normal', leaf.geo.attributes.normal);
  leaf.geo.computeBoundingSphere(); leaf.back.boundingSphere = leaf.geo.boundingSphere;
}
function creamCanvas(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = CFG.paper; c.fillRect(0, 0, w, h);
  const img = c.getImageData(0, 0, w, h), d = img.data;              // a little paper grain
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
  c.putImageData(img, 0, 0); return cv;
}
function pageTexture(cv) { const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; }
function leafMaterial(tex) { return new THREE.MeshStandardMaterial({ map: tex, color: 0xfffaf0, roughness: 0.93, metalness: 0, envMapIntensity: 0.15 }); }
function buildLeaves() {
  const ch = 1440,   /* phones too (10-01): the 720 px pages read blurry once a page fills the screen */ cw = Math.round(ch * L / H);
  const blank = pageTexture(creamCanvas(S.small ? 256 : 512, Math.round((S.small ? 256 : 512) * H / L))); S.blank = blank;
  LEAVES.forEach((names, k) => {
    const g = leafGeometry(); const leaf = { k, geo: g.geo, back: g.back, theta: k < 0 ? Math.PI : 0, side: 'right', front: null, backMesh: null, names, cw, ch, iw: 0, ih: 0, img: [null, null], tex: [null, null] };
    leaf.front = new THREE.Mesh(g.geo, leafMaterial(blank)); leaf.front.material.side = THREE.FrontSide; leaf.front.castShadow = true; leaf.front.receiveShadow = true;
    leaf.backMesh = new THREE.Mesh(g.back, leafMaterial(blank)); leaf.backMesh.material.side = THREE.BackSide; leaf.backMesh.receiveShadow = true;
    leaf.front.userData.leaf = leaf; leaf.backMesh.userData.leaf = leaf; leaf.front.userData.face = 'recto'; leaf.backMesh.userData.face = 'verso';
    S.model.add(leaf.front, leaf.backMesh); S.leaves.push(leaf);
    shapeLeaf(leaf, 0, ZT + 0.0003 + LEAF_DZ * (LEAVES.length - 1 - k));
  });
}
// The page art: every face's JPEG is fetched when the close-up opens, but a leaf's textures (1440 px tall on desktop, ~10 MB each on
// the GPU) exist only while the leaf is within PAGE_WIN leaves of the opening (round 4: the album has 16 leaves / 30 faces; all at
// once would be ~300 MB). updatePageTex() runs every frame and builds at most one texture a frame, two leaves ahead of the reader.
const PAGE_WIN = 2;
function loadPages() {
  if (S.pagesLoaded) return; S.pagesLoaded = true;
  const base = 'frames/';
  for (const leaf of S.leaves) for (const [fi, name] of [[0, leaf.names[0]], [1, leaf.names[1]]]) {
    if (!name) continue;
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { leaf.img[fi] = im; if (fi === 0) { leaf.iw = Math.round(im.naturalWidth * leaf.ch / im.naturalHeight); leaf.mx = Math.round((leaf.cw - leaf.iw) / 2); } };
    im.src = base + name + '.jpg';
  }
}
function leafTexture(leaf, fi) {
  // the leaf is a little wider than the page art (0.79 vs 0.7): the art sits centred on a cream leaf, the margins in the art's own paper colour
  const im = leaf.img[fi]; const cv = document.createElement('canvas'); cv.width = leaf.cw; cv.height = leaf.ch; const c = cv.getContext('2d');
  const ih = leaf.ch, iw = Math.round(im.naturalWidth * ih / im.naturalHeight), mx = Math.round((leaf.cw - iw) / 2);
  c.drawImage(im, mx, 0, iw, ih);
  const px = c.getImageData(mx + 3, 3, 1, 1).data; c.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`; c.fillRect(0, 0, mx, ih); c.fillRect(mx + iw, 0, leaf.cw - mx - iw, ih);
  return pageTexture(cv);
}
function updatePageTex(all) {
  let n = turnedCount(); for (const t of S.turning) if (t.dir > 0 && t.leaf.theta <= 1) n = Math.max(n, t.leaf.k + 1);   // the opening: between leaf n-1 (left) and n (right)
  let built = 0;
  for (const leaf of S.leaves) {
    const near = all || (leaf.k >= n - 1 - PAGE_WIN && leaf.k <= n + PAGE_WIN);
    for (let fi = 0; fi < 2; fi++) {
      const mesh = fi === 0 ? leaf.front : leaf.backMesh;
      if (near && leaf.img[fi] && !leaf.tex[fi] && built < 1) { leaf.tex[fi] = leafTexture(leaf, fi); mesh.material.map = leaf.tex[fi]; mesh.material.needsUpdate = true; built++; }
      else if (!near && leaf.tex[fi]) { leaf.tex[fi].dispose(); leaf.tex[fi] = null; mesh.material.map = S.blank; mesh.material.needsUpdate = true; }
    }
  }
}
// leaf turns: `turning` holds { leaf, t0, dur, dir } (dir +1 right -> left, -1 back)
function startTurn(leaf, dir, dur, now, snd) {
  if (S.turning.some(t => t.leaf === leaf)) return;
  S.turning.push({ leaf, t0: now, dur, dir, from: leaf.theta });
  // round 5 note 2: one recorded turn per leaf, its transient on the vertical (half-way through the ease); `now` may be a little
  // ahead of the clock for the staggered fall-back, so the sound waits the same; the album (sound: null) is silent
  if (snd && CFG.sound && window.pageSnd) window.pageSnd.turn(Math.max(0, now - performance.now() / 1000), dur);
}
function stackZ(leaf) { return ZT + 0.0003 + LEAF_DZ * (leaf.theta > 1 ? leaf.k : (LEAVES.length - 1 - leaf.k)); }
// a turning leaf's height at the spine: its place on the right stack while it rises off it, its place on the left stack as it lays down there
// (blended while it stands upright, where the shift cannot be seen). Round 4 note 2: it used to turn at mid-stack height, so for the first
// frames the leaves still above that height drew over it (the next spread's prints popped through the page about to turn).
function turnZ(leaf, theta) {
  const zr = ZT + 0.0003 + LEAF_DZ * (LEAVES.length - 1 - leaf.k), zl = ZT + 0.0003 + LEAF_DZ * leaf.k;
  const u = Math.max(0, Math.min(1, (theta - 0.35 * Math.PI) / (0.3 * Math.PI))), e = u * u * (3 - 2 * u);
  return zr + (zl - zr) * e + 0.00012;
}
function updateLeaves(now) {
  for (let i = S.turning.length - 1; i >= 0; i--) {
    const tr = S.turning[i], k = Math.max(0, Math.min(1, (now - tr.t0) / tr.dur)), e = easeQuad(k);
    tr.leaf.theta = tr.dir > 0 ? tr.from + (Math.PI - tr.from) * e : tr.from * (1 - e);
    shapeLeaf(tr.leaf, tr.leaf.theta, turnZ(tr.leaf, tr.leaf.theta));
    if (k >= 1) { tr.leaf.theta = tr.dir > 0 ? Math.PI : 0; shapeLeaf(tr.leaf, tr.leaf.theta, stackZ(tr.leaf)); S.turning.splice(i, 1); }
  }
}
function turnedCount() { return S.leaves.filter(l => l.theta > 1).length; }

// ---------- pose and frame ----------
function frame(now) { S.raf = requestAnimationFrame(frame); tick(now); }
function tick(now) {
  if (!S.ready || !S.visible) return;
  resize(); updatePageTex(false);
  const t = now / 1000;
  // the lift p: 0 on the table, 1 in front of the camera; the cover angle; the open blend
  if (S.state === 'lifting' || S.state === 'opening' || S.state === 'leafing' || S.state === 'open') { const k = Math.min(1, (t - S.tLift) / LIFT_S); S.p = S.p0 + (1 - S.p0) * easeOut(k); }
  if (S.state === 'lifting' && t - S.tLift >= 0.5 * LIFT_S) { S.state = 'opening'; S.t0 = t; if (CFG.sound && window.pageSnd) window.pageSnd.cover(true, 0.05, OPEN_S); emit(); }
  if (S.state === 'opening') {
    const k = Math.min(1, (t - S.t0) / OPEN_S), e = easeInOut(k); S.cover = -Math.PI * e; S.open = e;
    if (k >= 1) { S.state = 'leafing'; S.t0 = t; S.runT = -RUN_DELAY; S.queue = S.leaves.slice(0, BIO_LEAF).map((l, i) => ({ leaf: l, at: t + RUN_DELAY + i * TURN_GAP })); emit(); }
  }
  if (S.state === 'leafing') {
    while (S.queue.length && t >= S.queue[0].at) { const q = S.queue.shift(); startTurn(q.leaf, 1, TURN_S, t, true); }
    if (!S.queue.length && !S.turning.length) { S.state = 'open'; emit(); }
  }
  if (S.state === 'closing') {
    // the turned leaves fall back (staggered), then the board closes, then the drop
    if (S.closeStep === 0) { S.turning = []; const turned = S.leaves.filter(l => l.theta > 0.001); turned.reverse().forEach((l, i) => startTurn(l, -1, BACK_TURN_S, t + i * 0.06, i === 0)); S.closeStep = 1; S.t0 = t; }
    if (S.closeStep === 1 && !S.turning.length && t - S.t0 > 0.05) { S.closeStep = 2; S.t0 = t; S.openAt = S.open; if (CFG.sound && window.pageSnd) window.pageSnd.cover(false, 0, CLOSE_S * S.openAt); }
    if (S.closeStep === 2) { const k = Math.min(1, (t - S.t0) / (CLOSE_S * Math.max(0.05, S.openAt))), e = easeInOut(k); S.cover = -Math.PI * S.openAt * (1 - e); S.open = S.openAt * (1 - e);   // QA v26: from however far it had opened (Esc mid-opening used to snap the board wide first)
      if (k >= 1) { S.closeStep = 3; S.state = 'returning'; S.p0 = S.p; S.t0 = t; emit(); } }
  }
  if (S.state === 'returning') { const k = Math.min(1, (t - S.t0) / DROP_S); S.p = S.p0 * (1 - k * k * (0.55 + 0.45 * k));   // eases in and lands at speed: the rendered still takes over on the landing frame, under motion (round 4 note 4)
    if (k >= 1) { S.state = 'rest'; S.p = 0; if (CFG.sound && window.pageSnd && window.pageSnd.drop) window.pageSnd.drop(0); emit(); } }
  updateLeaves(t);
  if (S.hinge) S.hinge.rotation.set(0, S.cover, 0);
  // the pose: rest -> closed face pose by p, closed -> open by the open blend; a breath of movement while it is held open
  const cp = closedPose(), op = openPose();
  const face = { pos: cp.pos.clone().lerp(op.pos, S.open), quat: cp.quat.clone().slerp(op.quat, S.open) };
  const p = S.p;
  const pos = rest.pos.clone().lerp(face.pos, p); pos.z += 0.08 * Math.sin(Math.PI * p);        // a small arc up off the table
  const q = rest.quat.clone().slerp(face.quat, p);
  if (S.state === 'open' || S.state === 'leafing') {
    const { r, u } = camBasis(); const a = 0.004 * Math.sin(t * 0.7) * S.open, b = 0.003 * Math.sin(t * 0.47 + 1.3) * S.open;
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(u, a)).premultiply(new THREE.Quaternion().setFromAxisAngle(r, b));
  }
  S.model.position.copy(pos); S.model.quaternion.copy(q);
  S.key.target.position.copy(pos); S.key.position.copy(pos).addScaledVector(S.sun, 1.6);
  { const { c, f, r, u } = camBasis(); S.read.target.position.copy(pos); S.read.position.copy(pos).addScaledVector(f, -1.2).addScaledVector(r, 0.5).addScaledVector(u, 0.9); S.read.intensity = 1.3 * S.open * p; }   // (1.3: the pages keep their cream at exposure 0.9)
  S.shadow.material.opacity = CFG.lights.shadow * Math.max(0, 1 - p * 2.5);
  S.renderer.render(S.scene, S.cam);
}

// ---------- pointer: links on the bio page, leafing back and forth, page focus on a phone ----------
let ray = null, ptr = null;
function pick(e) {
  if (!S.ready || S.state !== 'open') return null;
  const r = S.canvas.getBoundingClientRect(); ptr = ptr || new THREE.Vector2(); ray = ray || new THREE.Raycaster();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, S.cam);
  const meshes = []; for (const l of S.leaves) meshes.push(l.front, l.backMesh);
  const hits = ray.intersectObjects(meshes, false); if (!hits.length) return null;
  const h = hits[0], leaf = h.object.userData.leaf, face = h.object.userData.face; const uv = h.uv;
  let link = null;
  if (S.boxes && leaf.iw && uv) {
    const fx = (uv.x * leaf.cw - leaf.mx) / leaf.iw, fy = uv.y;                            // fractions of the page art
    for (const ln of CFG.links) {
      if (ln.leaf !== leaf.k || ln.face !== face) continue;
      const b = S.boxes[ln.key]; if (b && fx >= b[0] - 0.01 && fx <= b[2] + 0.01 && fy >= b[1] - 0.008 && fy <= b[3] + 0.008) link = { key: ln.key, label: ln.label, url: S.urls[ln.key] };
    }
  }
  const side = leaf.theta > 1 ? 'left' : 'right';
  return { leaf, face, side, link, fx: uv && leaf.iw ? (uv.x * leaf.cw - leaf.mx) / leaf.iw : null, fy: uv && uv.y };
}
function onMove(e) {
  const h = pick(e); const label = h && h.link ? h.link.label : null;
  S.canvas.style.cursor = h ? 'pointer' : '';
  if (S.meta.onHover) S.meta.onHover(label, e.clientX, e.clientY);
  e.stopPropagation();   // the stage's own hover handling (the close-up hotspots) must not clear the tip
}
function onClick(e) {
  const h = pick(e); if (!h) return; e.stopPropagation();
  if (h.link && h.link.url) { window.open(h.link.url, '_blank', 'noopener'); return; }
  if (h.link && S.meta.onLink) { S.meta.onLink(h.link.key); return; }                   // no url: the page handles it (the poster sheet)
  const portrait = S.canvas.clientWidth < S.canvas.clientHeight;
  if (portrait) { S.focus = S.focus === 0 ? (h.side === 'left' ? -1 : 1) : 0; return; }   // a phone: tap a page to read it, tap again for both pages; the strip's buttons turn the leaves
  API.turn(h.side === 'left' ? -1 : 1);
}

const API = {
  get state() { return S.state; },
  get ready() { return S.ready; },
  get failed() { return S.failed; },
  get turned() { return turnedCount(); },
  get leaves() { return S.leaves.length; },
  get visible() { return S.visible && S.ready; },      // index.html composites the canvas while this is true
  get cfg() { return CFG; },
  /** canvasEl: the #bible3d / #album3d canvas; meta: { cam, aim, lens, res: [w, h], framing: () => ({ sc, fc, vc }), rest, boxes, urls, small, onState, onHover };
   *  over: config overrides from frames/album.json (glb, rest, hinge, block { xs, xf, h, zt }, pages [names], closed/open poses) */
  mount(canvasEl, meta, over) {
    if (over) { for (const k of ['glb', 'hinge', 'block', 'closed', 'open', 'links', 'stopAt', 'chamfer', 'lights', 'sound']) if (over[k] !== undefined) CFG[k] = over[k];
      if (over.rest) CFG.rest = over.rest; if (over.leaves) { LEAVES = over.leaves.map(l => l.slice()); CFG.leaves = LEAVES; }   // [[recto, verso], ...] as CFG.leaves
      XS = CFG.block.xs; XF = CFG.block.xf; H = CFG.block.h; ZT = CFG.block.zt; L = XF - XS; BIO_LEAF = Math.min(CFG.stopAt, LEAVES.length - 1); }
    // round 5: the Bible's leaf order comes with its page art (frames/bible_pages.json `leaves`, [[recto, verso], ...]) when the json carries it
    if (!(over && over.leaves) && meta.boxes && Array.isArray(meta.boxes.leaves) && meta.boxes.leaves.length && !S.ready) { LEAVES = meta.boxes.leaves.map(l => l.slice()); CFG.leaves = LEAVES; BIO_LEAF = Math.min(CFG.stopAt, LEAVES.length - 1); }
    setLeafDZ();
    if (!meta.rest) meta.rest = CFG.rest;
    S.canvas = canvasEl; S.meta = meta; S.onState = meta.onState || null; S.visible = false; S.state = 'rest'; S.p = 0; S.cover = 0; S.open = 0; S.turning = []; S.queue = [];
    S.small = !!meta.small; S.boxes = meta.boxes || null; S.urls = meta.urls || {}; S.focus = 0; S.closeStep = 0;
    canvasEl.hidden = true; canvasEl.classList.remove('on', 'live');
    if (!S.renderer) { canvasEl.addEventListener('pointermove', onMove); canvasEl.addEventListener('click', onClick); canvasEl.addEventListener('pointerleave', () => { if (S.meta.onHover) S.meta.onHover(null); }); }
    if (!S.raf) S.raf = requestAnimationFrame(frame);
    if (window.pageSnd && CFG.sound && window.pageSnd.load) window.pageSnd.load();   // the recorded page turns decode while the hub is still (needs the audio context: a no-op before the first gesture, retried at the first turn)
    if (S.ready) { for (const l of S.leaves) { l.theta = 0; shapeLeaf(l, 0, stackZ(l)); } if (S.hinge) S.hinge.rotation.set(0, 0, 0); loadPages(); return Promise.resolve(true); }
    if (S.loading) return S.loading;   // QA v26: mounted again while the glb is still on its way (the hub left and re-entered fast): one model, not two stacked
    return (S.loading = loadThree().then(() => { if (!S.renderer) setup(); return loadGLB(GLB_URL()).catch(err => { if (!CFG.fallbackGlb) throw err; S.standIn = true; return loadGLB(CFG.fallbackGlb); }); }).then(({ root, named }) => {
      S.model.add(root); S.hinge = named[CFG.hinge] || (CFG.fallbackHinge && named[CFG.fallbackHinge]) || null; buildLeaves(); loadPages(); S.ready = true; S.loading = null; return true;
    }).catch(err => { S.failed = true; S.loading = null; console.warn(CFG.name + ': not available', err); throw err; }));
  },
  get standIn() { return !!S.standIn; },                   // true while the album is drawn with bible.glb (album.glb not landed yet)
  show() { S.visible = true; if (S.canvas) { S.canvas.hidden = false; S.canvas.classList.add('on'); } tick(performance.now()); },   // drawn at once: the page swaps its still to the empty plate this same frame
  hide() { S.visible = false; if (S.canvas) { S.canvas.classList.remove('on', 'live'); S.canvas.hidden = true; } },   // QA v26: out of the DOM too (it was left at opacity 0)
  /** the Bible rises, turns to the camera, opens and leafs through to the bio spread */
  lift() {
    if (!S.ready || S.state !== 'rest') return false;
    if (CFG.sound && window.pageSnd && window.pageSnd.load) window.pageSnd.load();   // round 5: the click is the gesture the audio context needs; the slices are decoded before the first leaf turns
    API.show(); S.state = 'lifting'; S.p0 = S.p; S.tLift = S.t0 = performance.now() / 1000; S.canvas.classList.add('live'); emit(); return true;
  },
  /** everything falls back: leaves, board, then the Bible onto the table; ends in 'rest' */
  release() {
    if (S.state === 'rest' || S.state === 'closing' || S.state === 'returning') return false;
    S.queue = []; S.canvas.classList.remove('live'); S.canvas.style.cursor = ''; if (S.meta.onHover) S.meta.onHover(null);
    S.state = 'closing'; S.closeStep = 0; S.t0 = performance.now() / 1000; emit(); return true;
  },
  /** turn one leaf forward (+1) or back (-1) while the Bible is open */
  turn(dir) {
    if (S.state !== 'open') return false; const now = performance.now() / 1000; if (S.meta.onHover) S.meta.onHover(null);
    if (dir > 0) { const l = S.leaves.find(x => x.theta < 1 && !S.turning.some(t => t.leaf === x)); if (!l || l.k === LEAVES.length - 1) return false; startTurn(l, 1, CFG.hand_turn_s, now, true); return true; }
    const turned = S.leaves.filter(x => x.theta > 1 && !S.turning.some(t => t.leaf === x)); const l = turned[turned.length - 1]; if (!l) return false;
    startTurn(l, -1, CFG.hand_turn_s, now, true); return true;
  },
  focus(side) { S.focus = side; },
  debugLights() { return { key: [S.key.intensity, S.key.color.getHexString()], hemi: [S.hemi.intensity, S.hemi.color.getHexString(), S.hemi.groundColor.getHexString()], fill: [S.fill.intensity, S.fill.color.getHexString()], rim: [S.rim.intensity, S.rim.color.getHexString()], exp: S.renderer.toneMappingExposure, env: S.coverMats.map(m => m.envMapIntensity), vis: S.visible, state: S.state }; },
  /** apply light settings (a partial CFG.lights) to the live scene: used to tune the match against the rendered still (round 4 note 4) */
  relight(o) {
    Object.assign(CFG.lights, o || {}); const LG = CFG.lights; if (!S.renderer) return false;
    S.renderer.toneMappingExposure = LG.exposure; S.key.intensity = LG.key; S.key.color.copy(S.tinted(0xfff1de)); S.hemi.color.copy(S.tinted(LG.sky)); S.hemi.groundColor.copy(S.tinted(LG.ground)); S.hemi.intensity = LG.hemi;
    S.fill.intensity = LG.fill; S.fill.color.copy(S.tinted(0xffe6d0)); S.rim.intensity = LG.rim; S.rim.color.copy(S.tinted(0xfff3e4)); S.read.color.copy(S.tinted(0xfff6ea)); for (const m of S.coverMats) m.envMapIntensity = LG.env;
    if (o && o.envTint) { const old = S.scene.environment; S.scene.environment = roomEnvironment(); if (old) old.dispose(); }
    if (o && o.coverTint) for (const m of S.coverMats) { const b = m.userData.base, ct = LG.coverTint; m.color.setRGB(b[0] * ct[0], b[1] * ct[1], b[2] * ct[2]); }
    if (S.visible) tick(performance.now()); return true;
  },
  pickAt(x, y) { const h = pick({ clientX: x, clientY: y }); return h && { k: h.leaf.k, face: h.face, side: h.side, link: h.link && h.link.key, fx: h.fx, fy: h.fy }; },   // QA
  /** QA: jump to a pose without the animation. o = { p (0..1 lift), open (0..1), turned (leaves on the left), theta (deg of the next leaf, mid-turn) } */
  pose(o) {
    if (!S.ready) return false; API.show(); S.turning = []; S.queue = [];
    S.p = o.p ?? 1; S.open = o.open ?? 1; S.cover = -Math.PI * S.open; S.state = o.state || (S.open >= 1 && S.p >= 1 ? 'open' : 'posed'); S.tLift = performance.now() / 1000 - LIFT_S; S.p0 = 0;   // 'posed' = held still, nothing animates
    const n = o.turned ?? 0; S.leaves.forEach((l, k) => { l.theta = k < n ? Math.PI : 0; shapeLeaf(l, l.theta, stackZ(l)); });
    if (o.theta !== undefined && n < S.leaves.length) { const l = S.leaves[n]; l.theta = o.theta * Math.PI / 180; shapeLeaf(l, l.theta, turnZ(l, l.theta)); }
    if (S.state === 'open') S.canvas.classList.add('live');
    for (let i = 0; i < 2 * (2 * PAGE_WIN + 3); i++) updatePageTex(false);   // every texture of the window now (QA stills)
    tick(performance.now()); return true;
  },
  unmount() {
    S.visible = false; S.state = 'rest'; S.p = 0; S.cover = 0; S.open = 0; S.turning = []; S.queue = [];
    if (S.ready) { for (const l of S.leaves) l.theta = 0; updatePageTex(false); }   // keeps only the first leaves' textures
    if (S.canvas) { S.canvas.classList.remove('on', 'live'); S.canvas.hidden = true; S.canvas.style.cursor = ''; }
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    if (S.renderer) S.renderer.clear();
  },
};
return API;
}
window.bible = makeBook(BIBLE_CFG);
window.makeBook = makeBook; window.BIBLE_CFG = BIBLE_CFG;   // album.js builds the photo album from the same viewer
})();
