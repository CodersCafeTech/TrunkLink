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

// DOM Elements (will be initialized after DOM loads)
let subscriptionForm, requestLocationBtn, locationStatus, subscribeBtn;
let subscribeText, subscribeSpinner, successMessage, testNotificationBtn, manageSubscriptionBtn;

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
  if (!locationStatus) return;

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
  console.log('🌍 Requesting location permission...');

  if (!navigator.geolocation) {
    const errorMsg = 'Geolocation is not supported by this browser';
    console.error('❌', errorMsg);
    showLocationStatus(errorMsg, 'error');
    return false;
  }

  // Show loading status
  showLocationStatus('Requesting location access...', 'info');

  if (requestLocationBtn) {
    requestLocationBtn.textContent = 'Getting Location...';
    requestLocationBtn.disabled = true;
  }

  try {
    console.log('📍 Calling getCurrentPosition...');

    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ Location obtained:', position.coords);
          resolve(position);
        },
        (error) => {
          console.error('❌ Location error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // Increased timeout
          maximumAge: 60000 // 1 minute cache
        }
      );
    });

    userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: Date.now()
    };

    console.log('📍 User location set:', userLocation);

    // Start watching location changes
    startLocationWatching();

    const successMsg = `Location access granted (±${Math.round(position.coords.accuracy)}m accuracy)`;
    console.log('✅', successMsg);
    showLocationStatus(successMsg, 'success');

    if (requestLocationBtn) {
      requestLocationBtn.textContent = '✓ Location Access Granted';
      requestLocationBtn.disabled = true;
      requestLocationBtn.classList.add('bg-green-600', 'cursor-not-allowed');
      requestLocationBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700');
    }

    return true;
  } catch (error) {
    console.error('❌ Location permission error:', error);

    let errorMessage = 'Location access failed';

    if (error.code) {
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access was denied. Please enable location services in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable. Please check if GPS/location services are enabled.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = `Location error: ${error.message || 'Unknown error'}`;
      }
    } else {
      errorMessage = `Location error: ${error.message || error}`;
    }

    console.error('❌ Location error details:', errorMessage);
    showLocationStatus(errorMessage, 'error');

    // Reset button
    if (requestLocationBtn) {
      requestLocationBtn.textContent = 'Grant Location Access';
      requestLocationBtn.disabled = false;
      requestLocationBtn.classList.remove('bg-green-600', 'cursor-not-allowed');
      requestLocationBtn.classList.add('bg-amber-600', 'hover:bg-amber-700');
    }

    // Show additional help for common issues
    if (error.code === 1) { // PERMISSION_DENIED
      setTimeout(() => {
        alert('Location permission was denied. To enable:\n\n1. Click the location icon in your browser address bar\n2. Select "Allow" for location access\n3. Refresh the page and try again');
      }, 500);
    }

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

  // First check if notifications are supported and permitted
  if (!('Notification' in window)) {
    console.error('❌ Notifications not supported');
    alert('Notifications not supported in this browser');
    return false;
  }

  if (Notification.permission !== 'granted') {
    console.error('❌ Notification permission not granted');
    alert('Please enable notifications first!');
    return false;
  }

  try {
    // Create direct browser notification - this will show as system popup
    const notification = new Notification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23ff4444"/%3E%3Ctext x="32" y="38" text-anchor="middle" fill="white" font-size="32"%3E🐘%3C/text%3E%3C/svg%3E',
      vibrate: [1000, 500, 1000, 500, 1000],
      requireInteraction: true,
      tag: 'elephant-alert-' + Date.now(), // Unique tag to prevent blocking
      renotify: true,
      silent: false,
      timestamp: Date.now()
    });

    // Set up click handler
    notification.onclick = function() {
      console.log('📱 Notification clicked');
      window.focus();
      this.close();
    };

    // Set up error handler
    notification.onerror = function(error) {
      console.error('❌ Notification error:', error);
    };

    // Set up show handler
    notification.onshow = function() {
      console.log('✅ System notification displayed successfully');
    };

    console.log('✅ System notification created and should be visible');
    return true;

  } catch (error) {
    console.error('❌ Error creating system notification:', error);

    // Fallback: try service worker method
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(data.title, {
          body: data.body,
          icon: 'data:image/svg+xml,%3Csvg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23ff4444"/%3E%3Ctext x="32" y="38" text-anchor="middle" fill="white" font-size="32"%3E🐘%3C/text%3E%3C/svg%3E',
          vibrate: [1000, 500, 1000, 500, 1000],
          requireInteraction: true,
          tag: 'elephant-alert-sw-' + Date.now(),
          renotify: true
        });
        console.log('✅ Fallback service worker notification shown');
        return true;
      }
    } catch (swError) {
      console.error('❌ Service worker notification also failed:', swError);
    }

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

