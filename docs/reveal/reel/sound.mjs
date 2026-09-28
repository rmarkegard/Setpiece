// Synthesizes the reel's sound design as a 48 kHz stereo WAV, cued to the same
// timeline as reel.html. Everything is generated: no samples.
//
//   node sound.mjs [out/reel-audio.wav]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, process.argv[2] || 'out/reel-audio.wav');
const SR = 48000, DUR = 15, N = SR * DUR;
const dry = [new Float32Array(N), new Float32Array(N)];
const wet = [new Float32Array(N), new Float32Array(N)];   // reverb send

// ---------- helpers ----------
let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const TAU = Math.PI * 2;
const note = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI → Hz
function put(i, l, r, send = .25) {
  if (i < 0 || i >= N) return;
  dry[0][i] += l; dry[1][i] += r; wet[0][i] += l * send; wet[1][i] += r * send;
}
const panLR = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];  // p in [-1, 1]

// RBJ biquad, recomputed every 32 samples for sweeps.
function biquad(type) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    set(fc, q) {
      fc = clamp(fc, 20, SR * .45);
      const w = TAU * fc / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
      let n0, n1, n2; const d0 = 1 + al;
      if (type === 'lp') { n0 = (1 - c) / 2; n1 = 1 - c; n2 = (1 - c) / 2; }
      else if (type === 'hp') { n0 = (1 + c) / 2; n1 = -(1 + c); n2 = (1 + c) / 2; }
      else { n0 = al; n1 = 0; n2 = -al; }   // band-pass
      b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = -2 * c / d0; a2 = (1 - al) / d0;
    },
    run(x) { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; },
  };
}

// ---------- instruments ----------
// Filtered-noise whoosh: cutoff sweeps f0→f1, loudness peaks at `peak` (0..1 of dur), pans p0→p1.
function whoosh(t0, dur, f0, f1, amp, p0 = 0, p1 = 0, peak = .7, q = 1.1, send = .35) {
  const bp = biquad('bp'), i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  for (let k = 0; k < n; k++) {
    const u = k / n;
    if (k % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, u), q);
    const env = u < peak ? Math.pow(u / peak, 2.2) : Math.pow(1 - (u - peak) / (1 - peak), 1.6);
    const y = bp.run(rand()) * env * amp;
    const [l, r] = panLR(p0 + (p1 - p0) * u);
    put(i0 + k, y * l, y * r, send);
  }
}
// Pitch-dropping sine: kicks, thuds, booms.
function boom(t0, f0, f1, dec, amp, pan = 0, send = .15, click = .3) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dec * 6 * SR);
  let ph = 0; const [l, r] = panLR(pan);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t / (dec * .25));
    ph += TAU * f / SR;
    const env = Math.exp(-t / dec) * Math.min(1, t * 800);
    let y = Math.sin(ph) * env;
    y = Math.tanh(y * 1.6) * amp;
    if (t < .006) y += rand() * click * amp * (1 - t / .006);
    put(i0 + k, y * l, y * r, send);
  }
}
// FM bell / pluck.
function bell(t0, f, dec, amp, pan = 0, ratio = 3.01, index = 2.2, send = .5) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dec * 5 * SR);
  const [l, r] = panLR(pan);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const idx = index * Math.exp(-t / (dec * .35));
    const y = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * ratio * t)) * Math.exp(-t / dec) * Math.min(1, t * 2000) * amp;
    put(i0 + k, y * l, y * r, send);
  }
}
// UI click: tiny noise transient plus a short tone blip.
function click(t0, amp, pan = 0, tone = 2600) {
  const hp = biquad('hp'); hp.set(3000, .7);
  const i0 = Math.floor(t0 * SR), n = Math.floor(.05 * SR);
  const [l, r] = panLR(pan);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const y = (hp.run(rand()) * Math.exp(-t / .002) * .9 + Math.sin(TAU * tone * t) * Math.exp(-t / .012) * .5) * amp;
    put(i0 + k, y * l, y * r, .2);
  }
}
// Riser: noise band + a gliding sine, building into a hit.
function riser(t0, t1, f0, f1, amp, send = .4) {
  const bp = biquad('bp'), i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR);
  let ph = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    if (k % 32 === 0) bp.set(f0 * Math.pow(f1 / f0, u), 2.5);
    const env = Math.pow(u, 2.4);
    ph += TAU * (f0 / 4) * Math.pow(f1 / f0, u) / SR;
    const y = (bp.run(rand()) * .8 + Math.sin(ph) * .12) * env * amp;
    put(i0 + k, y * .92, y, send);
  }
}
// Pad: detuned sine stack with slow amplitude envelope.
function pad(t0, t1, notes, amp, att = 1.2, rel = 1.2, send = .6) {
  const i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0 + rel) * SR);
  const voices = [];
  notes.forEach((m, j) => { for (const d of [-.0035, 0, .0041]) voices.push({ f: note(m) * (1 + d), ph: (rand() + 1) * Math.PI, pan: ((j % 2) ? .35 : -.35) + d * 60, a: 1 / Math.sqrt(1 + j * .6) }); });
  const len = t1 - t0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / att) * (t > len ? Math.max(0, 1 - (t - len) / rel) : 1);
    if (env <= 0) continue;
    let l = 0, r = 0;
    for (const v of voices) {
      const s = Math.sin(v.ph + TAU * v.f * t) * v.a * (1 + .25 * Math.sin(t * 1.3 + v.ph));
      const [pl, pr] = panLR(v.pan); l += s * pl; r += s * pr;
    }
    const g = env * amp / voices.length * 3;
    put(i0 + k, l * g, r * g, send);
  }
}
// Soft sub pulse for rhythm under act 3.
function sub(t0, f, dec, amp) { boom(t0, f * 1.6, f, dec, amp, 0, .05, 0); }

