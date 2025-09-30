const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const helmet = require('helmet');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, push, get, remove, serverTimestamp } = require('firebase/database');
const cron = require('node-cron');
const { RateLimiterMemory } = require('rate-limiter-flexible');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting middleware
const rateLimiterMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
};

app.use(rateLimiterMiddleware);

// Initialize Firebase for public database
let db = null;
let firebaseEnabled = false;

try {
  const firebaseConfig = {
    databaseURL: process.env.FIREBASE_DATABASE_URL || "https://geofence-5bdcc-default-rtdb.firebaseio.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "geofence-5bdcc"
  };

  const firebaseApp = initializeApp(firebaseConfig);
  db = getDatabase(firebaseApp);
  firebaseEnabled = true;
  console.log('✅ Firebase initialized for public database');
} catch (error) {
  console.error('❌ Firebase initialization failed:', error.message);
  console.log('🔧 Running without Firebase - using in-memory storage');

  // Mock database for development
  db = {
    ref: () => ({
      set: () => Promise.resolve(),
      once: () => Promise.resolve({ exists: () => false, val: () => null }),
      push: () => Promise.resolve(),
      remove: () => Promise.resolve()
    })
  };
}

// Configure VAPID for web-push
try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@trunklink.com',
    process.env.VAPID_PUBLIC_KEY || 'BIGFGakKm1X-Y3vW5wkUf7T5l8M5lIxHQBtGmrkBzDQXbCsQiX0zSXUPBTdeL9a-D31iSz63exZ8j1oXOsA_w1Q',
    process.env.VAPID_PRIVATE_KEY || 't-Ub8ywR18KjomdyDcgCiuXa39tVGYIO2IDHWG-RqL0'
  );
  console.log('✅ VAPID keys configured for web-push');
} catch (error) {
  console.error('❌ VAPID configuration failed:', error.message);
}

// Utility Functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

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

async function sendPushNotification(subscription, payload) {
  try {
    const result = await webpush.sendNotification(subscription, JSON.stringify(payload));
    console.log('✅ Push notification sent successfully');
    return { success: true, result };
  } catch (error) {
    console.error('❌ Push notification failed:', error);
    if (error.statusCode === 410) {
      return { success: false, expired: true };
    }
    return { success: false, error: error.message };
  }
}

// API Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'TrunkLink Backend API',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /',
      subscribe: 'POST /api/subscribe',
      unsubscribe: 'POST /api/unsubscribe',
      testNotification: 'POST /api/test-notification',
      checkProximity: 'POST /api/check-proximity',
      stats: 'GET /api/stats'
    }
  });
});

// Subscribe to push notifications
app.post('/api/subscribe', async (req, res) => {
  try {
    const { subscription, userInfo, location } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    if (!location || !location.latitude || !location.longitude) {
      return res.status(400).json({ error: 'Location data required' });
    }

    const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    const subscriptionData = {
      id: subscriptionId,
      name: userInfo?.name || 'Anonymous',
      phone: userInfo?.phone || '',
      email: userInfo?.email || '',
      location: location,
      pushSubscription: subscription,
      status: 'active',
      subscribed_at: serverTimestamp(),
      last_updated: serverTimestamp(),
      user_agent: req.headers['user-agent'] || '',
      ip_address: req.ip
    };

    await set(ref(db, 'public_subscribers/' + subscriptionId), subscriptionData);

    console.log(`✅ New subscription: ${subscriptionId}`);

    // Send welcome notification
    setTimeout(async () => {
      await sendPushNotification(subscription, {
        title: '🎉 TrunkLink Subscription Active',
        body: 'You will now receive elephant proximity alerts!',
        icon: 'https://your-domain.com/icon-192.png',
        data: { type: 'welcome' }
      });
    }, 2000);

    res.json({
      success: true,
      subscriptionId: subscriptionId,
      message: 'Successfully subscribed to elephant alerts'
    });

  } catch (error) {
    console.error('❌ Subscription error:', error);
    res.status(500).json({ error: 'Failed to subscribe', details: error.message });
  }
});

// Unsubscribe from notifications
app.post('/api/unsubscribe', async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'Subscription ID required' });
    }

    await remove(ref(db, 'public_subscribers/' + subscriptionId));

    res.json({
      success: true,
      message: 'Successfully unsubscribed'
    });

  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    res.status(500).json({ error: 'Failed to unsubscribe', details: error.message });
  }
});

// Test notification endpoint
app.post('/api/test-notification', async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    let subscriptions = [];

    if (subscriptionId) {
      // Send to specific subscriber
      const snapshot = await get(ref(db, 'public_subscribers/' + subscriptionId));
      if (snapshot.exists()) {
        subscriptions.push({ id: subscriptionId, data: snapshot.val() });
      }
    } else {
      // Send to all subscribers
      const snapshot = await get(ref(db, 'public_subscribers'));
      if (snapshot.exists()) {
        const allSubs = snapshot.val();
        subscriptions = Object.keys(allSubs).map(id => ({ id, data: allSubs[id] }));
      }
    }

    if (subscriptions.length === 0) {
      return res.status(404).json({ error: 'No subscriptions found' });
    }

    const testPayload = {
      title: '🧪 Test Notification',
      body: 'This is a test push notification from TrunkLink!',
      icon: 'https://your-domain.com/icon-192.png',
      data: { type: 'test', timestamp: Date.now() }
    };

    const results = await Promise.all(
      subscriptions.map(async ({ id, data }) => {
        if (data.pushSubscription) {
          const result = await sendPushNotification(data.pushSubscription, testPayload);
          return { subscriptionId: id, ...result };
        }
        return { subscriptionId: id, success: false, error: 'No push subscription' };
      })
    );

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `Test notifications sent to ${successCount}/${results.length} subscribers`,
      results: results
    });

  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification', details: error.message });
  }
});

