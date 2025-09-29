// Firebase configuration (same as main dashboard)
const firebaseConfig = {
  apiKey: "AIzaSyAfZA-Ons-ouIpTifNZ3ncCgK7qdsKv2ms",
  authDomain: "geofence-5bdcc.firebaseapp.com",
  databaseURL: "https://geofence-5bdcc-default-rtdb.firebaseio.com",
  projectId: "geofence-5bdcc",
  storageBucket: "geofence-5bdcc.firebasestorage.app",
  messagingSenderId: "554894296621",
  appId: "1:554894296621:web:c22dacd39c4bafb2545aa4"
};

// Initialize Firebase with error handling
let app, database;
try {
  app = firebase.initializeApp(firebaseConfig);
  database = firebase.database();

  // Test Firebase connection
  database.ref('.info/connected').on('value', (snapshot) => {
    if (snapshot.val() === true) {
      console.log('Connected to Firebase');
    } else {
      console.log('Disconnected from Firebase');
    }
  });
} catch (error) {
  console.error('Firebase initialization failed:', error);
  alert('Failed to initialize database connection. Please refresh the page and try again.');
}

// Global variables
let userLocation = null;
let locationWatchId = null;
let notificationPermission = false;
let subscriptionId = null;

// DOM Elements
const subscriptionForm = document.getElementById('subscriptionForm');
const requestLocationBtn = document.getElementById('requestLocationBtn');
const locationStatus = document.getElementById('locationStatus');
const subscribeBtn = document.getElementById('subscribeBtn');
const subscribeText = document.getElementById('subscribeText');
const subscribeSpinner = document.getElementById('subscribeSpinner');
const successMessage = document.getElementById('successMessage');
const testNotificationBtn = document.getElementById('testNotificationBtn');
const manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');

// Utility Functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

function generateSubscriptionId() {
  return 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showLocationStatus(message, type = 'info') {
  const colors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600'
  };

  locationStatus.innerHTML = `
    <div class="flex items-center space-x-2">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} ${colors[type]}"></i>
      <span class="${colors[type]}">${message}</span>
    </div>
  `;
}

function showNotification(title, body, icon = '🐘', tag = 'elephant-alert') {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return;
  }

  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body: body,
      icon: icon,
      tag: tag,
      requireInteraction: true, // Keeps notification visible until user interacts
      vibrate: [200, 100, 200], // Vibration pattern for mobile
      timestamp: Date.now(),
      actions: [
        {
          action: 'view',
          title: 'View Details'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    });

    notification.onclick = function() {
      window.focus();
      notification.close();
    };

    // Auto-close after 30 seconds for non-critical alerts
    if (!title.includes('CRITICAL')) {
      setTimeout(() => {
        notification.close();
      }, 30000);
    }

    return notification;
  }
}

// Location Management
async function requestLocationPermission() {
  if (!navigator.geolocation) {
    showLocationStatus('Geolocation is not supported by this browser', 'error');
    return false;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      });
    });

    userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now()
    };

    // Start watching location changes
    startLocationWatching();

    showLocationStatus(
      `Location access granted (±${Math.round(position.coords.accuracy)}m accuracy)`,
      'success'
    );

    requestLocationBtn.textContent = '✓ Location Access Granted';
    requestLocationBtn.disabled = true;
    requestLocationBtn.classList.add('bg-green-600', 'cursor-not-allowed');
    requestLocationBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700');

    return true;
  } catch (error) {
    let errorMessage = 'Location access denied';

    switch(error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location access was denied. Please enable location services.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable.';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out. Please try again.';
        break;
    }

    showLocationStatus(errorMessage, 'error');
    return false;
  }
}

function startLocationWatching() {
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      // Update user location
      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      };

      // Update location in Firebase if user is subscribed
      if (subscriptionId) {
        updateSubscriberLocation();
      }
    },
    (error) => {
      console.warn('Location watch error:', error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000 // 1 minute
    }
  );
}

// Notification Management
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    notificationPermission = permission === 'granted';
    return notificationPermission;
  }

  notificationPermission = Notification.permission === 'granted';
  return notificationPermission;
}