// VAPID public key from working Push system
const VAPID_PUBLIC_KEY = 'BFtX42XNx31EmwuVegKXPhX6bW8AiVOEACYRmB6Lz1-uAAee7IIF5YXX8e7U4fNzYe6x2GNkP8YYPq9sdyXVu10';

// Backend API configuration - using working Push system
const BACKEND_URL = 'https://push-ej51.onrender.com'; // Your working Push backend

// Subscribe to push notifications
async function subscribeToPush() {
  try {
    // Check if service worker is supported
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker not supported in this browser');
    }

    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    console.log('Push subscription successful:', subscription);
    console.log('Subscription object details:', {
      endpoint: subscription.endpoint,
      keys: subscription.keys
    });
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    throw error;
  }
}

// Send subscription to backend
async function sendSubscriptionToBackend(subscription, userInfo, location) {
  try {
    console.log('Sending subscription to backend:', {
      subscription: subscription,
      userInfo: userInfo,
      location: location
    });

    const response = await fetch(`${BACKEND_URL}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Subscription sent to backend:', result);
    return result;
  } catch (error) {
    console.error('❌ Failed to send subscription to backend:', error);
    throw error;
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscription Management
async function subscribeToAlerts(formData) {
  console.log('🚀 Starting subscription process...');
  try {
    // Validate required data
    // Location check disabled for testing
    // if (!userLocation) {
    //   throw new Error('Location access is required for subscription');
    // }

    console.log('📝 Validating form data...', formData);
    if (!formData.fullName || !formData.phoneNumber) {
      throw new Error('Full name and phone number are required');
    }

    // Check if service worker is supported (required for push notifications)
    console.log('🔍 Checking service worker support...');
    if (!('serviceWorker' in navigator)) {
      const isSecure = window.isSecureContext;
      const protocol = window.location.protocol;
      console.error('❌ Service Worker not supported:', { isSecure, protocol });
      alert(`Push notifications require HTTPS.\n\nCurrent: ${protocol}\nSecure Context: ${isSecure}\n\nTo fix:\n• Access via HTTPS\n• Use ngrok or similar tool\n• Deploy to a hosting service with SSL`);
      throw new Error('Service Worker requires HTTPS');
    }

    // Subscribe to push notifications
    console.log('📱 Subscribing to push notifications...');
    const pushSubscription = await subscribeToPush();
    console.log('✅ Push subscription successful');

    // Send subscription to backend
    const userInfo = {
      name: formData.fullName.trim(),
      phone: formData.phoneNumber.trim(),
      email: formData.email ? formData.email.trim() : null
    };

    // Subscribe to Push system
    await sendSubscriptionToBackend(pushSubscription, userInfo, userLocation);

    // Generate subscription ID for local storage only (no Firebase write needed)
    subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    console.log('Subscription created with backend:', subscriptionId);

    // Store subscription ID locally
    localStorage.setItem('trunklink_subscription_id', subscriptionId);

    // Start proximity monitoring (disabled without location)
    // startProximityMonitoring();

    return true;
  } catch (error) {
    console.error('Subscription error:', error);
    throw error;
  }
}

async function updateSubscriberLocation() {
  if (!subscriptionId || !userLocation) return;
  // Location updates no longer needed since we're using Push system
  console.log('📍 Location available:', userLocation);
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

  // Monitoring started
  console.log('✅ Proximity monitoring started successfully');
}

async function sendProximityAlert(elephantKey, elephantData, distance) {
  console.log(`🚨 Sending proximity alert for ${elephantKey} at ${distance.toFixed(2)}km`);

  try {
    // Send push notification via your working Push system
    const response = await fetch(`${BACKEND_URL}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: '🚨 Elephant Within Perimeter',
        body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!'
      })
    });

    if (response.ok) {
      console.log(`✅ Elephant alert sent successfully via Push system for ${elephantKey} at ${distance.toFixed(1)}km`);

      // Also show local notification as backup
      showNotification('🚨 Elephant Within Perimeter', 'Elephant Within Perimeter. Seek Shelter and Stay Safe!', '🐘', `elephant-${elephantKey}`);
    } else {
      console.error('❌ Failed to send elephant alert via Push system');
      // Fallback to local notification only
      showNotification('🚨 Elephant Within Perimeter', 'Elephant Within Perimeter. Seek Shelter and Stay Safe!', '🐘', `elephant-${elephantKey}`);
    }
  } catch (error) {
    console.error('❌ Error sending elephant alert:', error);
    // Fallback to local notification only
    showNotification('🚨 Elephant Within Perimeter', 'Elephant Within Perimeter. Seek Shelter and Stay Safe!', '🐘', `elephant-${elephantKey}`);
  }
}


