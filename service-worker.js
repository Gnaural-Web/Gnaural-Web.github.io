const CACHE_VERSION = 'v1';
const CACHE_NAME = `gnaural-cache-${CACHE_VERSION}`;
const PRECACHE_URLS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'editor.js',
  'manifest.webmanifest',
  'standard-files.json',
  'gpl-3.0.txt',
  'LICENSE',
  'README.md',
  'icons/add.svg',
  'icons/birds.svg',
  'icons/boat.svg',
  'icons/city.svg',
  'icons/coffee-shop.svg',
  'icons/fireplace.svg',
  'icons/pink-noise.svg',
  'icons/rain.svg',
  'icons/sound-wave.svg',
  'icons/storm.svg',
  'icons/stream.svg',
  'icons/summer-night.svg',
  'icons/train.svg',
  'icons/waves.svg',
  'icons/white-noise.svg',
  'icons/wind.svg',
  'sounds/birds.ogg',
  'sounds/boat.ogg',
  'sounds/city.ogg',
  'sounds/coffee-shop.ogg',
  'sounds/fireplace.ogg',
  'sounds/rain.ogg',
  'sounds/storm.ogg',
  'sounds/stream.ogg',
  'sounds/summer-night.ogg',
  'sounds/train.ogg',
  'sounds/waves.ogg',
  'sounds/wind.ogg',
  'gnaurals/AcademicPerformanceEnhancement.gnaural',
  'gnaurals/AirplaneTravelAid.gnaural',
  'gnaurals/AndromedaHell.gnaural',
  'gnaurals/C.gnaural',
  'gnaurals/CandyWreck.gnaural',
  'gnaurals/CricketsAndFrogs.gnaural',
  'gnaurals/DaneM_Theta.gnaural',
  'gnaurals/DesertWind.gnaural',
  'gnaurals/DrivingTriplets.gnaural',
  'gnaurals/Gnaural-Breath-Duration-Increase.gnaural',
  'gnaurals/Hyperbolic_conciousness.gnaural',
  'gnaurals/Hyperbolic_conciousness_sharpened.gnaural',
  'gnaurals/MuthShip.gnaural',
  'gnaurals/OoohEeeeh.gnaural',
  'gnaurals/Penfold.gnaural',
  'gnaurals/Slingspray.gnaural',
  'gnaurals/ToadsAndBugs.gnaural',
  'gnaurals/euphoria_roisin.gnaural',
  'gnaurals/generated-waves.gnaural',
  'gnaurals/mFunk.gnaural',
  'gnaurals/schedule.gnaural',
  'gnaurals/subterranean.gnaural',
  'gnaurals/waves.gnaural',
  'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin === self.location.origin) {
    if (event.request.mode === 'navigate') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => caches.match('index.html'))
      );
      return;
    }

    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
