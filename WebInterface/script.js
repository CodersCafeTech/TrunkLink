// Firebase configuration (replace with your Firebase project config)
const firebaseConfig = {
  apiKey: "AIzaSyAfZA-Ons-ouIpTifNZ3ncCgK7qdsKv2ms",
  authDomain: "geofence-5bdcc.firebaseapp.com",
  databaseURL: "https://geofence-5bdcc-default-rtdb.firebaseio.com",
  projectId: "geofence-5bdcc",
  storageBucket: "geofence-5bdcc.firebasestorage.app",
  messagingSenderId: "554894296621",
  appId: "1:554894296621:web:c22dacd39c4bafb2545aa4"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Authentication and Session Management
class SessionManager {
  static getSession() {
    const sessionData = localStorage.getItem('trunklink_session') ||
                       sessionStorage.getItem('trunklink_session');

    if (!sessionData) return null;

    try {
      const session = JSON.parse(sessionData);
      if (Date.now() > session.expires) {
        this.clearSession();
        return null;
      }
      return session;
    } catch (error) {
      this.clearSession();
      return null;
    }
  }

  static clearSession() {
    localStorage.removeItem('trunklink_session');
    sessionStorage.removeItem('trunklink_session');
  }

  static isAuthenticated() {
    const session = this.getSession();
    return session !== null;
  }

  static getCurrentUser() {
    const session = this.getSession();
    return session ? session.user : null;
  }

  static hasPermission(permission) {
    const user = this.getCurrentUser();
    return user && user.permissions && user.permissions.includes(permission);
  }
}

// Authentication check - redirect to login if not authenticated
function checkAuthentication() {
  if (!SessionManager.isAuthenticated()) {
    alert('Session expired. Please log in again.');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Initialize user info display
function initializeUserDisplay() {
  const user = SessionManager.getCurrentUser();
  if (!user) return;

  // Update dashboard title with user info
  const dashboardTitle = document.querySelector('h1');
  if (dashboardTitle) {
    dashboardTitle.innerHTML = `
      <div class="flex justify-between items-center">
        <span>TrunkLink Dashboard</span>
        <div class="user-info text-sm font-normal">
          <span class="text-green-600">${user.name}</span>
          <span class="text-gray-500">(${user.role.replace('_', ' ').toUpperCase()})</span>
        </div>
      </div>
    `;
  }

  // Log dashboard access
  database.ref('dashboard_access').push({
    ranger_id: user.id,
    ranger_name: user.name,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    page: 'dashboard'
  });
}

// Enhanced logout function
function logout() {
  const user = SessionManager.getCurrentUser();

  if (user) {
    // Log logout event
    database.ref('access_logs').push({
      ranger_id: user.id,
      ranger_name: user.name,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      action: 'logout'
    });
  }

  SessionManager.clearSession();
  alert('You have been logged out successfully.');
  window.location.href = 'login.html';
}
let splineLayer = null;

// Initialize the map
const map = L.map('map').setView([11.937828, 75.603890], 13); // Center at initial location

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Feature group to store drawn items (geofence)
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Initialize the draw control
const drawControl = new L.Control.Draw({
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      shapeOptions: {
        color: '#3388ff'
      }
    },
    circle: false,
    rectangle: false,
    marker: false
  },
  edit: {
    featureGroup: drawnItems
  }
});
map.addControl(drawControl);

// Variable to store the live location marker
let liveMarker = null;

// Function to update the live location marker
function updateLiveMarker(lat, lng) {
  if (liveMarker) {
    // Update the existing marker's position
    liveMarker.setLatLng([lat, lng]);
  } else {
    // Create a new marker if it doesn't exist
    liveMarker = L.marker([lat, lng]).addTo(map);
  }

  // Add a popup to the marker with the live location
  liveMarker.bindPopup(`<b>Live Location</b><br>Latitude: ${lat}<br>Longitude: ${lng}`).openPopup();
}

// Event listener for when a polygon is created
map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;
  drawnItems.addLayer(layer);
  updateCoordinates(layer);

  // Print the geofence in the specified format to the console
  const coordinates = layer.getLatLngs()[0].map(latlng => `${latlng.lat},${latlng.lng}`).join('|');
  console.log("Geofence Coordinates:", coordinates);
});