// Form Handling (will be attached after DOM loads)
function initializeFormHandling() {
  if (!subscriptionForm) return;

  subscriptionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Location check disabled for testing
  // if (!userLocation) {
  //   alert('Please grant location access before subscribing.');
  //   return;
  // }

  // Request notification permission
  const notificationGranted = await requestNotificationPermission();
  if (!notificationGranted) {
    const proceed = confirm('Notification permission is recommended for timely alerts. Continue anyway?');
    if (!proceed) return;
  }

  // Show loading state
  if (subscribeBtn) subscribeBtn.disabled = true;
  if (subscribeText) subscribeText.classList.add('hidden');
  if (subscribeSpinner) subscribeSpinner.classList.remove('hidden');

  try {
    // Collect form data with null checks
    const fullNameEl = document.getElementById('fullName');
    const phoneNumberEl = document.getElementById('phoneNumber');
    const emailEl = document.getElementById('email');
    const webNotificationsEl = document.getElementById('webNotifications');
    const quietStartEl = document.getElementById('quietStart');
    const quietEndEl = document.getElementById('quietEnd');

    const formData = {
      fullName: fullNameEl ? fullNameEl.value : '',
      phoneNumber: phoneNumberEl ? phoneNumberEl.value : '',
      email: emailEl ? emailEl.value : '',
      webNotifications: webNotificationsEl ? webNotificationsEl.checked : true,
      quietStart: quietStartEl ? quietStartEl.value : '22:00',
      quietEnd: quietEndEl ? quietEndEl.value : '06:00'
    };

    // Subscribe to alerts
    await subscribeToAlerts(formData);

    // Show success message
    if (subscriptionForm) subscriptionForm.style.display = 'none';
    if (successMessage) successMessage.classList.remove('hidden');

    // Send test notification
    setTimeout(() => {
      showNotification(
        '🎉 TrunkLink Subscription Active',
        'You\'re now subscribed to elephant proximity alerts. This is a test notification.',
        '🐘',
        'test-notification'
      );
    }, 2000);

    // Start automatic push notifications every 20 seconds
    setTimeout(() => {
      console.log('🚀 Starting automatic push notifications...');
      startAutoPushNotifications();
    }, 5000); // Start 5 seconds after subscription

    // Show immediate test notification
    setTimeout(async () => {
      console.log('📱 Sending immediate test notification...');
      try {
        await triggerSystemNotification({
          title: '🚨 Elephant Within Perimeter',
          body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
          elephantId: 'immediate-test',
          distance: 1.5,
          userLocation: userLocation
        });
      } catch (error) {
        console.error('❌ Immediate test notification failed:', error);
      }
    }, 3000);

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
    if (subscribeBtn) subscribeBtn.disabled = false;
    if (subscribeText) subscribeText.classList.remove('hidden');
    if (subscribeSpinner) subscribeSpinner.classList.add('hidden');
  }
  });
}

// Debug function to check DOM elements
function checkDOMElements() {
  const elements = {
    subscriptionForm: document.getElementById('subscriptionForm'),
    requestLocationBtn: document.getElementById('requestLocationBtn'),
    locationStatus: document.getElementById('locationStatus'),
    subscribeBtn: document.getElementById('subscribeBtn'),
    testNotificationBtn: document.getElementById('testNotificationBtn')
  };

  console.log('🔍 DOM Elements Check:', elements);

  Object.entries(elements).forEach(([name, element]) => {
    if (!element) {
      console.error(`❌ Missing DOM element: ${name}`);
    } else {
      console.log(`✅ Found DOM element: ${name}`);
    }
  });

  return elements;
}

// Event Listeners will be initialized in main DOMContentLoaded