// Subscription Management
async function subscribeToAlerts(formData) {
  try {
    // Validate required data
    if (!userLocation) {
      throw new Error('Location access is required for subscription');
    }

    if (!formData.fullName || !formData.phoneNumber) {
      throw new Error('Full name and phone number are required');
    }

    // Test Firebase connection first with better error handling
    try {
      // Check if we're on localhost vs production
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      // Test connection with timeout for production environments
      const connectionPromise = database.ref('.info/connected').once('value');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Firebase connection timeout')), 10000);
      });

      await Promise.race([connectionPromise, timeoutPromise]);
      console.log('Firebase connection test passed');
    } catch (connectionError) {
      console.error('Firebase connection failed:', connectionError);
      throw new Error('Unable to connect to database. Please check your internet connection and try again.');
    }

    subscriptionId = generateSubscriptionId();
    console.log('Creating subscription with ID:', subscriptionId);

    const subscriptionData = {
      id: subscriptionId,
      name: formData.fullName.trim(),
      phone: formData.phoneNumber.trim(),
      email: formData.email ? formData.email.trim() : null,
      location: userLocation,
      preferences: {
        webNotifications: formData.webNotifications,
        quietHours: {
          start: formData.quietStart,
          end: formData.quietEnd
        }
      },
      status: 'active',
      subscribed_at: firebase.database.ServerValue.TIMESTAMP,
      last_updated: firebase.database.ServerValue.TIMESTAMP,
      last_location_update: firebase.database.ServerValue.TIMESTAMP
    };

    console.log('Attempting to save subscription data:', subscriptionData);

    // Save subscription to Firebase with timeout
    const savePromise = database.ref('public_subscribers/' + subscriptionId).set(subscriptionData);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database write timeout - please try again')), 15000);
    });

    await Promise.race([savePromise, timeoutPromise]);

    console.log('Subscription saved successfully');

    // Store subscription ID locally
    localStorage.setItem('trunklink_subscription_id', subscriptionId);

    // Start proximity monitoring
    startProximityMonitoring();

    return true;
  } catch (error) {
    console.error('Subscription error:', error);
    throw error;
  }
}

async function updateSubscriberLocation() {
  if (!subscriptionId || !userLocation) return;

  try {
    await database.ref(`public_subscribers/${subscriptionId}/location`).set(userLocation);
    await database.ref(`public_subscribers/${subscriptionId}/last_location_update`).set(firebase.database.ServerValue.TIMESTAMP);
  } catch (error) {
    console.error('Location update error:', error);
  }
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

// Proximity Monitoring
function startProximityMonitoring() {
  if (!subscriptionId) return;

  // Listen for elephant location updates
  database.ref('elephants').on('value', (snapshot) => {
    if (!userLocation) return;

    const elephants = snapshot.val();
    if (!elephants) return;

    Object.keys(elephants).forEach(elephantKey => {
      const elephant = elephants[elephantKey];

      if (elephant.locations) {
        const latestLocation = getLatestLocation(elephant.locations);

        if (latestLocation && latestLocation.latitude && latestLocation.longitude) {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            parseFloat(latestLocation.latitude),
            parseFloat(latestLocation.longitude)
          );

          // Check if elephant is within 5km
          if (distance <= 5) {
            // Create a mock livelocation object for compatibility with existing alert system
            const elephantWithLiveLocation = {
              ...elephant,
              livelocation: {
                lat: latestLocation.latitude,
                lng: latestLocation.longitude,
                timestamp: latestLocation.timestamp
              }
            };
            sendProximityAlert(elephantKey, elephantWithLiveLocation, distance);
          }
        }
      }
    });
  });

  // Log monitoring start
  database.ref(`public_subscribers/${subscriptionId}/monitoring_started`).set(firebase.database.ServerValue.TIMESTAMP);
}

async function sendProximityAlert(elephantKey, elephantData, distance) {
  const alertKey = `${subscriptionId}_${elephantKey}_${Date.now()}`;

  // Check if we've already sent an alert for this elephant recently (within 30 minutes)
  const recentAlerts = await database.ref('proximity_alerts')
    .orderByChild('subscriber_id')
    .equalTo(subscriptionId)
    .limitToLast(10)
    .once('value');

  const alerts = recentAlerts.val() || {};
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);

  const recentAlertForElephant = Object.values(alerts).find(alert =>
    alert.elephant_id === elephantKey &&
    alert.timestamp > thirtyMinutesAgo
  );

  if (recentAlertForElephant) {
    console.log(`Recent alert already sent for ${elephantKey}`);
    return;
  }

  // Create alert record
  const alertData = {
    id: alertKey,
    subscriber_id: subscriptionId,
    elephant_id: elephantKey,
    distance_km: distance,
    user_location: userLocation,
    elephant_location: elephantData.livelocation,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    sent_notifications: {
      web: false
    }
  };

  try {
    // Save alert to database
    await database.ref('proximity_alerts/' + alertKey).set(alertData);

    // Send web notification
    const title = distance < 2 ? '🚨 CRITICAL: Elephant Very Close!' : '⚠️ Elephant Alert';
    const body = `Elephant detected ${distance.toFixed(1)}km from your location. ${distance < 2 ? 'Seek safe shelter immediately!' : 'Exercise caution and avoid the area.'}`;

    if (notificationPermission) {
      showNotification(title, body, '🐘', `elephant-${elephantKey}`);

      // Update notification status
      await database.ref(`proximity_alerts/${alertKey}/sent_notifications/web`).set(true);
    }

    // For critical alerts (< 2km), enhance the notification
    if (distance < 2) {
      console.log(`Critical proximity alert for elephant ${elephantKey} at ${distance.toFixed(1)}km`);
    }

    console.log(`Alert sent for elephant ${elephantKey} at ${distance.toFixed(1)}km`);
  } catch (error) {
    console.error('Error sending proximity alert:', error);
  }
}


