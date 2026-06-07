const CACHE_NAME = 'barbie-calc-v1';
const ASSETS = [
  '/',
  '/static/icon.png',
  '/static/manifest.json'
];

// Установка: кэшируем файлы
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Работа: отдаем из кэша, если нет сети
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});