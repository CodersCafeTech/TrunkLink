const express = require('express');
const webPush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Generate VAPID keys using `web-push generate-vapid-keys`
const vapidKeys = {
    publicKey: 'BFtX42XNx31EmwuVegKXPhX6bW8AiVOEACYRmB6Lz1-uAAee7IIF5YXX8e7U4fNzYe6x2GNkP8YYPq9sdyXVu10',
    privateKey: 'U0oflm5ZMaeVnV-4pn5hX3s2sueA1V64TzhesGojwAI',
};

// Configure web-push
webPush.setVapidDetails(
    'mailto:example@yourdomain.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Firebase configuration
const FIREBASE_DATABASE_URL = 'https://geofence-5bdcc-default-rtdb.firebaseio.com';

// Store subscriptions with location (use a database in production)
// Structure: { subscription: {...}, location: {latitude, longitude}, userInfo: {...} }
let subscribers = [];

// Track last known elephant locations to detect changes
let lastElephantLocations = {};

// Alert cooldown to prevent spam (5 minutes per elephant per user)
let alertCooldowns = new Map(); // key: `${userId}_${elephantId}`, value: timestamp

// Distance calculation (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Check if alert is in cooldown
function isInCooldown(userId, elephantId) {
    const key = `${userId}_${elephantId}`;
    const lastAlert = alertCooldowns.get(key);
    if (!lastAlert) return false;

    const cooldownPeriod = 5 * 60 * 1000; // 5 minutes in milliseconds
    return (Date.now() - lastAlert) < cooldownPeriod;
}

// Set alert cooldown
function setCooldown(userId, elephantId) {
    const key = `${userId}_${elephantId}`;
    alertCooldowns.set(key, Date.now());
}

// Fetch elephant locations from Firebase
async function fetchElephantLocations() {
    return new Promise((resolve, reject) => {
        https.get(`${FIREBASE_DATABASE_URL}/elephants.json`, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const elephants = JSON.parse(data);
                    resolve(elephants);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Parse nested location data structure
function getLatestLocation(locations) {
    if (!locations) return null;

    let latestLocation = null;
    let latestTimestamp = 0;

    Object.values(locations).forEach(locationData => {
        // Handle nested structure: uplink_message.decoded_payload
        let location = locationData;
        if (locationData.uplink_message && locationData.uplink_message.decoded_payload) {
            location = locationData.uplink_message.decoded_payload;
        }

        const lat = location.latitude || location.lat;
        const lng = location.longitude || location.lng;
        const timestamp = location.timestamp;

        if (timestamp && lat && lng) {
            const timestampMs = new Date(timestamp).getTime();
            if (timestampMs > latestTimestamp) {
                latestTimestamp = timestampMs;
                latestLocation = {
                    latitude: lat,
                    longitude: lng,
                    timestamp: timestamp,
                    alert_type: location.alert_type || 'routine_update'
                };
            }
        }
    });

    return latestLocation;
}

// Send push notification to a specific subscriber
async function sendPushToSubscriber(subscriber, title, body, elephantId, distance) {
    try {
        const notificationPayload = JSON.stringify({
            title,
            body,
            data: {
                elephantId,
                distance: distance.toFixed(2),
                timestamp: new Date().toISOString()
            }
        });

        await webPush.sendNotification(subscriber.subscription, notificationPayload);
        console.log(`✅ Push sent to subscriber: ${title} (${distance.toFixed(2)}km)`);
        return true;
    } catch (error) {
        console.error('❌ Error sending push notification:', error);

        // Remove invalid subscriptions
        if (error.statusCode === 410) {
            console.log('🗑️  Removing expired subscription');
            const index = subscribers.indexOf(subscriber);
            if (index > -1) {
                subscribers.splice(index, 1);
            }
        }
        return false;
    }
}

// Check proximity and send alerts
async function checkProximityAndAlert() {
    if (subscribers.length === 0) {
        console.log('⏭️  No subscribers, skipping proximity check');
        return;
    }

    console.log(`🔍 Checking proximity for ${subscribers.length} subscribers...`);

    try {
        const elephants = await fetchElephantLocations();

        if (!elephants) {
            console.log('⚠️  No elephant data available');
            return;
        }

        const elephantIds = Object.keys(elephants);
        console.log(`🐘 Found ${elephantIds.length} elephants`);

        let alertsSent = 0;

        // Check each subscriber against each elephant
        for (const subscriber of subscribers) {
            if (!subscriber.location) {
                console.log('⚠️  Subscriber has no location, skipping');
                continue;
            }

            const userId = subscriber.userInfo?.phone || subscriber.userInfo?.email || 'unknown';

            for (const elephantId of elephantIds) {
                const elephant = elephants[elephantId];

                if (!elephant.locations) {
                    continue;
                }

                const latestLocation = getLatestLocation(elephant.locations);

                if (!latestLocation) {
                    continue;
                }

                // Calculate distance
                const distance = calculateDistance(
                    subscriber.location.latitude,
                    subscriber.location.longitude,
                    latestLocation.latitude,
                    latestLocation.longitude
                );

                console.log(`📏 Distance from subscriber to ${elephantId}: ${distance.toFixed(2)}km`);

                // Check if within 5km and not in cooldown
                if (distance <= 5) {
                    if (isInCooldown(userId, elephantId)) {
                        console.log(`⏸️  Alert for ${elephantId} is in cooldown for user ${userId}`);
                        continue;
                    }

                    console.log(`🚨 ALERT: ${elephantId} within 5km of subscriber (${distance.toFixed(2)}km)`);

                    const success = await sendPushToSubscriber(
                        subscriber,
                        '🚨 Elephant Within Perimeter',
                        `An elephant is ${distance.toFixed(2)}km away from your location. Seek shelter and stay safe!`,
                        elephantId,
                        distance
                    );

                    if (success) {
                        alertsSent++;
                        setCooldown(userId, elephantId);
                    }
                }
            }
        }

        if (alertsSent > 0) {
            console.log(`✅ Sent ${alertsSent} proximity alerts`);
        }

    } catch (error) {
        console.error('❌ Error in proximity check:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        subscribers: subscribers.length,
        message: 'TrunkLink Push Service with Proximity Monitoring'
    });
});

// Enhanced subscribe endpoint that stores location
app.post('/subscribe', (req, res) => {
    const { subscription, location, userInfo } = req.body;

    if (!subscription) {
        return res.status(400).json({ error: 'Subscription object is required' });
    }

    // Store subscriber with location
    const subscriber = {
        subscription: subscription,
        location: location || null,
        userInfo: userInfo || {},
        subscribedAt: new Date().toISOString()
    };

    subscribers.push(subscriber);
    console.log(`✅ New subscriber added (Total: ${subscribers.length})`);

    if (location) {
        console.log(`📍 Subscriber location: ${location.latitude}, ${location.longitude}`);
    }

    res.status(201).json({
        success: true,
        message: 'Subscribed successfully',
        subscriberCount: subscribers.length
    });
});

// Manual notify endpoint (sends to all subscribers)
app.post('/notify', (req, res) => {
    const { title, body } = req.body;

    if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
    }

    console.log(`📢 Manual notification: "${title}"`);

    const notificationPayload = JSON.stringify({ title, body });

    const promises = subscribers.map((subscriber) =>
        webPush.sendNotification(subscriber.subscription, notificationPayload)
            .catch(error => {
                console.error('Error sending to subscriber:', error);
                return null;
            })
    );

    Promise.all(promises)
        .then((results) => {
            const successCount = results.filter(r => r !== null).length;
            res.status(200).json({
                message: 'Notifications sent',
                total: subscribers.length,
                successful: successCount
            });
        })
        .catch((error) => {
            console.error('Error sending notifications', error);
            res.status(500).json({ error: 'Failed to send notifications' });
        });
});

// Update subscriber location
app.post('/update-location', (req, res) => {
    const { subscriptionEndpoint, location } = req.body;

    if (!subscriptionEndpoint || !location) {
        return res.status(400).json({ error: 'subscriptionEndpoint and location are required' });
    }

    const subscriber = subscribers.find(s => s.subscription.endpoint === subscriptionEndpoint);

    if (subscriber) {
        subscriber.location = location;
        console.log(`📍 Updated location for subscriber`);
        res.json({ success: true, message: 'Location updated' });
    } else {
        res.status(404).json({ error: 'Subscriber not found' });
    }
});

// Get status
app.get('/status', (req, res) => {
    res.json({
        subscribers: subscribers.length,
        monitoring: 'active',
        cooldowns: alertCooldowns.size,
        uptime: process.uptime()
    });
});

// Start monitoring elephant locations
const MONITORING_INTERVAL = 10000; // Check every 10 seconds

setInterval(() => {
    checkProximityAndAlert();
}, MONITORING_INTERVAL);

console.log(`🔄 Proximity monitoring started (checking every ${MONITORING_INTERVAL / 1000}s)`);

// Initial check after 5 seconds
setTimeout(() => {
    checkProximityAndAlert();
}, 5000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 TrunkLink Push Server running on port ${PORT}`);
    console.log(`📡 Firebase: ${FIREBASE_DATABASE_URL}`);
    console.log(`👥 Monitoring proximity for subscribers`);
});