// Check proximity and send alerts
app.post('/api/check-proximity', async (req, res) => {
  try {
    console.log('🔍 Manual proximity check requested');

    // Get all subscribers
    const subscribersSnapshot = await get(ref(db, 'public_subscribers'));
    if (!subscribersSnapshot.exists()) {
      return res.json({ message: 'No subscribers found' });
    }

    // Get all elephants
    const elephantsSnapshot = await get(ref(db, 'elephants'));
    if (!elephantsSnapshot.exists()) {
      return res.json({ message: 'No elephant data found' });
    }

    const subscribers = subscribersSnapshot.val();
    const elephants = elephantsSnapshot.val();

    let alertsSent = 0;
    let proximityChecks = 0;

    // Check each subscriber against each elephant
    for (const subscriberId of Object.keys(subscribers)) {
      const subscriber = subscribers[subscriberId];

      if (!subscriber.location || !subscriber.pushSubscription || subscriber.status !== 'active') {
        continue;
      }

      for (const elephantId of Object.keys(elephants)) {
        const elephant = elephants[elephantId];
        const latestLocation = getLatestLocation(elephant.locations);

        if (!latestLocation) continue;

        proximityChecks++;

        const distance = calculateDistance(
          subscriber.location.latitude,
          subscriber.location.longitude,
          parseFloat(latestLocation.latitude),
          parseFloat(latestLocation.longitude)
        );

        console.log(`📏 Distance: ${subscriberId} to ${elephantId} = ${distance.toFixed(2)}km`);

        // If within 5km, send alert
        if (distance <= 5) {
          // Check if recent alert exists (prevent spam)
          const recentAlertRef = ref(db, `recent_alerts/${subscriberId}_${elephantId}`);
          const recentSnapshot = await get(recentAlertRef);

          const now = Date.now();
          const thirtyMinutes = 30 * 60 * 1000;

          if (recentSnapshot.exists()) {
            const lastAlert = recentSnapshot.val();
            if ((now - lastAlert.timestamp) < thirtyMinutes) {
              console.log(`⏰ Skipping recent alert for ${subscriberId}-${elephantId}`);
              continue;
            }
          }

          // Send push notification
          const payload = {
            title: '🚨 Elephant Within Perimeter',
            body: 'Elephant Within Perimeter. Seek Shelter and Stay Safe!',
            icon: 'https://your-domain.com/icon-192.png',
            badge: 'https://your-domain.com/badge-72.png',
            vibrate: [1000, 500, 1000, 500, 1000],
            requireInteraction: true,
            tag: `elephant-${elephantId}-${Date.now()}`,
            data: {
              elephantId: elephantId,
              distance: distance.toFixed(1),
              timestamp: now,
              type: 'elephant_proximity'
            }
          };

          const result = await sendPushNotification(subscriber.pushSubscription, payload);

          if (result.success) {
            alertsSent++;

            // Record the alert
            await set(recentAlertRef, { timestamp: now, distance: distance });

            // Log to proximity_alerts
            await push(ref(db, 'proximity_alerts'), {
              subscriber_id: subscriberId,
              elephant_id: elephantId,
              distance_km: distance,
              timestamp: serverTimestamp(),
              notification_sent: true,
              payload: payload
            });

            console.log(`🚨 Alert sent: ${subscriberId} - ${elephantId} (${distance.toFixed(1)}km)`);
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Proximity check completed`,
      stats: {
        subscribers_checked: Object.keys(subscribers).length,
        elephants_checked: Object.keys(elephants).length,
        proximity_checks: proximityChecks,
        alerts_sent: alertsSent
      }
    });

  } catch (error) {
    console.error('❌ Proximity check error:', error);
    res.status(500).json({ error: 'Proximity check failed', details: error.message });
  }
});

// Get system stats
app.get('/api/stats', async (req, res) => {
  try {
    const subscribersSnapshot = await get(ref(db, 'public_subscribers'));
    const elephantsSnapshot = await get(ref(db, 'elephants'));
    const alertsSnapshot = await get(ref(db, 'proximity_alerts'));

    const stats = {
      total_subscribers: subscribersSnapshot.exists() ? Object.keys(subscribersSnapshot.val()).length : 0,
      total_elephants: elephantsSnapshot.exists() ? Object.keys(elephantsSnapshot.val()).length : 0,
      recent_alerts: alertsSnapshot.exists() ? Object.keys(alertsSnapshot.val()).length : 0,
      server_uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json(stats);

  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', details: error.message });
  }
});

// Scheduled proximity monitoring (runs every 2 minutes)
cron.schedule('*/2 * * * *', async () => {
  console.log('🔄 Scheduled proximity check started...');
  try {
    const response = await fetch(`http://localhost:${PORT}/api/check-proximity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    console.log('✅ Scheduled check completed:', result.stats);
  } catch (error) {
    console.error('❌ Scheduled check failed:', error);
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TrunkLink Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  console.log(`🔔 VAPID configured: ${!!process.env.VAPID_PUBLIC_KEY}`);
  console.log(`🔥 Firebase configured: ${!!process.env.FIREBASE_PROJECT_ID}`);
});