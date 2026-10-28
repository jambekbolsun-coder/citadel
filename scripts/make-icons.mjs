// Генерация иконок PWA из исходного логотипа (assets/logo-source.webp).
// Запуск: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const src = "assets/logo-source.webp";
const out = "public/icons";
mkdirSync(out, { recursive: true });

const RED = { r: 190, g: 6, b: 12, alpha: 1 };

// Обычные иконки: кадрируем по центру ананаса.
for (const size of [32, 180, 192, 512]) {
  await sharp(src)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(`${out}/icon-${size}.png`);
}

// Maskable: композиция с безопасной зоной (~80%) на фирменном красном фоне.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.8);
  const img = await sharp(src).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: RED } })
    .composite([{ input: img, gravity: "centre" }])
    .png()
    .toFile(`${out}/maskable-${size}.png`);
}

// Логотип для сайта/приложения.
await sharp(src).resize(640, 640, { fit: "cover" }).webp({ quality: 86 }).toFile("public/logo.webp");
await sharp(src).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82 }).toFile("public/og.jpg");
console.log("icons ok");
