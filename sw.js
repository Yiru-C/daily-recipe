const CACHE_NAME = 'shitang-daily-v3';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

// 安装：缓存 App 的基础文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );

  // 不等待旧 Service Worker 失效
  self.skipWaiting();
});

// 激活：删除旧版本缓存
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

// 请求策略
self.addEventListener('fetch', event => {
  const request = event.request;

  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 不处理其他域名的请求
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML / 页面导航：
  // 优先访问网络，确保部署新版本后可以立即获取新版 index.html
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(async () => {
          // 没网时再使用缓存
          const cached = await caches.match(request);

          if (cached) {
            return cached;
          }

          return caches.match('./index.html');
        })
    );

    return;
  }

  // manifest、图片等静态文件：
  // 优先使用缓存，同时后台检查更新
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const networkFetch = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(() => null);

      if (cachedResponse) {
        // 后台更新缓存
        event.waitUntil(networkFetch);
        return cachedResponse;
      }

      return networkFetch;
    })
  );
});

// 收到页面发来的更新命令时立即启用新版
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