// Form Handling
subscriptionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!userLocation) {
    alert('Please grant location access before subscribing.');
    return;
  }

  // Request notification permission
  const notificationGranted = await requestNotificationPermission();
  if (!notificationGranted) {
    const proceed = confirm('Notification permission is recommended for timely alerts. Continue anyway?');
    if (!proceed) return;
  }

  // Show loading state
  subscribeBtn.disabled = true;
  subscribeText.classList.add('hidden');
  subscribeSpinner.classList.remove('hidden');

  try {
    // Collect form data
    const formData = {
      fullName: document.getElementById('fullName').value,
      phoneNumber: document.getElementById('phoneNumber').value,
      email: document.getElementById('email').value,
      webNotifications: document.getElementById('webNotifications').checked,
      quietStart: document.getElementById('quietStart').value,
      quietEnd: document.getElementById('quietEnd').value
    };

    // Subscribe to alerts
    await subscribeToAlerts(formData);

    // Show success message
    subscriptionForm.style.display = 'none';
    successMessage.classList.remove('hidden');

    // Send test notification
    setTimeout(() => {
      showNotification(
        '🎉 TrunkLink Subscription Active',
        'You\'re now subscribed to elephant proximity alerts. This is a test notification.',
        '🐘',
        'test-notification'
      );
    }, 2000);

  } catch (error) {
    console.error('Subscription failed:', error);

    // Provide more specific error messages
    let errorMessage = 'Subscription failed. Please try again.';

    if (error.code === 'PERMISSION_DENIED') {
      errorMessage = 'Access denied. Please check your internet connection and try again.';
    } else if (error.code === 'NETWORK_ERROR' || error.message.includes('network')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    } else if (error.message.includes('Firebase')) {
      errorMessage = 'Database connection failed. Please try again later.';
    } else if (error.message) {
      errorMessage = `Subscription failed: ${error.message}`;
    }

    alert(errorMessage);

    // Log detailed error for debugging
    console.error('Detailed error info:', {
      code: error.code,
      message: error.message,
      details: error,
      userLocation: !!userLocation,
      subscriptionId: subscriptionId
    });
  } finally {
    // Reset loading state
    subscribeBtn.disabled = false;
    subscribeText.classList.remove('hidden');
    subscribeSpinner.classList.add('hidden');
  }
});

// Event Listeners
requestLocationBtn.addEventListener('click', requestLocationPermission);

testNotificationBtn.addEventListener('click', () => {
  showNotification(
    '🧪 Test Notification',
    'This is a test elephant alert notification. Your alerts are working correctly!',
    '🐘',
    'test-alert'
  );
});

manageSubscriptionBtn.addEventListener('click', () => {
  // This would open a subscription management interface
  alert('Subscription management interface will be available soon. For now, contact support to modify your subscription.');
});

// Register Service Worker for background functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use relative path for better compatibility with different hosting environments
    const swPath = './sw.js';
    navigator.serviceWorker.register(swPath)
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
      })
      .catch((error) => {
        console.log('Service Worker registration failed:', error);
        console.error('SW registration error details:', error);
      });
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already subscribed
  const existingSubscriptionId = localStorage.getItem('trunklink_subscription_id');

  if (existingSubscriptionId) {
    subscriptionId = existingSubscriptionId;

    // Verify subscription still exists in database
    database.ref('public_subscribers/' + subscriptionId).once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          // User is already subscribed
          subscriptionForm.style.display = 'none';
          successMessage.classList.remove('hidden');

          // Start monitoring
          if (userLocation) {
            startProximityMonitoring();
          }
        } else {
          // Subscription no longer exists, clear local storage
          localStorage.removeItem('trunklink_subscription_id');
          subscriptionId = null;
        }
      })
      .catch((error) => {
        console.error('Error checking existing subscription:', error);
      });
  }

  // Request notification permission on page load
  requestNotificationPermission();

  // Check if geolocation is supported
  if (!navigator.geolocation) {
    showLocationStatus('Geolocation is not supported by this browser', 'error');
    requestLocationBtn.disabled = true;
  }
});

// Handle page visibility changes to manage location watching
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page is hidden, reduce location update frequency
    if (locationWatchId) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
  } else {
    // Page is visible, resume location watching
    if (subscriptionId && userLocation) {
      startLocationWatching();
    }
  }
});

// Handle browser notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data.type === 'NOTIFICATION_CLICK') {
      // Handle notification click
      window.focus();
    }
  });
}

// Export functions for testing
window.TrunkLinkAlerts = {
  calculateDistance,
  showNotification,
  sendProximityAlert: (elephantKey, distance) => {
    const mockElephantData = {
      livelocation: { lat: userLocation.latitude, lng: userLocation.longitude }
    };
    sendProximityAlert(elephantKey, mockElephantData, distance);
  }
};