// Event listener for when a polygon is edited
map.on(L.Draw.Event.EDITED, function (event) {
  const layers = event.layers;
  layers.eachLayer(function (layer) {
    updateCoordinates(layer);
  });
});

// Function to update the displayed coordinates
function updateCoordinates(layer) {
  const coordinates = layer.getLatLngs()[0].map(latlng => [latlng.lat, latlng.lng]);
  document.getElementById('coordinates').textContent = JSON.stringify(coordinates, null, 2);
}

// Function to save geofence
function saveGeofence() {
  // Check authentication and permissions
  if (!checkAuthentication()) return;

  if (!SessionManager.hasPermission('manage_geofence')) {
    alert('Access denied. You do not have permission to save geofences.');
    return;
  }

  const selectedElephant = document.getElementById('elephantSelect').value;
  const layers = drawnItems.getLayers();
  if (layers.length > 0) {
    const layer = layers[0];
    const coordinates = layer.getLatLngs()[0].map(latlng => `${latlng.lat},${latlng.lng}`).join('|') + '|';
    const user = SessionManager.getCurrentUser();

    database.ref('elephants/' + selectedElephant + '/geofence').set({
      coordinates: coordinates,
      created_by: user.name,
      ranger_id: user.id,
      created_at: firebase.database.ServerValue.TIMESTAMP
    })
    .then(() => {
      alert(`${selectedElephant} geofence saved by ${user.name}!`);

      // Log geofence creation
      database.ref('geofence_logs').push({
        action: 'create',
        elephant: selectedElephant,
        ranger_id: user.id,
        ranger_name: user.name,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        coordinates: coordinates
      });
    })
    .catch((error) => {
      console.error('Error saving geofence: ', error);
      alert('Failed to save geofence.');
    });
  } else {
    alert('No geofence drawn!');
  }

  loadGeofence();
}

// Function to load geofence
function loadGeofence() {
  const selectedElephant = document.getElementById('elephantSelect').value;
  database.ref('elephants/' + selectedElephant + '/geofence').once('value')
    .then((snapshot) => {
      if (snapshot.exists()) {
        let savedGeofence = snapshot.val().coordinates;
        if (savedGeofence.endsWith('|')) {
          savedGeofence = savedGeofence.slice(0, -1);
        }
        const coordinates = savedGeofence.split('|').map(pair => {
          const [lat, lng] = pair.split(',');
          return [parseFloat(lat), parseFloat(lng)];
        });
        drawnItems.clearLayers();
        const polygon = L.polygon(coordinates, { color: '#3388ff' }).addTo(drawnItems);
        map.fitBounds(polygon.getBounds());
        alert(`${selectedElephant} geofence loaded!`);
      } else {
        alert(`No geofence found for ${selectedElephant}!`);
      }
    })
    .catch((error) => {
      console.error('Error loading geofence: ', error);
      alert('Failed to load geofence.');
    });
}


// Function to handle map clicks in marker mode
function onMapClick(e) {
  const lat = e.latlng.lat; // Latitude of the clicked location
  const lng = e.latlng.lng; // Longitude of the clicked location

  // Remove the previous marker (if any)
  if (liveMarker) {
    map.removeLayer(liveMarker);
  }

  // Add a new marker at the clicked location
  liveMarker = L.marker([lat, lng]).addTo(map);

  // Add a popup to the marker with the clicked location
  liveMarker.bindPopup(`<b>Clicked Location</b><br>Latitude: ${lat.toFixed(6)}<br>Longitude: ${lng.toFixed(6)}`).openPopup();

  // Publish marker to Firebase Realtime Database
  database.ref('markers').set({
    lat: lat,
    lng: lng
  })
  .then(() => {
    console.log('Marker saved to Firebase Realtime Database!');
  })
  .catch((error) => {
    console.error('Error saving marker: ', error);
  });
}

