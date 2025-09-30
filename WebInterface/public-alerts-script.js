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
  console.log('🔔 Attempting to show notification:', { title, body, permission: Notification.permission });

  if (!('Notification' in window)) {
    console.warn('❌ This browser does not support notifications');
    alert(`Notification: ${title}\n${body}`); // Fallback for unsupported browsers
    return;
  }

  // Check permission status
  if (Notification.permission === 'granted') {
    try {
      // Determine if this is an elephant alert notification
      const isElephantAlert = title.includes('Elephant') || title.includes('CRITICAL') || tag.includes('elephant');

      // Create notification with permanent settings for elephant alerts
      const notification = new Notification(title, {
        body: body,
        icon: icon,
        tag: tag,
        requireInteraction: isElephantAlert, // Make elephant alerts persistent
        vibrate: isElephantAlert ? [500, 200, 500, 200, 500] : [200, 100, 200], // Strong vibration for elephant alerts
        timestamp: Date.now(),
        silent: false,
        // Add actions for better interaction
        ...(!/Android/i.test(navigator.userAgent) && {
          actions: [
            {
              action: 'view',
              title: 'View Details'
            },
            {
              action: 'dismiss',
              title: 'I Am Safe'
            }
          ]
        })
      });

      notification.onclick = function() {
        console.log('📱 Notification clicked');
        window.focus();
        // Only auto-close if not an elephant alert
        if (!isElephantAlert) {
          notification.close();
        }
      };

      notification.onerror = function(error) {
        console.error('❌ Notification error:', error);
      };

      notification.onshow = function() {
        console.log('✅ Notification shown successfully');
      };

      // Only auto-close for non-elephant alerts
      if (!isElephantAlert && !title.includes('Test')) {
        setTimeout(() => {
          notification.close();
        }, 30000);
      }

      return notification;
    } catch (error) {
      console.error('❌ Failed to create notification:', error);
      // Fallback to alert for critical notifications
      if (title.includes('CRITICAL') || title.includes('Test') || title.includes('Elephant')) {
        alert(`${title}\n${body}`);
      }
    }
  } else if (Notification.permission === 'denied') {
    console.warn('❌ Notifications are blocked by user');
    alert(`Notification blocked. Please enable notifications in browser settings.\n\n${title}: ${body}`);
  } else if (Notification.permission === 'default') {
    console.log('❓ Notification permission not granted yet');
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showNotification(title, body, icon, tag);
      }
    });
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

// System-level notification trigger
async function triggerSystemNotification(data) {
  console.log('🚀 Triggering system-level notification:', data);

  try {
    // Check if service worker is available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      console.log('📡 Sending notification via service worker...');

      // Send message to service worker to trigger notification
      const channel = new MessageChannel();

      return new Promise((resolve, reject) => {
        channel.port1.onmessage = (event) => {
          if (event.data.success) {
            console.log('✅ System notification triggered successfully');
            resolve(true);
          } else {
            console.error('❌ System notification failed:', event.data.error);
            reject(new Error(event.data.error));
          }
        };

        // Use the service worker registration to show notification directly
        navigator.serviceWorker.ready.then(registration => {
          return registration.showNotification(data.title, {
            body: data.body,
            icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23ff4444"/%3E%3Ctext x="32" y="38" text-anchor="middle" fill="white" font-size="32"%3E🐘%3C/text%3E%3C/svg%3E',
            badge: 'data:image/svg+xml,%3Csvg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="48" cy="48" r="48" fill="%23ff4444"/%3E%3Ctext x="48" y="58" text-anchor="middle" fill="white" font-size="48"%3E⚠️%3C/text%3E%3C/svg%3E',
            vibrate: [1000, 500, 1000, 500, 1000],
            requireInteraction: true,
            persistent: true,
            silent: false,
            tag: 'elephant-critical-alert',
            renotify: true,
            timestamp: Date.now(),
            actions: [
              {
                action: 'view',
                title: '📍 View Location'
              },
              {
                action: 'safe',
                title: '✅ I Am Safe'
              }
            ],
            data: {
              elephantId: data.elephantId,
              distance: data.distance,
              timestamp: Date.now(),
              userLocation: data.userLocation,
              critical: true
            }
          });
        }).then(() => {
          console.log('✅ System notification shown via service worker registration');
          resolve(true);
        }).catch(error => {
          console.error('❌ Failed to show system notification:', error);
          reject(error);
        });
      });
    } else {
      console.warn('⚠️ Service worker not available, using fallback notification');
      // Fallback to regular notification
      showNotification(data.title, data.body, '🐘', 'elephant-system-fallback');
      return true;
    }
  } catch (error) {
    console.error('❌ Error triggering system notification:', error);
    throw error;
  }
}