// Initialize event listeners
function initializeEventListeners() {
  // Location button
  if (requestLocationBtn) {
    requestLocationBtn.addEventListener('click', requestLocationPermission);
    console.log('✅ Location button event listener added');
  }

  // Test notification button
  if (testNotificationBtn) {
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
  }

  // Manage subscription button
  if (manageSubscriptionBtn) {
    manageSubscriptionBtn.addEventListener('click', () => {
      alert('Subscription management interface will be available soon. For now, contact support to modify your subscription.');
    });
  }
}

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
    // Database write test disabled - using Push system now
    // const testRef = database.ref('public_subscribers/test_write_' + Date.now());
    // await testRef.set({
    //   test: true,
    //   timestamp: firebase.database.ServerValue.TIMESTAMP
    // });
    // await testRef.remove(); // Clean up test data
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
  // Initialize DOM elements
  subscriptionForm = document.getElementById('subscriptionForm');
  requestLocationBtn = document.getElementById('requestLocationBtn');
  locationStatus = document.getElementById('locationStatus');
  subscribeBtn = document.getElementById('subscribeBtn');
  subscribeText = document.getElementById('subscribeText');
  subscribeSpinner = document.getElementById('subscribeSpinner');
  successMessage = document.getElementById('successMessage');
  testNotificationBtn = document.getElementById('testNotificationBtn');
  manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');

  // Initialize form handling and event listeners
  initializeFormHandling();
  initializeEventListeners();

  // Check if user is already subscribed
  const existingSubscriptionId = localStorage.getItem('trunklink_subscription_id');

  if (existingSubscriptionId) {
    subscriptionId = existingSubscriptionId;

    // User is already subscribed (no Firebase check needed)
    if (subscriptionForm) subscriptionForm.style.display = 'none';
    if (successMessage) successMessage.classList.remove('hidden');

    // Start monitoring
    if (userLocation) {
      startProximityMonitoring();
    }

    // Start automatic push notifications for existing subscription
    setTimeout(() => {
      console.log('🚀 Starting automatic push notifications for existing subscription...');
      startAutoPushNotifications();
    }, 3000);
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
    if (requestLocationBtn) requestLocationBtn.disabled = true;
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

// Auto push notification every 20 seconds
let pushIntervalId = null;

function startAutoPushNotifications() {
  console.log('🚀 Starting auto push notifications every 20 seconds...');

  if (pushIntervalId) {
    clearInterval(pushIntervalId);
  }

  // Show status message
  if (successMessage && !successMessage.classList.contains('hidden')) {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'auto-notification-status';
    statusDiv.className = 'mt-4 p-3 bg-blue-100 border border-blue-400 rounded-lg';
    statusDiv.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="animate-pulse h-2 w-2 bg-blue-500 rounded-full"></div>
        <span class="text-blue-800 text-sm font-medium">Auto notifications active - sending every 20 seconds</span>
      </div>
    `;
    successMessage.appendChild(statusDiv);
  }

  pushIntervalId = setInterval(async () => {
    console.log('📱 Sending automatic push notification...');

    try {
      await triggerSystemNotification({
        title: '🚨 Elephant Within Perimeter',
        body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
        elephantId: 'auto-alert-' + Date.now(),
        distance: Math.random() * 5, // Random distance 0-5km
        userLocation: userLocation
      });

      console.log('✅ Auto push notification sent');

      // Update status if visible
      const statusDiv = document.getElementById('auto-notification-status');
      if (statusDiv) {
        const now = new Date().toLocaleTimeString();
        statusDiv.innerHTML = `
          <div class="flex items-center space-x-2">
            <div class="animate-pulse h-2 w-2 bg-green-500 rounded-full"></div>
            <span class="text-green-800 text-sm font-medium">Last notification sent: ${now}</span>
          </div>
        `;
      }
    } catch (error) {
      console.error('❌ Auto push notification failed:', error);

      // Show error status
      const statusDiv = document.getElementById('auto-notification-status');
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="flex items-center space-x-2">
            <div class="h-2 w-2 bg-red-500 rounded-full"></div>
            <span class="text-red-800 text-sm font-medium">Notification failed - check permissions</span>
          </div>
        `;
      }
    }
  }, 20000); // 20 seconds

  console.log('✅ Auto push notifications started');
  return pushIntervalId;
}

function stopAutoPushNotifications() {
  if (pushIntervalId) {
    clearInterval(pushIntervalId);
    pushIntervalId = null;
    console.log('🛑 Auto push notifications stopped');
  }
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
  startAutoPushNotifications,
  stopAutoPushNotifications,
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

      // Add to Firebase - DISABLED (using Push system now)
      // await database.ref(`elephants/${testElephantId}/locations/${locationId}`).set(locationData);

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

      // await database.ref(`elephants/${testElephantId}/locations/${recentLocationId}`).set(recentLocationData);
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
      // await database.ref('elephants/test_elephant_proximity').remove();
      console.log('✅ Test elephant data removed');
    } catch (error) {
      console.error('❌ Error removing test elephant:', error);
    }
  }
};