# TrunkLink Push Server with Proximity Monitoring

This enhanced version of the Push server includes automatic elephant proximity monitoring and alerts.

## Features

- ✅ Stores subscriber location when they subscribe
- ✅ Monitors Firebase for elephant location updates every 10 seconds
- ✅ Calculates distance between subscribers and elephants
- ✅ Sends push notifications when elephants are within 5km
- ✅ Alert cooldown (5 minutes) to prevent spam
- ✅ Automatic cleanup of expired subscriptions
- ✅ Works even when frontend is closed

## Deployment Steps

### Option 1: Deploy to Render (Recommended)

1. **Update your existing Render deployment:**
   - Go to https://dashboard.render.com
   - Find your `push-ej51` service
   - Go to "Settings" → "Build & Deploy"
   - Change "Start Command" from `node server.js` to `node server-with-proximity.js`
   - Click "Save Changes"
   - Click "Manual Deploy" → "Deploy latest commit"

2. **Or create a new deployment:**
   - Push the updated code to GitHub
   - Create a new Web Service on Render
   - Connect your GitHub repository
   - Use these settings:
     - **Name**: trunklink-push
     - **Start Command**: `node server-with-proximity.js`
     - **Environment**: Node
     - **Instance Type**: Free

### Option 2: Test Locally

1. **Install dependencies:**
   ```bash
   cd /tmp/Push/server
   npm install
   ```

2. **Run the server:**
   ```bash
   node server-with-proximity.js
   ```

3. **Update frontend to use local server:**
   - In `public-alerts-script.js`, change:
     ```javascript
     const BACKEND_URL = 'http://localhost:4000';
     ```

## How It Works

### 1. Subscription Flow
```
User subscribes → Frontend sends:
{
  subscription: {...push subscription...},
  userInfo: { name, phone, email },
  location: { latitude, longitude, accuracy }
}
→ Backend stores subscriber with location
```

### 2. Monitoring Loop (every 10 seconds)
```
Backend fetches elephant locations from Firebase
↓
For each subscriber:
  For each elephant:
    Calculate distance
    ↓
    If distance ≤ 5km AND not in cooldown:
      Send push notification
      Set 5-minute cooldown
```

### 3. Push Notification
```
Backend → Web Push Protocol → Service Worker → User Device
(Works even when browser is closed!)
```

## API Endpoints

### POST `/subscribe`
Subscribe a user with location

**Request:**
```json
{
  "subscription": {
    "endpoint": "https://...",
    "keys": {...}
  },
  "userInfo": {
    "name": "John Doe",
    "phone": "+91 98765 43210",
    "email": "john@example.com"
  },
  "location": {
    "latitude": 12.10763,
    "longitude": 75.57633,
    "accuracy": 50
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscribed successfully",
  "subscriberCount": 5
}
```

### POST `/update-location`
Update subscriber location (for users who move)

**Request:**
```json
{
  "subscriptionEndpoint": "https://...",
  "location": {
    "latitude": 12.11000,
    "longitude": 75.58000
  }
}
```

### POST `/notify`
Manual notification to all subscribers

**Request:**
```json
{
  "title": "Test Alert",
  "body": "This is a test message"
}
```

### GET `/status`
Get server status

**Response:**
```json
{
  "subscribers": 5,
  "monitoring": "active",
  "cooldowns": 3,
  "uptime": 1234.56
}
```

## Configuration

### Monitoring Interval
Change how often the server checks for proximity (default: 10 seconds)
```javascript
const MONITORING_INTERVAL = 10000; // milliseconds
```

### Alert Distance
Change the proximity threshold (default: 5km)
```javascript
if (distance <= 5) { // Change this value
```

### Cooldown Period
Change how long before the same user gets another alert for the same elephant (default: 5 minutes)
```javascript
const cooldownPeriod = 5 * 60 * 1000; // milliseconds
```

### Firebase Database URL
Update if using a different Firebase project
```javascript
const FIREBASE_DATABASE_URL = 'https://geofence-5bdcc-default-rtdb.firebaseio.com';
```

## Testing

### 1. Check server status
```bash
curl https://push-ej51.onrender.com/status
```

### 2. Add test elephant location
```bash
curl -X PUT "https://geofence-5bdcc-default-rtdb.firebaseio.com/elephants/elephant1/locations/-test.json" \
  -H "Content-Type: application/json" \
  -d '{"uplink_message":{"decoded_payload":{"latitude":12.10578,"longitude":75.5762,"timestamp":"2025-09-30T18:00:00.000Z","alert_type":"routine_update"}}}'
```

### 3. Monitor server logs
On Render dashboard:
- Go to your service
- Click "Logs" tab
- Watch for:
  - `🔍 Checking proximity for X subscribers...`
  - `🚨 ALERT: elephant1 within 5km...`
  - `✅ Push sent to subscriber...`

## Troubleshooting

### No alerts sent
- Check server logs for "No subscribers"
- Verify frontend is calling `/subscribe` with location
- Check Firebase has elephant data

### Alerts not received
- Check browser notification permission
- Verify service worker is registered
- Check console for push errors

### Too many alerts
- Increase cooldown period
- Check elephant location isn't updating too frequently

## Frontend Changes Required

The frontend has already been updated to send location with subscription. Make sure:

1. ✅ User grants location permission
2. ✅ `sendSubscriptionToBackend()` includes location
3. ✅ BACKEND_URL points to the new server

## Production Recommendations

1. **Use a database** instead of in-memory array:
   - MongoDB, PostgreSQL, or Firebase
   - Store: subscriptions, locations, cooldowns

2. **Add authentication**:
   - Protect endpoints
   - Verify subscriber identity

3. **Error handling**:
   - Retry failed push notifications
   - Log errors to monitoring service

4. **Rate limiting**:
   - Prevent abuse of `/notify` endpoint

5. **Scaling**:
   - Use Redis for cooldown tracking
   - Horizontal scaling with load balancer

## Support

For issues or questions:
- GitHub: https://github.com/ShebinJoseJacob/Push
- Email: (your email)