function fetchElephants() {
  database.ref('elephants').once('value')
    .then((snapshot) => {
      const select = document.getElementById('elephantSelect');

      if (snapshot.exists()) {
        const elephants = snapshot.val();

        // Clear existing options
        select.innerHTML = '';

        // Add a default "Select Elephant" option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'SELECT ELEPHANT';
        select.appendChild(defaultOption);

        // Loop through the elephants and create options for each
        Object.keys(elephants).forEach((elephantKey) => {
          const option = document.createElement('option');
          option.value = elephantKey;
          option.textContent = elephantKey.toUpperCase();
          select.appendChild(option);
        });
      } else {
        console.error('No elephants found in Firebase.');
      }
    })
    .catch((error) => {
      console.error('Error loading elephants from Firebase:', error);
    });
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

function loadLiveLocation(elephantKey) {
  database.ref(`elephants/${elephantKey}/locations`).once('value')
    .then((snapshot) => {
      const locations = snapshot.val();
      console.log(locations)

      const latestLocation = getLatestLocation(locations);

      if (latestLocation && latestLocation.latitude && latestLocation.longitude) {
        const lat = parseFloat(latestLocation.latitude);
        const lng = parseFloat(latestLocation.longitude);

        // Update map view to the live location
        map.setView([lat, lng], 13);

        // Add a marker to the live location
        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`<b>${elephantKey.toUpperCase()}</b><br>Lat: ${lat} <br> Lon: ${lng}<br>Updated: ${new Date(latestLocation.timestamp).toLocaleString()}`).openPopup();
      } else {
        console.log(`No live location found for ${elephantKey.toUpperCase()}`);
      }
    })
    .catch((error) => {
      console.error('Error loading live location for elephant:', error);
    });
}

// Event listener for when the user selects an elephant
document.getElementById('elephantSelect').addEventListener('change', function() {
  const selectedElephant = this.value;

  if (selectedElephant) {
    drawnItems.clearLayers();
    if (splineLayer) {
      map.removeLayer(splineLayer);
    }
    // Load live location for the selected elephant
    loadLiveLocation(selectedElephant);
  }
});

// Function to retrieve and draw the spline
function drawSpline() {
  if (splineLayer) {
    map.removeLayer(splineLayer);
  }

  const selectedElephant = document.getElementById('elephantSelect').value;
  const locationRef = database.ref('elephants/' + selectedElephant + '/locations');
  locationRef.once('value', (snapshot) => {
    console.log(snapshot.val());
    const locations = [];
    snapshot.forEach((childSnapshot) => {
      const data = childSnapshot.val();
      if (data.latitude && data.longitude) {
        locations.push({
          lat: data.latitude,
          lng: data.longitude,
          timestamp: data.timestamp
        });
      }
    });

    // Sort locations by timestamp
    locations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Extract coordinates in the order of time
    const coordinates = locations.map(loc => [loc.lat, loc.lng]);

    // Draw the spline
    if (coordinates.length > 1) {
      splineLayer = L.curve(
        [
          'M', coordinates[0], // Start at the first coordinate
          ...coordinates.slice(1).flatMap((coord) => ['L', coord]) // Draw lines to subsequent coordinates
        ],
        { color: 'blue', weight: 3 }
      ).addTo(map);
    }
  });
}

// ===== GEOFENCE MONITORING AND ALERT SYSTEM =====

// Push notification backend configuration
const PUSH_BACKEND_URL = 'https://push-ej51.onrender.com';

// Store for tracking geofence breaches (prevent duplicate alerts)
const geofenceBreaches = new Map();

// Store current alert data for map navigation
let currentAlertData = null;

