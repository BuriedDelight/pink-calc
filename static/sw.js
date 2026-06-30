const CACHE_NAME = 'barbie-calc-cache-v1';

// Список того, что нужно сохранить на телефон
const urlsToCache = [
    '/', // Главная страница (HTML)
    '/static/style.css',
    '/static/script.js',
    '/static/icon.png',
    '/static/manifest.json',
    'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&display=swap',
    'https://fonts.googleapis.com/css2?family=Comfortaa:wght@300..700&display=swap'
];

// 1. При установке кэшируем все нужные файлы
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Открыт кэш');
                return cache.addAll(urlsToCache);
            })
    );
});

// 2. При запросах сети отдаем файлы из кэша, если интернета нет
self.addEventListener('fetch', event => {
    // Игнорируем запросы к базе данных (API), их кэшировать не нужно
    if (event.request.url.includes('/api/') || event.request.url.includes('/.well-known/')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Если файл найден в кэше — отдаем его. Если нет — идем в сеть.
                return response || fetch(event.request);
            })
    );
});