// Notification Management
async function requestNotificationPermission() {
  console.log('🔔 Requesting notification permission...');

  if (!('Notification' in window)) {
    console.warn('❌ Notifications not supported in this browser');
    return false;
  }

  console.log('Current notification permission:', Notification.permission);

  if (Notification.permission === 'default') {
    console.log('📝 Requesting user permission for notifications...');

    try {
      const permission = await Notification.requestPermission();
      console.log('User permission response:', permission);

      notificationPermission = permission === 'granted';

      if (permission === 'granted') {
        console.log('✅ Notification permission granted');

        // Test system notification immediately on permission grant
        setTimeout(async () => {
          try {
            await triggerSystemNotification({
              title: '🎉 System Notifications Enabled',
              body: 'You will now receive elephant alerts even when the app is closed!',
              elephantId: 'test',
              distance: 0,
              userLocation: userLocation
            });
          } catch (error) {
            console.warn('Test system notification failed, using fallback');
            showNotification(
              '🎉 Notifications Enabled',
              'You will now receive elephant proximity alerts!',
              '🔔',
              'permission-granted'
            );
          }
        }, 500);
      } else {
        console.warn('❌ Notification permission denied');
      }

      return notificationPermission;
    } catch (error) {
      console.error('❌ Error requesting notification permission:', error);
      return false;
    }
  } else if (Notification.permission === 'granted') {
    console.log('✅ Notification permission already granted');
    notificationPermission = true;
    return true;
  } else {
    console.warn('❌ Notification permission denied by user');
    notificationPermission = false;
    return false;
  }
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
  console.log('🌍 Starting proximity monitoring...');

  if (!subscriptionId) {
    console.error('❌ Cannot start proximity monitoring: No subscription ID');
    return;
  }

  if (!userLocation) {
    console.error('❌ Cannot start proximity monitoring: No user location');
    return;
  }

  console.log('✅ Starting proximity monitoring with:', {
    subscriptionId: subscriptionId,
    userLocation: userLocation
  });

  // Listen for elephant location updates
  database.ref('elephants').on('value', (snapshot) => {
    console.log('🐘 Elephant data update received');

    if (!userLocation) {
      console.warn('⚠️ No user location available for proximity check');
      return;
    }

    const elephants = snapshot.val();
    if (!elephants) {
      console.warn('⚠️ No elephant data received');
      return;
    }

    console.log('📊 Checking proximity for', Object.keys(elephants).length, 'elephants');
    console.log('👤 User location:', userLocation);

    Object.keys(elephants).forEach(elephantKey => {
      const elephant = elephants[elephantKey];
      console.log(`🔍 Checking elephant: ${elephantKey}`, elephant);

      if (elephant.locations) {
        const latestLocation = getLatestLocation(elephant.locations);
        console.log(`📍 Latest location for ${elephantKey}:`, latestLocation);

        if (latestLocation && latestLocation.latitude && latestLocation.longitude) {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            parseFloat(latestLocation.latitude),
            parseFloat(latestLocation.longitude)
          );

          console.log(`📏 Distance to ${elephantKey}: ${distance.toFixed(2)}km`);

          // Check if elephant is within 5km
          if (distance <= 5) {
            console.log(`🚨 PROXIMITY ALERT: ${elephantKey} is within 5km (${distance.toFixed(2)}km)`);

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
          } else {
            console.log(`✅ ${elephantKey} is safe distance: ${distance.toFixed(2)}km`);
          }
        } else {
          console.warn(`⚠️ No valid location data for ${elephantKey}`);
        }
      } else {
        console.warn(`⚠️ No locations array for ${elephantKey}`);
        // Check if it has old livelocation format for backward compatibility
        if (elephant.livelocation) {
          console.log(`🔄 Found old livelocation format for ${elephantKey}`);
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            parseFloat(elephant.livelocation.lat),
            parseFloat(elephant.livelocation.lng)
          );

          console.log(`📏 Distance to ${elephantKey} (old format): ${distance.toFixed(2)}km`);

          if (distance <= 5) {
            console.log(`🚨 PROXIMITY ALERT: ${elephantKey} is within 5km (${distance.toFixed(2)}km) - old format`);
            sendProximityAlert(elephantKey, elephant, distance);
          }
        }
      }
    });
  }, (error) => {
    console.error('❌ Error in proximity monitoring:', error);
  });

  // Log monitoring start
  database.ref(`public_subscribers/${subscriptionId}/monitoring_started`).set(firebase.database.ServerValue.TIMESTAMP);
  console.log('✅ Proximity monitoring started successfully');
}