// Helper function to check if a point is inside a polygon (Ray Casting Algorithm)
function isPointInPolygon(point, polygon) {
  const x = point.lat, y = point.lng;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

// Show floating alert card on dashboard
function showAlertCard(elephantId, alertType, elephantLocation) {
  const alertCard = document.getElementById('alertCard');
  const alertTitle = document.getElementById('alertTitle');
  const alertMessage = document.getElementById('alertMessage');
  const alertLocation = document.getElementById('alertLocation');
  const alertTime = document.getElementById('alertTime');

  // Store alert data for map navigation
  currentAlertData = {
    elephantId: elephantId,
    location: elephantLocation
  };

  // Configure alert based on type
  if (alertType === 'breach') {
    alertCard.className = 'alert-card breach';
    alertTitle.innerHTML = '<i class="fas fa-exclamation-triangle"></i> GEOFENCE BREACH';
    alertMessage.textContent = `${elephantId} has crossed the geofence boundary! Immediate action required.`;
  } else {
    alertCard.className = 'alert-card return';
    alertTitle.innerHTML = '<i class="fas fa-check-circle"></i> GEOFENCE RE-ENTRY';
    alertMessage.textContent = `${elephantId} has returned inside the geofence boundary.`;
  }

  // Update location and time
  alertLocation.textContent = `Location: ${elephantLocation.lat.toFixed(6)}, ${elephantLocation.lng.toFixed(6)}`;
  alertTime.textContent = `Time: ${new Date().toLocaleTimeString()}`;

  // Show the alert card
  alertCard.classList.remove('hidden');

  // Play alert sound (optional)
  if (alertType === 'breach') {
    playAlertSound();
  }

  // Auto-hide after 30 seconds for return alerts
  if (alertType === 'return') {
    setTimeout(() => {
      if (!alertCard.classList.contains('hidden')) {
        closeAlert();
      }
    }, 30000);
  }
}

// Close alert card
function closeAlert() {
  const alertCard = document.getElementById('alertCard');
  alertCard.classList.add('hidden');
  currentAlertData = null;
}

// Dismiss alert (same as close but acknowledges)
function dismissAlert() {
  closeAlert();
}

// View alert location on map
function viewAlertOnMap() {
  if (currentAlertData) {
    const { elephantId, location } = currentAlertData;

    // Center map on alert location
    map.setView([location.lat, location.lng], 15);

    // Add temporary marker
    const alertMarker = L.marker([location.lat, location.lng], {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).addTo(map);

    alertMarker.bindPopup(`<b>⚠️ ${elephantId} Alert</b><br>Lat: ${location.lat.toFixed(6)}<br>Lng: ${location.lng.toFixed(6)}`).openPopup();

    // Remove marker after 10 seconds
    setTimeout(() => {
      map.removeLayer(alertMarker);
    }, 10000);
  }
}

// Play alert sound
function playAlertSound() {
  // Create audio context for alert sound
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.warn('Could not play alert sound:', error);
  }
}

// Send push notification to rangers
async function sendGeofenceAlert(elephantId, alertType, geofenceData, elephantLocation) {
  try {
    console.log(`🚨 Sending geofence alert for ${elephantId}...`);

    const title = alertType === 'breach'
      ? `🚨 GEOFENCE BREACH: ${elephantId}`
      : `✅ ${elephantId} Re-entered Geofence`;

    const body = alertType === 'breach'
      ? `${elephantId} has crossed the geofence boundary! Immediate action required.`
      : `${elephantId} has returned inside the geofence boundary.`;

    // Show floating alert card on dashboard
    showAlertCard(elephantId, alertType, elephantLocation);

    // Send to Push notification backend
    const response = await fetch(`${PUSH_BACKEND_URL}/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title,
        body: body
      })
    });

    if (response.ok) {
      console.log(`✅ Geofence alert sent for ${elephantId}`);

      // Log alert to Firebase
      database.ref('geofence_alerts').push({
        elephant_id: elephantId,
        alert_type: alertType,
        location: elephantLocation,
        geofence_created_by: geofenceData.created_by,
        ranger_id: geofenceData.ranger_id,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    } else {
      console.error('❌ Failed to send geofence alert');
    }
  } catch (error) {
    console.error('❌ Error sending geofence alert:', error);
  }
}

// Monitor elephant locations against geofences
function startGeofenceMonitoring() {
  console.log('🔍 Starting geofence monitoring system...');

  // Listen for elephant location updates
  database.ref('elephants').on('value', (elephantsSnapshot) => {
    const elephants = elephantsSnapshot.val();
    if (!elephants) return;

    Object.keys(elephants).forEach(async (elephantKey) => {
      const elephant = elephants[elephantKey];

      // Check if elephant has a geofence
      if (!elephant.geofence || !elephant.geofence.coordinates) {
        return;
      }

      // Get latest elephant location
      let latestLocation = null;
      if (elephant.locations) {
        latestLocation = getLatestLocationFromArray(elephant.locations);
      } else if (elephant.livelocation) {
        latestLocation = {
          lat: parseFloat(elephant.livelocation.lat),
          lng: parseFloat(elephant.livelocation.lng)
        };
      }

      if (!latestLocation) {
        return;
      }

      // Parse geofence coordinates
      let geofenceCoords = elephant.geofence.coordinates;
      if (geofenceCoords.endsWith('|')) {
        geofenceCoords = geofenceCoords.slice(0, -1);
      }

      const polygon = geofenceCoords.split('|').map(pair => {
        const [lat, lng] = pair.split(',');
        return [parseFloat(lat), parseFloat(lng)];
      });

      // Check if elephant is inside geofence
      const isInside = isPointInPolygon(latestLocation, polygon);
      const breachKey = `${elephantKey}_breach`;
      const previousState = geofenceBreaches.get(breachKey);

      // Detect geofence breach (was inside, now outside)
      if (previousState === true && !isInside) {
        console.log(`🚨 GEOFENCE BREACH DETECTED: ${elephantKey}`);
        await sendGeofenceAlert(elephantKey, 'breach', elephant.geofence, latestLocation);
        geofenceBreaches.set(breachKey, false);
      }
      // Detect re-entry (was outside, now inside)
      else if (previousState === false && isInside) {
        console.log(`✅ ${elephantKey} re-entered geofence`);
        await sendGeofenceAlert(elephantKey, 'return', elephant.geofence, latestLocation);
        geofenceBreaches.set(breachKey, true);
      }
      // First time check - set initial state
      else if (previousState === undefined) {
        geofenceBreaches.set(breachKey, isInside);
        console.log(`📍 Initial geofence state for ${elephantKey}: ${isInside ? 'Inside' : 'Outside'}`);
      }
    });
  });
}

// Helper function to get latest location from locations array
function getLatestLocationFromArray(locations) {
  if (!locations) return null;

  let latestLocation = null;
  let latestTimestamp = 0;

  Object.values(locations).forEach(location => {
    if (location.timestamp && location.latitude && location.longitude) {
      const timestamp = new Date(location.timestamp).getTime();
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestLocation = {
          lat: parseFloat(location.latitude),
          lng: parseFloat(location.longitude)
        };
      }
    }
  });

  return latestLocation;
}


// Call the function to load options when the page is loaded
window.onload = function () {
  // Check authentication first
  if (!checkAuthentication()) {
    return;
  }

  // Initialize user display
  initializeUserDisplay();

  // Load elephants
  fetchElephants();

  // Start geofence monitoring system
  startGeofenceMonitoring();
  console.log('✅ Geofence monitoring system activated');

  // Set up periodic session check (every 5 minutes)
  setInterval(() => {
    if (!SessionManager.isAuthenticated()) {
      alert('Session expired. You will be redirected to the login page.');
      window.location.href = 'login.html';
    }
  }, 5 * 60 * 1000);
};