// ---------- score ----------
// Harmony: D major 9 → B minor 7 → G major 7 (add 9) → D major 9 resolution.
const Dmaj9 = [38, 50, 57, 62, 66, 69, 76], Bm7 = [35, 47, 54, 59, 62, 66, 69], Gmaj7 = [31, 43, 50, 55, 59, 62, 69], DmajHi = [38, 50, 57, 62, 66, 69, 73, 76];

// Act 1 — light, mark, wordmark
whoosh(0, .7, 6000, 1800, .10, -.8, .8, .25, 3, .6);          // the streak of light
bell(.06, note(93), 1.6, .05, .5, 2.0, 1.2, .8);
riser(.2, 1.0, 400, 1600, .05, .6);                             // the outline drawing on
bell(1.0, note(74), 1.3, .16, -.3); bell(1.12, note(78), 1.2, .13, .3); bell(1.24, note(81), 1.4, .13, .1);
boom(1.0, 110, 48, .22, .22, 0, .2, .1);
pad(.2, 2.0, Dmaj9, .10, 1.0, .6);
whoosh(1.15, .7, 800, 3500, .06, .2, -.1, .6);                  // letters rise
// Dive
riser(1.5, 2.1, 300, 5000, .16);
whoosh(2.02, .65, 300, 5000, .28, 0, 0, .55, .9, .25);
// Act 2 — kinetic beats
boom(2.62, 160, 42, .32, .75, 0, .12); whoosh(2.6, .25, 6000, 2000, .07, 0, 0, .05, 1, .3);
const stab = (t, notes, amp) => notes.forEach((m, j) => bell(t, note(m), .5, amp / notes.length * 2.2, (j - notes.length / 2) * .15, 1.0, .9, .35));
stab(2.62, [62, 66, 69, 74], .22);
boom(2.95, 150, 45, .24, .55, -.2); stab(2.95, [59, 62, 66, 71], .2); click(2.95, .25, .4);
boom(3.30, 150, 45, .24, .55, .2); stab(3.30, [55, 59, 62, 69], .2); click(3.30, .25, -.4);
boom(3.65, 140, 40, .3, .6, 0); stab(3.65, [57, 61, 64, 69], .2);
// Pull back to the monitor
whoosh(3.85, 1.1, 5000, 250, .22, 0, 0, .3, .8, .5);
pad(3.95, 7.4, Bm7, .085, 1.3, 1.0);
// Widgets fly in: whoosh along the flight, thud on landing (panned from where they come from)
const flights = [[5.02, .62, .9, .45], [5.26, .6, 1, .2], [5.48, .6, .9, .55], [5.72, .62, .3, .45], [5.98, .64, -.6, -.3]];
flights.forEach(([land, dur, p0, p1], i) => {
  whoosh(land - dur, dur + .05, 700 + i * 90, 3800 + i * 250, .20, p0, p1, .82, 1.3, .3);
  boom(land, 190 - i * 8, 62, .12, .42, p1, .18, .5);
  click(land + .01, .10, p1, 1800 + i * 200);
  bell(land + .02, note([74, 76, 78, 81, 83][i]), .5, .05, p1, 2, 1, .5);
});
// Browser: bigger flight and a heavy landing
whoosh(6.2, .9, 250, 4200, .34, -.9, -.3, .85, 1, .35);
boom(7.05, 120, 36, .42, .9, -.3, .2, .6);
whoosh(7.03, .5, 3000, 600, .10, -.3, -.3, .1, 1, .6);
for (let i = 0; i < 6; i++) click(6.6 + i * .045, .045, -.4 + (i % 3) * .1, 3200 + i * 150);   // page cards settle
// Rhythm bed under the widgets and browser
for (let t = 4.9; t < 10.2; t += .48) sub(t, 46, .25, .16);
// Cursor and clicks
click(7.95, .4, -.5, 2400); bell(7.97, note(86), .35, .05, -.5, 2, .8, .4);
whoosh(7.98, .55, 900, 2600, .08, -.5, -.3, .5, 1.2, .4);        // player grows
click(9.05, .42, -.1, 2600);
// Fullscreen inside the tile: an opening swell, then air
whoosh(9.05, .6, 400, 6000, .22, -.3, 0, .45, .8, .5);
boom(9.5, 90, 40, .5, .45, 0, .3, .1);
pad(9.2, 12.4, Gmaj7, .1, .8, 1.0);
bell(9.42, note(88), .35, .07, -.4, 1.5, 1.5, .4); bell(9.66, note(93), .35, .06, .4, 1.5, 1.5, .4);   // chips
click(9.9, .07, .4, 3400);   // minute rollover
// Pull back to every display
whoosh(10.15, 1.1, 5500, 200, .26, 0, 0, .35, .8, .5);
boom(10.95, 80, 34, .5, .55, -.5, .25, .1); boom(11.0, 84, 36, .5, .45, .5, .25, .1);
[10.62, 10.66, 10.7, 10.74, 10.78, 10.82, 10.88].forEach((t, i) => click(t, .06, i % 2 ? .6 : -.6, 2200 + i * 180));
// Accent waves: a glassy arpeggio sweeping left → right, one per wave
const arps = [[74, 78, 81, 86], [76, 79, 83, 88], [78, 81, 85, 90]];
[11.35, 11.75, 12.15].forEach((t, k) => {
  arps[k].forEach((m, j) => bell(t + j * .07, note(m), .7, .09, -.8 + j * .5, 2.0, 1.4, .7));
  whoosh(t, .75, 2500, 9000, .05, -.9, .9, .4, 2, .7);
});
// Morph into the mark → resolving hit
riser(12.35, 13.42, 200, 7000, .22);
whoosh(12.75, .7, 500, 3000, .15, 0, 0, .7, 1, .4);
boom(13.42, 130, 32, .9, 1.0, 0, .35, .4);
stab(13.42, [62, 66, 69, 73, 76, 81], .34);
pad(13.42, 15.2, DmajHi, .14, .05, 1.4, .8);
bell(13.44, note(50), 3, .12, 0, 1.0, 1.5, .6);
// Shine
[0, .06, .12, .18, .24].forEach((d, j) => bell(14.2 + d, note(93 + [0, 2, 4, 7, 9][j]), .6, .035, -.6 + j * .3, 3.5, 1.2, .8));

