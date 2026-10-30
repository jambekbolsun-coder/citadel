// Адреса иконок приложения. Имена файлов меняются при смене логотипа: старые адреса (/icons/icon-*.png)
// могли закешироваться на телефонах (service worker «Цитадели» отдавал их «сначала из кеша»),
// поэтому новый логотип публикуется по адресам, которых ещё нет ни в одном кеше.
// При следующей смене логотипа: увеличьте ICON_REV и запустите `npm run icons`.
export const ICON_REV = "smmkadr";
export const icon = (size: 32 | 48 | 180 | 192 | 512) => `/icons/${ICON_REV}-${size}.png`;
export const maskable = (size: 192 | 512) => `/icons/${ICON_REV}-maskable-${size}.png`;
export const APP_ICON = icon(192);