async function sendProximityAlert(elephantKey, elephantData, distance) {
  console.log(`🚨 Sending proximity alert for ${elephantKey} at ${distance.toFixed(2)}km`);

  const alertKey = `${subscriptionId}_${elephantKey}_${Date.now()}`;

  try {
    // Check if we've already sent an alert for this elephant recently (within 30 minutes)
    console.log('🔍 Checking for recent alerts...');

    const recentAlerts = await database.ref('proximity_alerts')
      .orderByChild('subscriber_id')
      .equalTo(subscriptionId)
      .limitToLast(10)
      .once('value');

    const alerts = recentAlerts.val() || {};
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);

    console.log('📋 Recent alerts:', alerts);

    const recentAlertForElephant = Object.values(alerts).find(alert =>
      alert.elephant_id === elephantKey &&
      alert.timestamp > thirtyMinutesAgo
    );

    if (recentAlertForElephant) {
      console.log(`⏰ Recent alert already sent for ${elephantKey} - skipping`);
      return;
    }

    console.log('✅ No recent alerts found - proceeding with new alert');
  } catch (error) {
    console.error('❌ Error checking recent alerts:', error);
    // Continue with alert anyway
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
    console.log('💾 Saving alert to database:', alertData);
    await database.ref('proximity_alerts/' + alertKey).set(alertData);
    console.log('✅ Alert saved to database successfully');

    // Send system-level notification with your requested message
    const title = '🚨 Elephant Within Perimeter';
    const body = 'Elephant Within Perimeter. Seek Shelter and Stay Safe!';

    console.log('📢 Preparing system-level notification:', { title, body, notificationPermission });

    if (notificationPermission) {
      console.log('🔔 Sending system-level notification...');

      // Send both web notification and system notification
      showNotification(title, body, '🐘', `elephant-${elephantKey}`);

      // Trigger system-level notification via service worker
      await triggerSystemNotification({
        title: title,
        body: body,
        elephantId: elephantKey,
        distance: distance,
        userLocation: userLocation
      });

      // Update notification status
      await database.ref(`proximity_alerts/${alertKey}/sent_notifications/web`).set(true);
      await database.ref(`proximity_alerts/${alertKey}/sent_notifications/system`).set(true);
      console.log('✅ Notification status updated in database');
    } else {
      console.warn('⚠️ Cannot send notification - permission not granted');
      // Show alert as fallback
      alert(`${title}\n\n${body}`);
    }

    // For critical alerts (< 2km), enhance the notification
    if (distance < 2) {
      console.log(`🚨 CRITICAL proximity alert for elephant ${elephantKey} at ${distance.toFixed(1)}km`);
    }

    console.log(`✅ Complete alert process finished for elephant ${elephantKey} at ${distance.toFixed(1)}km`);
  } catch (error) {
    console.error('❌ Error sending proximity alert:', error);
    console.error('Error details:', error);
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

    // Provide more specific error messages with Android-specific handling
    let errorMessage = 'Subscription failed. Please try again.';

    // Check for Android Chrome specific issues
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent);

    if (error.code === 'PERMISSION_DENIED') {
      if (isAndroid) {
        errorMessage = 'Database access denied. This is likely a Firebase security rules issue. Please contact support with error code: ANDROID_PERMISSION_DENIED';
      } else {
        errorMessage = 'Access denied. Please check your internet connection and try again.';
      }
    } else if (error.code === 'NETWORK_ERROR' || error.message.includes('network')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    } else if (error.message.includes('Firebase')) {
      errorMessage = 'Database connection failed. Please try again later.';
    } else if (error.message.includes('permission') || error.message.includes('denied')) {
      errorMessage = 'Database permission error. Please contact support if this persists.';
    } else if (error.message) {
      errorMessage = `Subscription failed: ${error.message}`;
    }

    // Add device info for debugging
    if (isAndroid) {
      errorMessage += ` (Android device detected - ${isChrome ? 'Chrome' : 'Other browser'})`;
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

testNotificationBtn.addEventListener('click', async () => {
  console.log('🧪 Test system notification button clicked');

  // Check notification permission first
  if (Notification.permission !== 'granted') {
    console.log('❓ Requesting notification permission before test...');
    const granted = await requestNotificationPermission();
    if (!granted) {
      alert('Please enable notifications in your browser settings to receive alerts.');
      return;
    }
  }

  console.log('🔔 Testing system-level notification...');

  try {
    // Test both regular and system-level notifications
    showNotification(
      '🚨 Elephant Within Perimeter',
      'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
      '🐘',
      'test-elephant-alert'
    );

    // Test system-level notification
    await triggerSystemNotification({
      title: '🚨 Elephant Within Perimeter (System Test)',
      body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
      elephantId: 'test-elephant',
      distance: 2.5,
      userLocation: userLocation
    });

    // Show success message in UI
    setTimeout(() => {
      console.log('✅ Test notifications sent');
      alert('System notification test sent! This notification should appear even if you close the app or lock your phone.');
    }, 1000);

  } catch (error) {
    console.error('❌ Test notification failed:', error);
    alert('Test notification failed. Please check browser console for details.');
  }
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

// Test Firebase write permissions
async function testFirebaseRules() {
  try {
    const testRef = database.ref('public_subscribers/test_write_' + Date.now());
    await testRef.set({
      test: true,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    await testRef.remove(); // Clean up test data
    console.log('✅ Firebase write test passed');
    return true;
  } catch (error) {
    console.error('❌ Firebase write test failed:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error
    });
    return false;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
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

  // Test Firebase write permissions on page load (helpful for debugging)
  if (database) {
    setTimeout(() => {
      testFirebaseRules().then(success => {
        if (!success) {
          console.warn('⚠️ Firebase write permissions may be restricted. Check database rules.');
        }
      });
    }, 2000);
  }

  // Request notification permission on page load and show status
  requestNotificationPermission().then(granted => {
    console.log('📱 Initial notification permission check:', granted ? 'Granted' : 'Denied/Not requested');

    // Add visual indicator for notification status
    if (granted) {
      console.log('🔔 Notifications are enabled');
    } else {
      console.log('🔕 Notifications are disabled - user will need to enable them manually');
    }
  });

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
  },
  // Debug notification system
  debugNotifications: () => {
    const debug = {
      notificationSupport: 'Notification' in window,
      permission: Notification.permission,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      serviceWorkerSupport: 'serviceWorker' in navigator,
      userLocation: !!userLocation,
      subscriptionId: !!subscriptionId
    };
    console.table(debug);
    return debug;
  },
  // Test proximity monitoring manually
  testProximityAlert: (distance = 3) => {
    if (!userLocation || !subscriptionId) {
      console.error('❌ Cannot test - user location or subscription missing');
      return;
    }
    console.log('🧪 Testing proximity alert...');
    const mockElephantData = {
      livelocation: {
        lat: userLocation.latitude + 0.01,
        lng: userLocation.longitude + 0.01,
        timestamp: new Date().toISOString()
      }
    };
    sendProximityAlert('TEST_ELEPHANT', mockElephantData, distance);
  },
  // Add test elephant location to Firebase
  addTestElephantLocation: async (latitude = 12.10578888, longitude = 75.5762537) => {
    try {
      console.log('🐘 Adding test elephant location to Firebase...');

      if (!userLocation) {
        console.error('❌ No user location available');
        return;
      }

      // Calculate distance from user
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        latitude,
        longitude
      );

      console.log(`📏 Test elephant will be ${distance.toFixed(2)}km from your location`);

      const testElephantId = 'test_elephant_proximity';
      const locationId = '-OHN0VN2137decdTaHuM';

      const locationData = {
        latitude: latitude,
        longitude: longitude,
        timestamp: "2025-09-28T11:15:19.171Z"
      };

      // Add to Firebase
      await database.ref(`elephants/${testElephantId}/locations/${locationId}`).set(locationData);

      console.log('✅ Test elephant location added to Firebase');
      console.log('📍 Location:', locationData);
      console.log(`📏 Distance from you: ${distance.toFixed(2)}km`);

      // Also add a more recent location for real-time testing
      const recentLocationId = 'recent_' + Date.now();
      const recentLocationData = {
        latitude: latitude,
        longitude: longitude,
        timestamp: new Date().toISOString()
      };

      await database.ref(`elephants/${testElephantId}/locations/${recentLocationId}`).set(recentLocationData);
      console.log('✅ Recent test location also added');

      // If within 5km, should trigger alert
      if (distance <= 5) {
        console.log('🚨 Test elephant is within 5km - alert should be triggered!');
      } else {
        console.log('✅ Test elephant is beyond 5km - no alert expected');
      }

      return {
        elephantId: testElephantId,
        distance: distance,
        location: locationData,
        shouldAlert: distance <= 5
      };

    } catch (error) {
      console.error('❌ Error adding test elephant location:', error);
      return null;
    }
  },
  // Check current monitoring status
  getMonitoringStatus: () => {
    return {
      subscriptionId: subscriptionId,
      userLocation: userLocation,
      notificationPermission: notificationPermission,
      isMonitoring: !!subscriptionId && !!userLocation
    };
  },
  // Remove test elephant data
  removeTestElephant: async () => {
    try {
      await database.ref('elephants/test_elephant_proximity').remove();
      console.log('✅ Test elephant data removed');
    } catch (error) {
      console.error('❌ Error removing test elephant:', error);
    }
  }
};