// ---------- reverb (Freeverb) ----------
function freeverb(input, spread) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ buf: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0, store: 0 }));
  const aps = [556, 441, 341, 225].map(d => ({ buf: new Float32Array(Math.round((d + spread) * SR / 44100)), i: 0 }));
  const fb = .86, damp = .3, out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = input[n] * .015;
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = s + b * .5;
      s = b - s;
      a.i = (a.i + 1) % a.buf.length;
    }
    out[n] = s;
  }
  return out;
}
const revL = freeverb(wet[0], 0), revR = freeverb(wet[1], 23);

// ---------- master ----------
const mix = [new Float32Array(N), new Float32Array(N)];
const hpL = biquad('hp'), hpR = biquad('hp'); hpL.set(28, .7); hpR.set(28, .7);
let peak = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = Math.min(1, t / .05) * Math.min(1, (DUR - t) / .45);
  const l = hpL.run(dry[0][n] + revL[n] * 1.1), r = hpR.run(dry[1][n] + revR[n] * 1.1);
  mix[0][n] = Math.tanh(l * 1.15) * fade; mix[1][n] = Math.tanh(r * 1.15) * fade;
  peak = Math.max(peak, Math.abs(mix[0][n]), Math.abs(mix[1][n]));
}
const gain = .89 / peak;   // normalize to about −1 dBFS
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  pcm.writeInt16LE(Math.round(clamp(mix[0][n] * gain, -1, 1) * 32767), 44 + n * 4);
  pcm.writeInt16LE(Math.round(clamp(mix[1][n] * gain, -1, 1) * 32767), 46 + n * 4);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pcm);
console.log(`wrote ${OUT} (peak ${peak.toFixed(3)} → normalized)`);
