// The crucifix, live in the browser (thread D). Loaded by index.html only when the case close-up opens.
// Draws frames/crucifix.glb (the walnut cross with its INRI plaque, scene/crucifix3d.py) with Three.js on a transparent
// canvas (#crux3d) laid over the page's WebGL canvas, with a camera that reproduces the Blender close-up camera
// (closeups.json c_case: 30 mm lens on a 36 mm sensor, 1920x1200 frame) and the page's framing (cover / portrait band),
// so the model rests exactly where the rendered cross lies in the case. States: resting -> lift (1.2 s, rises toward the
// camera and turns to face it, ~80% of the frame height) -> drag turns it as one piece, +-90 deg, easing back on release
// -> release() reverses the lift.
// window.crux = { mount(canvasEl, meta), show(), hide(), lift(), release(), unmount(), get state() }
(() => {
'use strict';
const THREE_URL = window.CRUX_THREE_URL || new URL('vendor/three.module.min.js', location.href).href;   // shipped with the site (MIT, vendor/three-LICENSE.txt)
const GLB_URL = window.CRUX_GLB_URL || 'frames/crucifix.glb';   // the review host can't serve .glb, so it also ships as crucifix.glb.wasm (same bytes)
const LIFT_S = 1.2, RETURN_S = 1.1, SNAP_S = 0.6, FILL = 0.8;
let THREE = null, loading = null;
function loadThree() { return loading || (loading = import(THREE_URL).then(m => (THREE = m))); }

// ---------- a small GLB reader: meshes, materials, embedded images; no skins, animations or extensions ----------
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
    const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    return bmp;
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
    const p = m.pbrMetallicRoughness || {}; const c = p.baseColorFactor || [1, 1, 1, 1];
    const ext = m.extensions || {}; const cc = ext.KHR_materials_clearcoat || null, an = ext.KHR_materials_anisotropy || null;
    const side = m.doubleSided ? THREE.DoubleSide : THREE.FrontSide; const name = m.name || '';
    let mat;
    if (/iron|brass/.test(name)) {
      // the plaque's brad: plain metal
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), metalness: p.metallicFactor ?? 1, roughness: p.roughnessFactor ?? 1, side, envMapIntensity: 1.0 });
    } else {
      // the walnut (PHASE2.md "Crucifix - cross only, real wood"): the glb's baseColor, roughness and normal maps under a satin
      // clearcoat (KHR_materials_clearcoat, as Cycles renders it), with the sheen drawn out along the grain (KHR_materials_anisotropy;
      // the atlas's u runs along every beam, which is the tangent Three.js derives from the UVs). The end grain has no anisotropy.
      const wood = /wood/.test(name), end = /_end/.test(name);
      mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(c[0], c[1], c[2]), metalness: p.metallicFactor ?? (p.metallicRoughnessTexture ? 1 : 0), roughness: p.roughnessFactor ?? 1, side,
        clearcoat: cc ? (cc.clearcoatFactor ?? 0) : (wood ? 0.4 : 0), clearcoatRoughness: cc ? (cc.clearcoatRoughnessFactor ?? 0.2) : 0.2,
        anisotropy: an ? (an.anisotropyStrength ?? 0) : (wood && !end ? 0.35 : 0), anisotropyRotation: an ? (an.anisotropyRotation ?? 0) : 0,
        specularIntensity: 0.7, envMapIntensity: 0.22 });
      if (wood) mat.color.setRGB(1.025, 0.875, 0.53);     // matched to the Cycles flight frame (round 3 note 6: mean RGB of the cross region within ~2 %, measured headless with __case.holdFrame)
    }
    if (p.metallicRoughnessTexture) { const t = texture(p.metallicRoughnessTexture.index, false); mat.metalnessMap = t; mat.roughnessMap = t; }
    if (m.normalTexture) { mat.normalMap = texture(m.normalTexture.index, false); const sc = m.normalTexture.scale ?? 1; mat.normalScale = new THREE.Vector2(sc, -sc); }   // glTF's flipped V, as GLTFLoader does
    if (p.baseColorTexture) mat.map = texture(p.baseColorTexture.index, true);
    return mat;
  });
  const root = new THREE.Group();
  const nodes = json.scenes[json.scene || 0].nodes;
  const addNode = (ni, parent) => {
    const nd = json.nodes[ni]; const g = new THREE.Group(); g.name = nd.name || '';
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
    }
    parent.add(g); (nd.children || []).forEach(c => addNode(c, g));
  };
  nodes.forEach(n => addNode(n, root));
  return root;
}

