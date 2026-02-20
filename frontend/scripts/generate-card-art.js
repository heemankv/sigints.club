#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");

const count = Number(process.env.COUNT ?? 12);
const outDir = path.resolve(__dirname, "..", "public", "generated");

function randBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

function randomColor() {
  const h = randBetween(0, 360);
  const s = randBetween(45, 80);
  const l = randBetween(40, 65);
  return `hsl(${h} ${s}% ${l}%)`;
}

function buildSvg(index) {
  const c1 = randomColor();
  const c2 = randomColor();
  const c3 = randomColor();
  const c4 = randomColor();
  const accent = randomColor();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="640" height="640" viewBox="0 0 640 640" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-${index}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="orb-${index}" cx="0.2" cy="0.2" r="0.8">
      <stop offset="0%" stop-color="${c3}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${c4}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="640" rx="48" fill="url(#bg-${index})"/>
  <rect x="32" y="32" width="576" height="576" rx="40" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
  <circle cx="160" cy="160" r="240" fill="url(#orb-${index})"/>
  <circle cx="480" cy="420" r="180" fill="rgba(255,255,255,0.08)"/>
  <path d="M96 360 C 200 260, 360 260, 544 340" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
  <path d="M120 420 C 240 520, 400 520, 520 440" stroke="rgba(255,255,255,0.6)" stroke-width="2" stroke-linecap="round"/>
  <g opacity="0.6">
    <circle cx="520" cy="140" r="6" fill="#fff"/>
    <circle cx="540" cy="160" r="4" fill="#fff"/>
    <circle cx="500" cy="180" r="3" fill="#fff"/>
  </g>
</svg>`;
}

fs.mkdirSync(outDir, { recursive: true });
for (let i = 0; i < count; i += 1) {
  const svg = buildSvg(i);
  fs.writeFileSync(path.join(outDir, `subscription-${i + 1}.svg`), svg, "utf8");
}

console.log(`Generated ${count} SVGs in ${outDir}`);
