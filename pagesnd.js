// Page sounds. Round 5 note 2: every leaf turn plays one of Josiah's recorded page turns (frames/pageturn.mp4, Epidemic Sound,
// sliced into single events by scene/art/pageturn_slice.py; frames/pageturn.json lists each slice's start, dur and the time of its
// loudest transient), started so that the transient lands when the leaf passes vertical; the slices are picked at random without
// repeats. The generated sounds remain: the padded cover's creak, the closed book dropping onto the table, and the old leaf/sheet
// strokes as the stand-in until the recording has decoded. Everything runs through one "book bus" at -12 dB (Josiah: 50 % quieter, then 50 % again on 10-01)
// into the page's master gain (window.__snd from index.html), so the Sound button mutes it all.
// window.pageSnd = { turn(t0, dur, opts), leaf(t0, dur), sheet(t0, dur), cover(open, t0, dur), drop(t0), load() }; times in
// seconds from now (0 = now), dur = how long the move on screen takes, so the landing lands with the picture.
(() => {
'use strict';
const ctx = () => { const s = window.__snd; return s && s.ctx && s.ctx(); };
const BUS_GAIN = 0.25;                                                  // -12 dB on everything the books and the article make
let bus = null, busCtx = null;
function out() {
  const s = window.__snd, ac = ctx(); if (!s || !s.master || !ac) return null;
  if (!bus || busCtx !== ac) { bus = ac.createGain(); bus.gain.value = BUS_GAIN; bus.connect(s.master); busCtx = ac; }
  return bus;
}
// ---- the recording: decoded once (QA runs on the Vorbis copy frames/_pageturn.ogg, as index.html does for the other recordings)
const QA_WEBM = /webmtest/.test(location.hash);
let slices = null, buf = null, loading = false, bag = [];
function load() {
  const ac = ctx(); if (!ac || buf || loading) return; loading = true;
  Promise.all([fetch('frames/pageturn.json').then(r => r.json()), fetch(QA_WEBM ? 'frames/_pageturn.ogg' : 'frames/pageturn.mp4').then(r => r.arrayBuffer()).then(ab => ac.decodeAudioData(ab))])
    .then(([j, b]) => { slices = j.slices || []; buf = b; }).catch(() => {}).then(() => { loading = false; });
}
function pickSlice(short) {
  // random without repeats: a shuffled bag, refilled when empty; `short` prefers slices whose transient comes early (the rapid run)
  if (!bag.length) { bag = slices.map((s, i) => i); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
  if (short) { const k = bag.findIndex(i => slices[i].peak < 0.5); if (k >= 0) return slices[bag.splice(k, 1)[0]]; }
  return slices[bag.pop()];
}
/** one recorded page turn for a leaf that takes `dur` s on screen, starting in t0 s: the slice's loudest transient lands at the
 *  leaf's vertical (`at` = fraction of dur, default 0.5 where bible.js's ease is half-way); a turn shorter than 0.35 s (the rapid
 *  run) keeps only ~0.4 s past the transient so the overlapping slices stay a riffle, not a pile-up. Returns false without the recording. */
function playSlice(t0, dur, opts) {
  const ac = ctx(), o = out(); if (!ac || !o || !buf || !slices || !slices.length) return false;
  try { if (ac.state !== 'running') return false; } catch (e) { return false; }
  opts = opts || {}; t0 = +t0 || 0; dur = +dur || 0.7; const at = ac.currentTime + Math.max(0, t0); const lead = dur * (opts.at ?? 0.5);
  const sl = pickSlice(dur < 0.35); if (!sl) return false;
  const skip = Math.max(0, sl.peak - lead);                            // start inside the slice when its transient is later than the lead
  const wait = Math.max(0, lead - sl.peak);                            // ... or a little late when it comes early
  const tail = dur < 0.35 ? 0.4 : 1.4;                                 // seconds kept after the transient
  const len = Math.min(sl.dur - skip, (sl.peak - skip) + tail);
  const s = ac.createBufferSource(); s.buffer = buf; const g = ac.createGain();
  const start = at + wait, gain = opts.gain ?? 1.0;
  g.gain.setValueAtTime(skip > 0 ? 0 : gain, start); if (skip > 0) g.gain.linearRampToValueAtTime(gain, start + 0.012);
  g.gain.setValueAtTime(gain, start + len - 0.06); g.gain.linearRampToValueAtTime(0, start + len);
  s.connect(g).connect(o); s.start(start, sl.start + skip, len + 0.01);
  return true;
}
let noise = null;
function noiseBuf(ac) {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (noise = b);
}
const rnd = (a, b) => a + Math.random() * (b - a);
// a filtered noise stroke: bandpass swept f0 -> f1 over dur, gain envelope drawn by `env` (list of [time, gain]), Q
function stroke(ac, dst, at, dur, f0, f1, q, env, gainK) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true; s.loopStart = rnd(0, 1.2);
  const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, at);
  for (const [k, v] of env) g.gain.linearRampToValueAtTime(v * gainK, at + k * dur);
  g.gain.linearRampToValueAtTime(0, at + dur + 0.01);
  s.connect(f).connect(g).connect(dst); s.start(at); s.stop(at + dur + 0.05);
}
function thump(ac, dst, at, f, gain, dur) {                        // a soft low knock: the leaf landing on the stack
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.55, at + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
  o.connect(g).connect(dst); o.start(at); o.stop(at + dur + 0.02);
}
function ready() { const ac = ctx(), o = out(); if (!ac || !o) return null; try { if (ac.state !== 'running') return null; } catch (e) { return null; } return { ac, o }; }
window.pageSnd = {
  load,
  get loaded() { return !!buf; },
  get slices() { return slices; },
  /** a page turning: the recording when it is in, else the generated leaf (or sheet, for the article) */
  turn(t0, dur, opts) {
    load(); if (playSlice(t0, dur, opts)) return;
    if (opts && opts.sheet) window.pageSnd.sheet(t0, dur); else window.pageSnd.leaf(t0, dur);
  },
  /** a heavy gilt-edged leaf: a soft lift, a rising slide of paper on paper, the flap as it lands */
  leaf(t0, dur) {
    const r = ready(); if (!r) return; const { ac, o } = r; const at = ac.currentTime + Math.max(0, t0 || 0); dur = dur || 0.7;
    const k = rnd(0.85, 1.15);
    if (dur < 0.35) {                                                   // round 3 note 12: the rapid leaf run (0.2 s a leaf): one quick riffle and the land, no lift, no gilt settle
      stroke(ac, o, at, dur * 0.7, 1600 * k, 3600 * k, 1.0, [[0.1, 0.09], [0.5, 0.11], [1, 0.0]], 1.0);
      thump(ac, o, at + dur * 0.75, 170 * k, 0.045, 0.06); return;
    }
    stroke(ac, o, at, dur * 0.55, 900 * k, 2600 * k, 1.2, [[0.05, 0.05], [0.4, 0.09], [1, 0.02]], 1.0);        // the lift and the sweep through the air
    stroke(ac, o, at + dur * 0.62, dur * 0.34, 2200 * k, 3800 * k, 0.9, [[0.08, 0.16], [0.3, 0.12], [1, 0.0]], 1.0);   // the flap
    thump(ac, o, at + dur * 0.78, 160 * k, 0.06, 0.09);                                                            // and it lands
    stroke(ac, o, at + dur * 0.8, dur * 0.25, 4000, 6500, 2.5, [[0.1, 0.05], [1, 0]], 1.0);                          // the gilt edge settling
  },
  /** a newsprint sheet: lighter, drier, quicker */
  sheet(t0, dur) {
    const r = ready(); if (!r) return; const { ac, o } = r; const at = ac.currentTime + Math.max(0, t0 || 0); dur = dur || 0.8;
    const k = rnd(0.9, 1.1);
    stroke(ac, o, at, dur * 0.5, 1400 * k, 3200 * k, 1.0, [[0.1, 0.07], [0.5, 0.05], [1, 0.02]], 1.0);
    stroke(ac, o, at + dur * 0.55, dur * 0.35, 2600 * k, 5200 * k, 0.8, [[0.1, 0.15], [0.35, 0.1], [1, 0]], 1.0);   // the crackle as it folds over
    for (let i = 0; i < 3; i++) thump(ac, o, at + dur * (0.7 + 0.06 * i), rnd(900, 1500), 0.02, 0.02);               // dry ticks of the fold
    thump(ac, o, at + dur * 0.82, 220, 0.03, 0.06);
  },
  /** the closed book landing back on the wooden table (round 4 note 4: the drop lands at speed) */
  drop(t0) {
    const r = ready(); if (!r) return; const { ac, o } = r; const at = ac.currentTime + Math.max(0, t0 || 0);
    thump(ac, o, at, 95, 0.14, 0.16);                                                                               // the body of the book
    thump(ac, o, at + 0.004, 260, 0.05, 0.05);                                                                      // the knock of the boards on the wood
    stroke(ac, o, at, 0.09, 2200, 900, 0.9, [[0.1, 0.07], [1, 0]], 1.0);                                            // air pushed out from under it
  },
  /** the padded leatherette board: a leather creak as it swings, a soft drop of the board at the end */
  cover(open, t0, dur) {
    const r = ready(); if (!r) return; const { ac, o } = r; const at = ac.currentTime + Math.max(0, t0 || 0); dur = dur || 1.1;
    stroke(ac, o, at, dur * 0.7, 380, 240, 4.0, [[0.15, 0.06], [0.5, 0.08], [1, 0.0]], 1.0);                          // the leather creaking
    stroke(ac, o, at + dur * 0.1, dur * 0.6, 1800, 900, 0.7, [[0.2, 0.04], [1, 0.0]], 1.0);                           // air over the pebbled cover
    thump(ac, o, at + dur * (open ? 0.9 : 0.86), open ? 110 : 90, open ? 0.07 : 0.11, 0.14);                         // the board comes to rest
    if (!open) stroke(ac, o, at + dur * 0.86, 0.12, 3000, 1500, 1.0, [[0.1, 0.06], [1, 0]], 1.0);                     // the gilt edges closing up
  },
};
})();
