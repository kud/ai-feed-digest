#!/usr/bin/env tsx
/**
 * Generate multi-format favicon assets from src/app/icon.svg
 * Outputs: favicon.ico, apple-touch-icon.png, icon-512.png to public/
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const SVG_PATH = resolve(ROOT, 'src/app/icon.svg');
const PUBLIC_DIR = resolve(ROOT, 'public');

async function generateFavicons() {
  console.log('🎨 Building favicon assets...\n');

  const svgBuffer = readFileSync(SVG_PATH);

  // Generate PNG for favicon.ico (32x32 is standard)
  console.log('→ Generating favicon.ico (32px PNG)...');
  const png32 = await sharp(svgBuffer, { density: 300 })
    .resize(32, 32)
    .png()
    .toBuffer();

  // Note: sharp doesn't directly create .ico, but modern browsers accept .png fallback
  // For true .ico support, you'd use a library like 'to-ico'
  writeFileSync(resolve(PUBLIC_DIR, 'favicon.ico'), png32);
  console.log('  ✓ favicon.ico (32x32 PNG fallback)\n');

  // Apple Touch Icon (180x180)
  console.log('→ Generating apple-touch-icon.png (180x180)...');
  await sharp(svgBuffer, { density: 300 })
    .resize(180, 180)
    .png()
    .toFile(resolve(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('  ✓ apple-touch-icon.png\n');

  // PWA icon (512x512)
  console.log('→ Generating icon-512.png...');
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(resolve(PUBLIC_DIR, 'icon-512.png'));
  console.log('  ✓ icon-512.png\n');

  // Also generate 192x192 for manifest
  console.log('→ Generating icon-192.png...');
  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192)
    .png()
    .toFile(resolve(PUBLIC_DIR, 'icon-192.png'));
  console.log('  ✓ icon-192.png\n');

  console.log('✅ All favicon assets generated in public/');
}

generateFavicons().catch((err) => {
  console.error('❌ Error generating favicons:', err);
  process.exit(1);
});
