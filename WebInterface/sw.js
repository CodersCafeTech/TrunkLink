// TrunkLink Service Worker for Background Notifications
const CACHE_NAME = 'trunklink-v3';
const urlsToCache = [
  './',
  './index.html',
  './public-alerts-script.js',
  './manifest.json',
  './login.html',
  './dashboard.html',
  './style.css',
  './login-style.css',
  './script.js',
  './login-script.js'
];

// Enhanced storage for persistent monitoring
let isBackgroundMonitoringActive = false;
let userSubscriptionData = null;
let lastElephantCheck = 0;

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Enhanced background sync with persistent monitoring
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-elephant-sync') {
    event.waitUntil(performBackgroundElephantCheck());
  } else if (event.tag === 'activate-monitoring') {
    event.waitUntil(activateBackgroundMonitoring());
  }
});

// Enhanced push notification handling
self.addEventListener('push', (event) => {
  let notificationData;

  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData = { title: event.data.text() };
    }
  } else {
    notificationData = { title: 'TrunkLink Alert' };
  }

  const options = {
    body: notificationData.body || 'Elephant proximity alert',
    icon: '/icons/elephant-icon-192.png',
    badge: '/icons/elephant-badge-72.png',
    vibrate: [300, 200, 300, 200, 300],
    requireInteraction: true,
    persistent: true,
    tag: notificationData.tag || 'elephant-alert',
    renotify: true,
    actions: [
      {
        action: 'view',
        title: '📍 View Location',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'dismiss',
        title: '✖️ Dismiss',
        icon: '/icons/dismiss-icon.png'
      }
    ],
    data: {
      elephantId: notificationData.elephantId,
      distance: notificationData.distance,
      timestamp: Date.now(),
      userLocation: notificationData.userLocation
    }
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Enhanced notification click handling
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  if (action === 'view') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        // If app is already open, focus it
        for (const client of clientList) {
          if (client.url.includes('public-alerts.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow('/public-alerts.html');
        }
      })
    );
  }

  notification.close();
});

// Background elephant proximity checking with Firebase
async function performBackgroundElephantCheck() {
  try {
    if (!userSubscriptionData) {
      // Try to retrieve from IndexedDB
      userSubscriptionData = await getStoredSubscriptionData();
    }

    if (!userSubscriptionData || !userSubscriptionData.location) {
      console.log('No user location data for background check');
      return;
    }

    // Fetch elephant data from Firebase
    const elephantData = await fetchElephantData();

    if (elephantData) {
      await checkProximityAndNotify(elephantData, userSubscriptionData);
    }

    lastElephantCheck = Date.now();
  } catch (error) {
    console.error('Background elephant check failed:', error);
  }
}

// Fetch elephant data using Firebase REST API
async function fetchElephantData() {
  try {
    const response = await fetch('https://geofence-5bdcc-default-rtdb.firebaseio.com/elephants.json');
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch elephant data:', error);
  }
  return null;
}

// Helper function to get the latest location from locations array
function getLatestLocation(locations) {
  if (!locations) return null;

  let latestLocation = null;
  let latestTimestamp = 0;

  Object.values(locations).forEach(location => {
    if (location.timestamp && location.latitude && location.longitude) {
      const timestamp = new Date(location.timestamp).getTime();
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestLocation = location;
      }
    }
  });

  return latestLocation;
}

