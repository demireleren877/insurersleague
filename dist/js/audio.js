// Optional broadcast sounds (off by default). No external files; synthesized with WebAudio.
let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { at = 0, dur = 0.16, type = 'sine', gain = 0.05, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  tick: () => { tone(660, { dur: 0.08, type: 'triangle', gain: 0.04 }); },
  countdown: n => tone(n > 0 ? 520 : 880, { dur: n > 0 ? 0.14 : 0.45, type: 'square', gain: 0.035 }),
  month: () => { tone(392, { dur: 0.12, type: 'triangle' }); tone(587, { at: 0.09, dur: 0.18, type: 'triangle' }); },
  overtake: () => tone(300, { dur: 0.22, type: 'sawtooth', gain: 0.02, slide: 2.4 }),
  event: () => { tone(220, { dur: 0.3, type: 'square', gain: 0.025 }); tone(233, { at: 0.02, dur: 0.3, type: 'square', gain: 0.02 }); },
  leader: () => [523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.3, type: 'triangle', gain: 0.045 })),
  fanfare: () => [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, { at: i * 0.14, dur: i === 4 ? 0.9 : 0.24, type: 'triangle', gain: 0.05 }))
};
