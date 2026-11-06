// Writes Jarso's three short sound effects as 16-bit mono 22.05 kHz WAVs (Node built-ins only).
// Usage: node scripts/make-sounds.mjs apps/mobile/assets/sounds
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 22050;

/** Sine at `freq` (a number, or a fn of 0..1 progress) for `ms`, with an exponential decay. */
function tone(freq, ms, decay = 6) {
  const n = Math.round((RATE * ms) / 1000);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (2 * Math.PI * (typeof freq === "function" ? freq(t) : freq)) / RATE;
    const attack = Math.min(1, i / 60); // ~3 ms ramp-in, no click
    out[i] = Math.sin(phase) * Math.exp(-decay * t) * attack;
  }
  return out;
}

function concat(parts) {
  const out = new Float64Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * 0.6)) * 32767), i * 2);
  });
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const clips = {
  coin: concat([tone(1320, 70, 5), tone(1760, 70, 5)]),
  pop: tone((t) => 600 + 600 * t, 90, 3),
  cheer: concat([523, 659, 784, 1047].map((f) => tone(f, 110, 3))),
};

const dir = process.argv[2];
if (!dir) {
  process.stderr.write("Usage: node scripts/make-sounds.mjs <output dir>\n");
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
for (const [name, samples] of Object.entries(clips)) {
  writeFileSync(join(dir, `${name}.wav`), wav(samples));
  process.stdout.write(`${name}.wav ${Math.round((samples.length / RATE) * 1000)} ms\n`);
}
