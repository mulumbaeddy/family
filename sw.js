// ============================================
// SERVICE WORKER FOR OFFLINE SUPPORT
// OBUNANGWE BULAIIRE - Family Payment Tracker
// ============================================

const CACHE_NAME = 'obunangwe-v1';
const DYNAMIC_CACHE = 'obunangwe-dynamic-v1';

// Files to cache for offline access
const STATIC_ASSETS = [
  '.',
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  // For API requests - try network first, then cache
  if (event.request.url.includes('/rest/v1/') || event.request.url.includes('/auth/v1/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached response if offline
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For static assets - cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(DYNAMIC_CACHE).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          });
      })
      .catch(() => {
        // Return offline page for HTML requests
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline.html');
        }
        return new Response('You are offline. Please check your connection.', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Background sync for offline operations
self.addEventListener('sync', event => {
  console.log('[Service Worker] Background sync', event.tag);
  if (event.tag === 'sync-payments') {
    event.waitUntil(syncPayments());
  }
});

// Function to sync pending payments when back online
async function syncPayments() {
  const cache = await caches.open(DYNAMIC_CACHE);
  const pendingRequests = await cache.keys();
  
  for (const request of pendingRequests) {
    if (request.url.includes('/rest/v1/payments')) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
          console.log('[Service Worker] Synced payment successfully');
        }
      } catch (error) {
        console.error('[Service Worker] Sync failed:', error);
      }
    }
  }
}

// Push notification support
self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
    body: data.message,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});