// ---------- the scene ----------
const S = { canvas: null, meta: null, renderer: null, scene: null, cam: null, model: null, shadow: null, key: null, raf: 0, ready: false, failed: false,
            state: 'rest', p: 0, p0: 0, t0: 0, from: null, yaw: 0, pitch: 0, drag: null, snap: null, visible: false, onState: null };
const rest = { pos: null, quat: null, up: null };
function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

function restPose() {
  // hero.py: grouped(attache, (1.95, 3.7, 0.48), 5) and, inside the case, grouped(crucifix, (0.0, -0.01, z + 0.002), 58) with z = 0.008 + 0.004 + 10 * 0.004
  const M = new THREE.Matrix4().makeTranslation(1.95, 3.7, 0.48).multiply(new THREE.Matrix4().makeRotationZ(5 * Math.PI / 180))
    .multiply(new THREE.Matrix4().makeTranslation(0.0, -0.01, 0.054)).multiply(new THREE.Matrix4().makeRotationZ(58 * Math.PI / 180));
  rest.pos = new THREE.Vector3(); rest.quat = new THREE.Quaternion(); M.decompose(rest.pos, rest.quat, new THREE.Vector3());
}
function camBasis() {
  const m = S.meta; const c = new THREE.Vector3().fromArray(m.cam), a = new THREE.Vector3().fromArray(m.aim);
  const f = a.clone().sub(c).normalize(); const r = f.clone().cross(new THREE.Vector3(0, 0, 1)).normalize(); const u = r.clone().cross(f);
  return { c, f, r, u };
}
function facePose() {
  // the crucifix turned to the camera, its head up the frame, filling FILL of the visible height (and fitting the visible width)
  const { c, f, r, u } = camBasis(); const fr = S.meta.framing();
  const fovH = 2 * Math.atan(18 / S.meta.lens), aspect = S.meta.res[0] / S.meta.res[1];
  const tanV = Math.tan(fovH / 2) / aspect, tanH = Math.tan(fovH / 2);
  const dV = 0.30 / (FILL * fr.sc[1] * 2 * tanV), dH = 0.19 / (0.92 * fr.sc[0] * 2 * tanH);
  const d = Math.max(dV, dH);
  // aim at the visible centre of the frame (portrait shows a band of the image; keep it in the middle of the screen)
  const cx = (fr.fc[0] + (0.5 - fr.vc[0]) * fr.sc[0]) - 0.5, cy = (fr.fc[1] + (0.5 - fr.vc[1]) * fr.sc[1]) - 0.5 + 0.045 * fr.sc[1];   // a touch above centre: the caption sits at the bottom
  const pos = c.clone().addScaledVector(f, d).addScaledVector(r, cx * 2 * tanH * d).addScaledVector(u, cy * 2 * tanV * d);
  const R = new THREE.Matrix4().makeBasis(r, u, f.clone().negate());
  const q = new THREE.Quaternion().setFromRotationMatrix(R);
  pos.addScaledVector(f, 0.0075);   // the cross's origin is its back face; centre its 15 mm thickness on the aim point
  return { pos, quat: q, r, u };
}
function setup() {
  const m = S.meta;
  S.renderer = new THREE.WebGLRenderer({ canvas: S.canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });   // preserved: index.html reads this canvas each frame and composites it under its film pass (round 3 note 6)
  S.renderer.setClearColor(0x000000, 0); S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.05;
  S.renderer.shadowMap.enabled = true; S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.scene = new THREE.Scene();
  const fovH = 2 * Math.atan(18 / m.lens), aspect = m.res[0] / m.res[1];
  S.cam = new THREE.PerspectiveCamera(2 * Math.atan(Math.tan(fovH / 2) / aspect) * 180 / Math.PI, aspect, 0.02, 20);
  S.cam.up.set(0, 0, 1); S.cam.position.fromArray(m.cam); S.cam.lookAt(new THREE.Vector3().fromArray(m.aim));
  restPose();
  // light: the sun through the window (up and to the right of this camera, warm), the room's bounce as a soft warm fill
  const key = new THREE.DirectionalLight(0xfff09a, 0.85); S.key = key;
  key.position.copy(rest.pos).add(new THREE.Vector3(0.9, 0.45, 0.75)); key.target.position.copy(rest.pos); S.scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 0.2; key.shadow.camera.far = 3;
  key.shadow.camera.left = key.shadow.camera.bottom = -0.3; key.shadow.camera.right = key.shadow.camera.top = 0.3; key.shadow.bias = -0.0004; key.shadow.radius = 3;
  S.scene.add(key);
  const hemi = new THREE.HemisphereLight(0xf0dc8c, 0x7a5638, 0.32); S.scene.add(hemi);
  S.scene.environment = roomEnvironment();     // what the glossy plastic reflects: the bright window, warm walls, dark floor
  const fill = new THREE.DirectionalLight(0xffe996, 0.22); fill.position.copy(rest.pos).add(new THREE.Vector3(-0.6, -0.8, 0.9)); fill.target.position.copy(rest.pos); S.scene.add(fill, fill.target);
  const rim = new THREE.DirectionalLight(0xfff19c, 0.25); rim.position.copy(rest.pos).add(new THREE.Vector3(0.2, 1.0, -0.2)); rim.target.position.copy(rest.pos); S.scene.add(rim, rim.target);
  // a shadow catcher on the papers under the crucifix
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.ShadowMaterial({ opacity: 0.42, transparent: true, depthWrite: false }));
  sh.receiveShadow = true; sh.position.copy(rest.pos).addScaledVector(new THREE.Vector3(0, 0, 1), -0.0004); sh.quaternion.copy(rest.quat); S.scene.add(sh); S.shadow = sh;
  S.model = new THREE.Group(); S.scene.add(S.model);
}
function roomEnvironment() {
  // a small equirect of the room as the plastic sees it: warm brown walls, a paler ceiling, a dark carpet and one bright
  // window off to the key light's side; prefiltered with PMREM so the coat picks up a soft, believable reflection
  const W = 256, H = 128, data = new Float32Array(W * H * 4);
  const key = S.key.position.clone().sub(S.key.target.position).normalize();
  const kaz = Math.atan2(key.y, key.x), kel = Math.asin(key.z);
  for (let j = 0; j < H; j++) {
    const el = (0.5 - j / H) * Math.PI;                                  // +pi/2 at the top row
    for (let i = 0; i < W; i++) {
      const az = (i / W - 0.5) * 2 * Math.PI;
      const up = Math.max(0, Math.sin(el)), dn = Math.max(0, -Math.sin(el));
      let r = 0.30 + 0.45 * up - 0.16 * dn, g = 0.22 + 0.40 * up - 0.12 * dn, b = 0.15 + 0.36 * up - 0.09 * dn;   // walls -> ceiling / carpet
      let d = Math.abs(az - kaz); d = Math.min(d, 2 * Math.PI - d);
      const win = Math.exp(-Math.pow(d / 0.42, 4)) * Math.exp(-Math.pow((el - kel + 0.05) / 0.30, 4));   // the window: a soft-edged bright rectangle
      const sun = Math.exp(-Math.pow(d / 0.10, 2)) * Math.exp(-Math.pow((el - kel) / 0.08, 2));
      r += 3.2 * win + 5.0 * sun; g += 3.0 * win + 4.4 * sun; b += 1.6 * win + 2.3 * sun;   // the window/sun warmer (note 6: the coat's reflections were the blue in the live cross)
      const k = (j * W + i) * 4; data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType); tex.mapping = THREE.EquirectangularReflectionMapping; tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(S.renderer); const env = pm.fromEquirectangular(tex).texture; pm.dispose(); tex.dispose();
  return env;
}
function resize() {
  const w = S.canvas.clientWidth, h = S.canvas.clientHeight; if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  if (S.canvas.width !== Math.round(w * dpr) || S.canvas.height !== Math.round(h * dpr)) { S.renderer.setPixelRatio(dpr); S.renderer.setSize(w, h, false); }
  const fr = S.meta.framing(), FW = S.meta.res[0], FH = S.meta.res[1];
  const ox = (fr.fc[0] - fr.vc[0] * fr.sc[0]) * FW, oy = (1 - fr.fc[1] - (1 - fr.vc[1]) * fr.sc[1]) * FH;
  S.cam.setViewOffset(FW, FH, ox, oy, fr.sc[0] * FW, fr.sc[1] * FH);
}
function frame(now) { S.raf = requestAnimationFrame(frame); tick(now); }
function tick(now) {
  if (!S.ready || !S.visible) return;
  resize();
  const t = now / 1000;
  // the lift parameter p: 0 in the case, 1 facing the camera
  if (S.state === 'lifting') { const k = Math.min(1, (t - S.t0) / LIFT_S); S.p = S.p0 + (1 - S.p0) * easeOut(k); if (k >= 1) { S.state = 'held'; S.canvas.classList.add('live'); emit(); } }
  else if (S.state === 'returning') { const k = Math.min(1, (t - S.t0) / RETURN_S); S.p = S.p0 * (1 - easeInOut(k)); if (k >= 1) { S.state = 'rest'; S.p = 0; emit(); } }
  // the drag offset eases back when let go
  if (S.snap) { const k = Math.min(1, (t - S.snap.t0) / SNAP_S), e = 1 - easeOut(k); S.yaw = S.snap.yaw * e; S.pitch = S.snap.pitch * e; if (k >= 1) S.snap = null; }
  const face = facePose(); const p = S.p;
  const pos = rest.pos.clone().lerp(face.pos, p); pos.z += 0.06 * Math.sin(Math.PI * p);            // a small arc up out of the case
  const q = rest.quat.clone().slerp(face.quat, p);
  if (S.yaw || S.pitch) {
    const qy = new THREE.Quaternion().setFromAxisAngle(face.u, S.yaw), qp = new THREE.Quaternion().setFromAxisAngle(face.r, S.pitch);
    q.premultiply(qp).premultiply(qy);
  }
  S.model.position.copy(pos); S.model.quaternion.copy(q);
  S.shadow.material.opacity = 0.42 * Math.max(0, 1 - p * 2.5);
  S.renderer.render(S.scene, S.cam);
}
function emit() { if (S.onState) try { S.onState(S.state); } catch (e) {} }

// ---------- drag: yaw with x, pitch with y, +-90 deg, as one rigid piece ----------
function onDown(e) {
  if (S.state !== 'held') return;
  S.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch }; S.snap = null;
  S.canvas.setPointerCapture(e.pointerId); S.canvas.classList.add('grab'); e.stopPropagation(); e.preventDefault();
}
function onMove(e) {
  if (!S.drag || e.pointerId !== S.drag.id) return;
  const w = Math.max(240, Math.min(S.canvas.clientWidth, S.canvas.clientHeight));
  S.yaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, S.drag.yaw + (e.clientX - S.drag.x) / (0.45 * w) * (Math.PI / 2)));
  S.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, S.drag.pitch + (e.clientY - S.drag.y) / (0.45 * w) * (Math.PI / 2)));
  e.stopPropagation(); e.preventDefault();
}
function onUp(e) {
  if (!S.drag || e.pointerId !== S.drag.id) return;
  S.drag = null; S.canvas.classList.remove('grab'); S.snap = { t0: performance.now() / 1000, yaw: S.yaw, pitch: S.pitch }; e.stopPropagation();
}

