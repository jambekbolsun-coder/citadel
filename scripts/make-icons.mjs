// Генерация растровых ассетов бренда SMM KADR из векторных исходников (assets/brand/*.svg).
// Исходники SVG: знак восстановлен по оригинальному логотипу, надпись — контуры Montserrat ExtraBold.
// Запуск: npm run icons
import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";

const brand = "assets/brand";
const out = "public/icons";
mkdirSync(out, { recursive: true });
const svg = (name) => readFileSync(`${brand}/${name}`);
const png = (input, size, file) => sharp(input, { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file);

// Иконки приложения: белый знак на фирменном синем. Длинное название в значке не читается — только знак.
// Основные имена — с ревизией (см. src/lib/brand.ts): новый адрес гарантирует, что телефоны не возьмут старую иконку из кеша.
// Прежние имена icon-*.png тоже перезаписываются — на случай ссылок, оставшихся в старых установках.
const REV = "smmkadr";
for (const size of [32, 48, 180, 192, 512]) {
  await png(svg("icon.svg"), size, `${out}/${REV}-${size}.png`);
  await png(svg("icon.svg"), size, `${out}/icon-${size}.png`);
}
// Maskable: знак в безопасной зоне (Android обрезает углы/круг).
for (const size of [192, 512]) {
  await png(svg("icon-maskable.svg"), size, `${out}/${REV}-maskable-${size}.png`);
  await png(svg("icon-maskable.svg"), size, `${out}/maskable-${size}.png`);
}
// Next.js file-based иконки (favicon и apple-touch-icon).
await png(svg("icon.svg"), 64, "src/app/icon.png");
await png(svg("icon.svg"), 180, "src/app/apple-icon.png");

// Логотипы PNG с прозрачным фоном (для документов/соцсетей).
for (const [name, w] of [["logo", 1024], ["logo-dark", 1024], ["logo-white", 1024], ["logo-horizontal", 1200], ["logo-horizontal-white", 1200]]) {
  await sharp(svg(`${name}.svg`), { density: 600 }).resize({ width: w }).png({ compressionLevel: 9 }).toFile(`public/brand/${name}.png`);
}

// OpenGraph 1200×630: фирменный синий градиент + белый логотип.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="a" cx="0.72" cy="0.35" r="0.8"><stop offset="0" stop-color="#2f74ff"/><stop offset="0.55" stop-color="#1238c9"/><stop offset="1" stop-color="#06134d"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#a)"/>
</svg>`;
const logo = await sharp(svg("logo-white.svg"), { density: 600 }).resize({ width: 520 }).png().toBuffer();
await sharp(Buffer.from(og)).composite([{ input: logo, gravity: "centre" }]).jpeg({ quality: 86 }).toFile("public/og.jpg");
console.log("icons ok");
