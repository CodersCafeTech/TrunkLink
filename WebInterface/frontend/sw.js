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

// Real-time Firebase monitoring using periodic sync
let monitoringIntervalId = null;

function startContinuousMonitoring() {
  if (monitoringIntervalId) {
    clearInterval(monitoringIntervalId);
  }

  // Check every 10 seconds for new elephant locations
  monitoringIntervalId = setInterval(async () => {
    try {
      await performBackgroundElephantCheck();
    } catch (error) {
      console.error('Background monitoring error:', error);
    }
  }, 10000); // 10 seconds

  console.log('✅ Continuous monitoring started - checking every 10 seconds');
}

function stopContinuousMonitoring() {
  if (monitoringIntervalId) {
    clearInterval(monitoringIntervalId);
    monitoringIntervalId = null;
    console.log('🛑 Continuous monitoring stopped');
  }
}

// Enhanced push notification handling for system-level notifications
self.addEventListener('push', (event) => {
  console.log('🔔 [SW] Push notification received in service worker');
  console.log('🔔 [SW] Event data:', event.data ? event.data.text() : 'No data');

  let notificationData;

  if (event.data) {
    try {
      notificationData = event.data.json();
      console.log('📊 [SW] Push data parsed:', notificationData);
    } catch (e) {
      console.log('⚠️ [SW] Failed to parse push data, using default');
      notificationData = {
        title: '🚨 Elephant Within Perimeter',
        body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!'
      };
    }
  } else {
    console.log('⚠️ [SW] No push data, using default');

    notificationData = {
      title: '🚨 Elephant Within Perimeter',
      body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!'
    };
  }

  // Create system-level notification options for Android
  const options = {
    body: notificationData.body || 'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
    icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23ff4444"/%3E%3Ctext x="32" y="38" text-anchor="middle" fill="white" font-size="32"%3E🐘%3C/text%3E%3C/svg%3E',
    badge: 'data:image/svg+xml,%3Csvg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="48" cy="48" r="48" fill="%23ff4444"/%3E%3Ctext x="48" y="58" text-anchor="middle" fill="white" font-size="48"%3E⚠️%3C/text%3E%3C/svg%3E',
    vibrate: [1000, 500, 1000, 500, 1000], // Strong vibration pattern
    requireInteraction: true, // Keeps notification until user interacts
    persistent: true,
    silent: false, // Ensure sound plays
    tag: 'elephant-critical-alert', // Prevents duplicate notifications
    renotify: true, // Show even if same tag exists
    timestamp: Date.now(),
    image: 'data:image/svg+xml,%3Csvg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="300" height="150" fill="%23ff4444"/%3E%3Ctext x="150" y="75" text-anchor="middle" fill="white" font-size="48" font-weight="bold"%3E🚨 DANGER 🚨%3C/text%3E%3C/svg%3E',
    actions: [
      {
        action: 'view',
        title: '📍 View Location',
        icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="%2316a34a"/%3E%3C/svg%3E'
      },
      {
        action: 'safe',
        title: '✅ I Am Safe',
        icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="%2316a34a"/%3E%3C/svg%3E'
      }
    ],
    data: {
      elephantId: notificationData.elephantId || 'unknown',
      distance: notificationData.distance || 0,
      timestamp: Date.now(),
      userLocation: notificationData.userLocation,
      url: '/public-alerts.html',
      critical: true
    }
  };

  console.log('📱 Showing system notification with options:', options);

  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
      .then(() => {
        console.log('✅ System notification displayed successfully');

        // Keep service worker alive and send message to client if available
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'NOTIFICATION_SHOWN',
              data: notificationData
            });
          });
        });
      })
      .catch(error => {
        console.error('❌ Failed to show system notification:', error);
      })
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

// Enhanced background elephant proximity checking with Firebase
async function performBackgroundElephantCheck() {
  try {
    console.log('🔍 Performing background elephant check...');

    if (!userSubscriptionData) {
      // Try to retrieve from IndexedDB
      userSubscriptionData = await getStoredSubscriptionData();
    }

    if (!userSubscriptionData || !userSubscriptionData.location) {
      console.log('⚠️ No user location data for background check');
      return;
    }

    console.log('📍 User location found:', userSubscriptionData.location);

    // Fetch elephant data from Firebase
    const elephantData = await fetchElephantData();

    if (elephantData) {
      console.log('🐘 Elephant data retrieved, checking proximity...');
      await checkProximityAndNotify(elephantData, userSubscriptionData);
    } else {
      console.log('📭 No elephant data available');
    }

    lastElephantCheck = Date.now();
    console.log('✅ Background check completed at', new Date().toLocaleTimeString());
  } catch (error) {
    console.error('❌ Background elephant check failed:', error);
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
  const title = '🚨 Elephant Within Perimeter';
  const body = 'Elephant Within Perimeter. Seek Shelter and Stay Safe!';

  // Send notification with permanent settings
  await self.registration.showNotification(title, {
    body: body,
    icon: '/icons/elephant-icon-192.png',
    badge: '/icons/elephant-badge-72.png',
    vibrate: [500, 200, 500, 200, 500], // Strong vibration for elephant alerts
    requireInteraction: true, // Make all elephant notifications permanent
    persistent: true,
    tag: `elephant-${elephantKey}`,
    renotify: true,
    actions: [
      {
        action: 'view',
        title: '📍 View Location',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'safe',
        title: '✅ I Am Safe',
        icon: '/icons/safe-icon.png'
      }
    ],
    data: {
      elephantId: elephantKey,
      distance: distance,
      timestamp: now,
      userLocation: userData.location,
      elephantLocation: elephantData.livelocation,
      isCritical: true // Mark all elephant alerts as critical for permanent display
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