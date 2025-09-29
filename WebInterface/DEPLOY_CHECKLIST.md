# TrunkLink Render Deployment Checklist

## Pre-Deployment
- [x] Fixed service worker paths to use relative URLs
- [x] Updated cache version to v3
- [x] Added proper error handling for Firebase connection
- [x] Enhanced subscription error messages
- [x] Created _redirects file for Render

## Firebase Configuration
1. Ensure Firebase project is active and database rules allow writes to:
   - `public_subscribers/`
   - `proximity_alerts/`
   - `elephants/`

2. Database Rules Example:
```json
{
  "rules": {
    "public_subscribers": {
      ".write": true,
      ".read": true
    },
    "proximity_alerts": {
      ".write": true,
      ".read": true
    },
    "elephants": {
      ".read": true
    }
  }
}
```

## Render Settings
- **Build Command**: `echo "Static site - no build needed"`
- **Publish Directory**: `./`
- **Environment**: Production
- **Auto Deploy**: Yes

## Post-Deployment Testing
1. Test location access on HTTPS
2. Test subscription functionality
3. Check browser console for errors
4. Verify service worker registration
5. Test push notifications

## Common Issues & Solutions

### "Subscription failed" errors:
1. Check browser console for specific error
2. Verify Firebase database rules
3. Ensure location permission granted
4. Check network connectivity

### Service Worker not registering:
1. Verify sw.js is accessible at `/sw.js`
2. Check MIME type is `application/javascript`
3. Ensure HTTPS deployment (required for SW)

### Location access denied:
1. HTTPS required for geolocation API
2. User must manually allow location access
3. Check browser privacy settings