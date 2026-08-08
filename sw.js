const CACHE_NAME = 'shitang-daily-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

// ==============================
// 安装 Service Worker
// ==============================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );

  // 新版本安装完成后，不等待旧 SW 退出
  self.skipWaiting();
});


// ==============================
// 激活 Service Worker
// 删除旧版本缓存
// ==============================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );

  // 立即接管已经打开的页面
  self.clients.claim();
});


// ==============================
// 网络请求处理
// ==============================
self.addEventListener('fetch', event => {
  const request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 不处理第三方域名
  if (url.origin !== self.location.origin) {
    return;
  }


  // ==============================
  // HTML 页面
  // Network First
  //
  // 有网络：
  // 优先获取 GitHub Pages 最新版本
  //
  // 没网络：
  // 使用本地缓存
  // ==============================
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const responseClone = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }

          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);

          if (cachedResponse) {
            return cachedResponse;
          }

          return caches.match('./index.html');
        })
    );

    return;
  }


  // ==============================
  // 静态资源
  // Cache First + 后台更新
  // ==============================
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const networkRequest = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const responseClone = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }

          return response;
        })
        .catch(() => null);

      // 如果已经有缓存
      // 立即返回缓存，同时后台更新
      if (cachedResponse) {
        event.waitUntil(networkRequest);
        return cachedResponse;
      }

      // 没有缓存则使用网络
      return networkRequest;
    })
  );
});


// ==============================
// 页面主动要求启用新版 SW
// ==============================
self.addEventListener('message', event => {
  if (
    event.data &&
    event.data.type === 'SKIP_WAITING'
  ) {
    self.skipWaiting();
  }
});
