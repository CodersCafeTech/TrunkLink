# Quick Start: Enable Background Push Notifications

## What Changed

The new backend (`server-with-proximity.js`) now:
- ✅ Monitors Firebase for elephant locations every 10 seconds
- ✅ Automatically calculates distances to all subscribers
- ✅ Sends push notifications when elephants are within 5km
- ✅ **Works even when the browser is closed!**

## Deploy in 5 Minutes

### Step 1: Update Render Deployment

Go to: https://dashboard.render.com/web/srv-ctaufu88fa8c73dkndtg

1. Click "Settings" → "Build & Deploy"
2. Change "Start Command" to: `node server-with-proximity.js`
3. Click "Save Changes"
4. Click "Manual Deploy" → "Deploy latest commit"

**Done!** The backend will now send background notifications.

### Step 2: Test It

1. **Subscribe on your phone:**
   - Open https://your-frontend-url.com
   - Grant location permission
   - Fill form and click "Get Protected"

2. **Close the browser completely** (not just minimize)

3. **Add an elephant near you:**
   ```bash
   curl -X PUT "https://geofence-5bdcc-default-rtdb.firebaseio.com/elephants/elephant1/locations/-test.json" \
     -H "Content-Type: application/json" \
     -d '{"uplink_message":{"decoded_payload":{"latitude":12.10578,"longitude":75.5762,"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'","alert_type":"routine_update"}}}'
   ```

4. **Wait 10-20 seconds** → You should get a notification even though the browser is closed!

## How to Monitor

### Check Server Logs
On Render dashboard:
- Go to your service
- Click "Logs"
- Look for:
  ```
  🔍 Checking proximity for 1 subscribers...
  📏 Distance from subscriber to elephant1: 0.21km
  🚨 ALERT: elephant1 within 5km of subscriber (0.21km)
  ✅ Push sent to subscriber: 🚨 Elephant Within Perimeter (0.21km)
  ```

### Check Server Status
```bash
curl https://push-ej51.onrender.com/status
```

Response:
```json
{
  "subscribers": 1,
  "monitoring": "active",
  "cooldowns": 0,
  "uptime": 123.45
}
```

## Files Created

1. **`/tmp/Push/server/server-with-proximity.js`** - Enhanced backend with proximity monitoring
2. **`/tmp/Push/server/DEPLOY_INSTRUCTIONS.md`** - Full documentation
3. **`/tmp/Push/QUICK_START.md`** - This file

## What to Do Next

1. **Deploy the new backend** (see Step 1 above)
2. **Test with your phone** (see Step 2 above)
3. **Remove frontend monitoring** (optional) - Since backend now handles it, you can disable the frontend proximity monitoring to save battery

## Troubleshooting

**No notifications received:**
- Check Render logs - is the backend running?
- Check server status - any subscribers?
- Verify notification permission is granted
- Try manual test: `curl -X POST https://push-ej51.onrender.com/notify -H "Content-Type: application/json" -d '{"title":"Test","body":"Test message"}'`

**Frontend error "Subscription failed":**
- Make sure location permission is granted
- Check console for detailed error
- Verify backend URL is correct

**Alerts too frequent:**
- Backend has 5-minute cooldown per elephant per user
- Check if elephant location is changing rapidly
- Increase cooldown in backend code if needed

## Need Help?

The backend code is fully commented and production-ready. All configuration options are documented in `DEPLOY_INSTRUCTIONS.md`.