window.crux = {
  get state() { return S.state; },
  get ready() { return S.ready; },
  get failed() { return S.failed; },
  /** canvasEl: the #crux3d canvas; meta: { cam, aim, lens, res: [w, h], framing: () => ({ sc, fc, vc }), onState } */
  mount(canvasEl, meta) {
    S.canvas = canvasEl; S.meta = meta; S.onState = meta.onState || null; S.visible = false; S.state = 'rest'; S.p = 0; S.yaw = S.pitch = 0; S.drag = S.snap = null;
    canvasEl.hidden = false; canvasEl.classList.remove('on', 'live');
    if (!S.renderer) {
      canvasEl.addEventListener('pointerdown', onDown); canvasEl.addEventListener('pointermove', onMove);
      canvasEl.addEventListener('pointerup', onUp); canvasEl.addEventListener('pointercancel', onUp);
    }
    if (!S.raf) S.raf = requestAnimationFrame(frame);
    if (S.ready) return Promise.resolve(true);
    return loadThree().then(() => { if (!S.renderer) setup(); return loadGLB(GLB_URL); }).then(root => {
      S.model.add(root); S.ready = true; return true;
    }).catch(err => { S.failed = true; console.warn('crucifix: not available', err); throw err; });
  },
  get visible() { return S.visible && S.ready; },      // index.html composites the canvas while this is true
  show() { S.visible = true; if (S.canvas) { S.canvas.hidden = false; S.canvas.classList.add('on'); } tick(performance.now()); },   // drawn at once: the page swaps the rendered frame for the still + this canvas on the same frame
  hide() { S.visible = false; if (S.canvas) S.canvas.classList.remove('on', 'live'); },
  lift() { if (!S.ready || S.state === 'lifting' || S.state === 'held') return false; S.state = 'lifting'; S.p0 = S.p; S.t0 = performance.now() / 1000; emit(); return true; },
  release() {
    if (S.state === 'rest' || S.state === 'returning') return false;
    S.drag = null; S.canvas.classList.remove('live', 'grab'); S.snap = null; S.yaw = S.pitch = 0;
    S.state = 'returning'; S.p0 = S.p; S.t0 = performance.now() / 1000; emit(); return true;
  },
  unmount() {
    S.visible = false; S.state = 'rest'; S.p = 0; S.yaw = S.pitch = 0; S.drag = S.snap = null;
    if (S.canvas) { S.canvas.classList.remove('on', 'live', 'grab'); S.canvas.hidden = true; }
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    if (S.renderer) S.renderer.clear();
  },
};
})();