// Check proximity and send notifications
async function checkProximityAndNotify(elephants, userData) {
  if (!elephants || !userData.location) return;

  const userLat = userData.location.latitude;
  const userLng = userData.location.longitude;
  const alertRadius = 5; // 5km radius

  Object.keys(elephants).forEach(async (elephantKey) => {
    const elephant = elephants[elephantKey];

    if (elephant.locations) {
      const latestLocation = getLatestLocation(elephant.locations);

      if (latestLocation && latestLocation.latitude && latestLocation.longitude) {
        const distance = calculateDistance(
          userLat, userLng,
          parseFloat(latestLocation.latitude),
          parseFloat(latestLocation.longitude)
        );

        if (distance <= alertRadius) {
          // Create a mock livelocation object for compatibility
          const elephantWithLiveLocation = {
            ...elephant,
            livelocation: {
              lat: latestLocation.latitude,
              lng: latestLocation.longitude,
              timestamp: latestLocation.timestamp
            }
          };
          await sendProximityNotification(elephantKey, elephantWithLiveLocation, distance, userData);
        }
      }
    }
  });
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Send proximity notification
async function sendProximityNotification(elephantKey, elephantData, distance, userData) {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;

  // Check if we've sent a recent notification for this elephant
  const lastNotificationKey = `last_notification_${elephantKey}`;
  const lastNotification = await getStoredValue(lastNotificationKey);

  if (lastNotification && (now - lastNotification) < thirtyMinutes) {
    return; // Don't send duplicate notifications within 30 minutes
  }

  const isCritical = distance < 2;
  const title = isCritical ? '🚨 CRITICAL: Elephant Very Close!' : '⚠️ Elephant Alert';
  const body = `Elephant detected ${distance.toFixed(1)}km from your location. ${
    isCritical ? 'Seek safe shelter immediately!' : 'Exercise caution and avoid the area.'
  }`;

  // Send notification
  await self.registration.showNotification(title, {
    body: body,
    icon: '/icons/elephant-icon-192.png',
    badge: '/icons/elephant-badge-72.png',
    vibrate: isCritical ? [500, 200, 500, 200, 500] : [200, 100, 200],
    requireInteraction: isCritical,
    persistent: true,
    tag: `elephant-${elephantKey}`,
    renotify: true,
    data: {
      elephantId: elephantKey,
      distance: distance,
      timestamp: now,
      userLocation: userData.location,
      elephantLocation: elephantData.livelocation,
      isCritical: isCritical
    }
  });

  // Store notification timestamp
  await storeValue(lastNotificationKey, now);
}

// Activate background monitoring
async function activateBackgroundMonitoring() {
  isBackgroundMonitoringActive = true;

  // Set up periodic background sync (every 5 minutes)
  const intervalId = setInterval(async () => {
    if (isBackgroundMonitoringActive) {
      await performBackgroundElephantCheck();
    } else {
      clearInterval(intervalId);
    }
  }, 5 * 60 * 1000); // 5 minutes

  console.log('Background monitoring activated');
}

// Enhanced message handling
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'ACTIVATE_MONITORING':
      userSubscriptionData = data;
      storeSubscriptionData(data);
      activateBackgroundMonitoring();
      event.ports[0].postMessage({ success: true });
      break;

    case 'DEACTIVATE_MONITORING':
      isBackgroundMonitoringActive = false;
      clearStoredSubscriptionData();
      event.ports[0].postMessage({ success: true });
      break;

    case 'UPDATE_LOCATION':
      if (userSubscriptionData) {
        userSubscriptionData.location = data.location;
        storeSubscriptionData(userSubscriptionData);
      }
      break;
  }
});

// Storage utilities using IndexedDB
async function storeSubscriptionData(data) {
  try {
    const db = await openDB();
    const transaction = db.transaction(['subscriptions'], 'readwrite');
    const store = transaction.objectStore('subscriptions');
    await store.put(data, 'current');
  } catch (error) {
    console.error('Failed to store subscription data:', error);
  }
}

async function getStoredSubscriptionData() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['subscriptions'], 'readonly');
    const store = transaction.objectStore('subscriptions');
    return await store.get('current');
  } catch (error) {
    console.error('Failed to get subscription data:', error);
    return null;
  }
}

async function clearStoredSubscriptionData() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['subscriptions'], 'readwrite');
    const store = transaction.objectStore('subscriptions');
    await store.delete('current');
  } catch (error) {
    console.error('Failed to clear subscription data:', error);
  }
}

async function storeValue(key, value) {
  try {
    const db = await openDB();
    const transaction = db.transaction(['general'], 'readwrite');
    const store = transaction.objectStore('general');
    await store.put(value, key);
  } catch (error) {
    console.error('Failed to store value:', error);
  }
}

async function getStoredValue(key) {
  try {
    const db = await openDB();
    const transaction = db.transaction(['general'], 'readonly');
    const store = transaction.objectStore('general');
    return await store.get(key);
  } catch (error) {
    console.error('Failed to get stored value:', error);
    return null;
  }
}

// IndexedDB setup
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TrunkLinkDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('subscriptions')) {
        db.createObjectStore('subscriptions');
      }

      if (!db.objectStoreNames.contains('general')) {
        db.createObjectStore('general');
      }
    };
  });
}