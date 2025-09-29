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

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const loginText = document.getElementById('loginText');
const loginSpinner = document.getElementById('loginSpinner');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

// Pre-defined Forest Ranger accounts (In production, these would be in Firebase Auth)
const authorizedRangers = {
  'senior.ranger@forest.gov': {
    password: 'ForestGuard2024',
    role: 'senior_ranger',
    name: 'Senior Ranger Johnson',
    id: 'RANG001',
    permissions: ['full_access', 'manage_geofence', 'view_all_elephants', 'export_data']
  },
  'field.ranger@forest.gov': {
    password: 'ForestGuard2024',
    role: 'field_ranger',
    name: 'Field Ranger Smith',
    id: 'RANG002',
    permissions: ['view_elephants', 'create_alerts', 'view_geofence']
  },
  'ranger.patrol@forest.gov': {
    password: 'ForestGuard2024',
    role: 'patrol_ranger',
    name: 'Patrol Ranger Davis',
    id: 'RANG003',
    permissions: ['view_elephants', 'create_alerts']
  }
};

// Session management
class SessionManager {
  static setSession(user) {
    const sessionData = {
      user: user,
      timestamp: Date.now(),
      expires: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
    };

    sessionStorage.setItem('trunklink_session', JSON.stringify(sessionData));
  }

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
}

// Authentication functions
function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove('hidden');

  // Add shake animation
  errorMessage.style.animation = 'shake 0.5s ease-in-out';
  setTimeout(() => {
    errorMessage.style.animation = '';
  }, 500);
}

function hideError() {
  errorMessage.classList.add('hidden');
}

function setLoading(loading) {
  if (loading) {
    loginButton.disabled = true;
    loginText.classList.add('hidden');
    loginSpinner.classList.remove('hidden');
    emailInput.disabled = true;
    passwordInput.disabled = true;
  } else {
    loginButton.disabled = false;
    loginText.classList.remove('hidden');
    loginSpinner.classList.add('hidden');
    emailInput.disabled = false;
    passwordInput.disabled = false;
  }
}

function validateInput(email, password) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email.trim()) {
    throw new Error('Email address is required');
  }

  if (!emailRegex.test(email)) {
    throw new Error('Please enter a valid email address');
  }

  if (!password.trim()) {
    throw new Error('Password is required');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
}

async function authenticateRanger(email, password) {
  // Simulate network delay for realism
  await new Promise(resolve => setTimeout(resolve, 1000));

  const ranger = authorizedRangers[email.toLowerCase()];

  if (!ranger) {
    throw new Error('Invalid credentials. Access denied for unauthorized personnel.');
  }

  if (ranger.password !== password) {
    throw new Error('Invalid credentials. Incorrect password.');
  }

  // Log access attempt to Firebase for security monitoring
  try {
    await database.ref('access_logs').push({
      ranger_id: ranger.id,
      ranger_name: ranger.name,
      email: email,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      ip_address: 'N/A', // Would be captured on server-side in production
      user_agent: navigator.userAgent,
      success: true
    });
  } catch (error) {
    console.warn('Failed to log access attempt:', error);
  }

  return {
    id: ranger.id,
    name: ranger.name,
    email: email,
    role: ranger.role,
    permissions: ranger.permissions,
    login_time: new Date().toISOString()
  };
}

// Event listeners

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    // Validate input
    validateInput(email, password);

    // Set loading state
    setLoading(true);

    // Authenticate ranger
    const user = await authenticateRanger(email, password);

    // Store session
    SessionManager.setSession(user);

    // Add success visual feedback
    emailInput.classList.add('success');
    passwordInput.classList.add('success');

    // Show success message briefly
    const successMessage = document.createElement('div');
    successMessage.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg mb-4';
    successMessage.innerHTML = `
      <div class="flex items-center">
        <i class="fas fa-check-circle mr-2"></i>
        <span>Authentication successful! Redirecting to dashboard...</span>
      </div>
    `;

    loginForm.insertBefore(successMessage, loginForm.firstChild);

    // Redirect to dashboard after brief delay
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1500);

  } catch (error) {
    console.error('Authentication error:', error);
    showError(error.message);

    // Add error visual feedback
    emailInput.classList.add('error');
    passwordInput.classList.add('error');

    // Remove error styling after 3 seconds
    setTimeout(() => {
      emailInput.classList.remove('error');
      passwordInput.classList.remove('error');
    }, 3000);

    // Log failed access attempt
    try {
      await database.ref('access_logs').push({
        email: email,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        ip_address: 'N/A',
        user_agent: navigator.userAgent,
        success: false,
        error: error.message
      });
    } catch (logError) {
      console.warn('Failed to log failed access attempt:', logError);
    }

  } finally {
    setLoading(false);
  }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  // Check if already authenticated
  if (SessionManager.isAuthenticated()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Focus on email input
  emailInput.focus();
});

// Add shake animation for errors
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);

// Security: Clear sensitive data on page unload
window.addEventListener('beforeunload', () => {
  passwordInput.value = '';
});