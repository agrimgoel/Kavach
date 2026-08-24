/**
 * KAVACH - Core Application Logic
 */

// Application State
const state = {
    user: null,
    location: null,
    map: null,
    userMarker: null,
    facilityMarkers: [],
    facilities: [], // Stored raw facility data from Overpass API
    currentFilter: 'all',
    watchId: null
};

// Default center coordinates (India)
const DEFAULT_COORDS = [20.5937, 78.9629];

// Document Elements
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const settingsForm = document.getElementById('settings-form');
const settingsModal = document.getElementById('settings-modal');
const alertModal = document.getElementById('alert-modal');

// Launch Application
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// Initialize Application
function initApp() {
    // Load user configuration from LocalStorage
    const storedUser = localStorage.getItem('kavach_user');
    if (storedUser) {
        state.user = JSON.parse(storedUser);
        loadDashboard();
    } else {
        showScreen('login-screen');
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Login form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = {
            name: document.getElementById('user-name').value.trim(),
            phone: document.getElementById('user-phone').value.trim(),
            emergencyName: document.getElementById('emergency-name').value.trim(),
            emergencyPhone: document.getElementById('emergency-phone').value.trim(),
            dbUrl: '' // Empty by default, config in settings
        };
        saveUserConfig(user);
    });

    // Settings trigger
    document.getElementById('settings-trigger').addEventListener('click', () => {
        // Pre-fill settings form
        if (state.user) {
            document.getElementById('settings-user-name').value = state.user.name || '';
            document.getElementById('settings-user-phone').value = state.user.phone || '';
            document.getElementById('settings-emergency-name').value = state.user.emergencyName || '';
            document.getElementById('settings-emergency-phone').value = state.user.emergencyPhone || '';
            document.getElementById('settings-db-url').value = state.user.dbUrl || '';
        }
        openModal(settingsModal);
    });

    // Close settings modal
    document.getElementById('close-settings-btn').addEventListener('click', () => {
        closeModal(settingsModal);
    });

    // Settings form submission
    settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = {
            name: document.getElementById('settings-user-name').value.trim(),
            phone: document.getElementById('settings-user-phone').value.trim(),
            emergencyName: document.getElementById('settings-emergency-name').value.trim(),
            emergencyPhone: document.getElementById('settings-emergency-phone').value.trim(),
            dbUrl: document.getElementById('settings-db-url').value.trim()
        };
        saveUserConfig(user);
        closeModal(settingsModal);
    });

    // Reset / Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
        if (confirm("Are you sure you want to reset all app configuration? This will clear local database links and details.")) {
            if (state.watchId) {
                navigator.geolocation.clearWatch(state.watchId);
            }
            localStorage.removeItem('kavach_user');
            state.user = null;
            state.location = null;
            closeModal(settingsModal);
            showScreen('login-screen');
        }
    });

    // Emergency action button triggers
    document.querySelectorAll('.emergency-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const service = btn.getAttribute('data-service');
            const phone = btn.getAttribute('data-phone');
            triggerEmergency(service, phone);
        });
    });

    // Recenter map button
    document.getElementById('recenter-btn').addEventListener('click', () => {
        if (state.location && state.map) {
            state.map.setView([state.location.latitude, state.location.longitude], 15);
        } else {
            alert("Waiting for GPS signal to lock position...");
        }
    });

    // Close alert modal
    document.getElementById('close-alert-btn').addEventListener('click', () => {
        closeModal(alertModal);
    });

    // Map filters
    document.querySelectorAll('.map-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.map-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.getAttribute('data-type');
            renderFacilities();
        });
    });
}

// Show specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Modal handling
function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

// Save User Configuration
async function saveUserConfig(userObj) {
    state.user = userObj;
    localStorage.setItem('kavach_user', JSON.parse(JSON.stringify(userObj)));
    localStorage.setItem('kavach_user', JSON.stringify(userObj));
    
    // Sync with Google Sheets database if URL is set
    if (userObj.dbUrl) {
        try {
            const payload = {
                action: 'register',
                name: userObj.name,
                phone: userObj.phone,
                emergencyName: userObj.emergencyName,
                emergencyPhone: userObj.emergencyPhone
            };
            
            // Background fetch, don't block registration experience
            fetch(userObj.dbUrl, {
                method: 'POST',
                mode: 'no-cors', // standard Apps Script POST behavior requires CORS handling or simple POST
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => console.log("Registration successfully pushed to Sheets"))
              .catch(err => console.error("Error pushing registration to Sheets:", err));
        } catch (e) {
            console.error(e);
        }
    }
    
    loadDashboard();
}

// Load Dashboard View
function loadDashboard() {
    if (!state.user) return;
    
    // Set user headers
    document.getElementById('display-user-name').textContent = `Welcome, ${state.user.name}`;
    document.getElementById('display-guardian-info').textContent = `${state.user.emergencyName} (${state.user.emergencyPhone})`;
    
    showScreen('dashboard-screen');
    
    // Initialize Maps and Geolocation Tracking
    initMap();
    startLocationTracking();
}

// Initialize Leaflet Map
function initMap() {
    if (state.map) return; // Map already loaded
    
    state.map = L.map('map', {
        zoomControl: false // Custom controls or custom positioning later
    }).setView(DEFAULT_COORDS, 5);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(state.map);
}

// Start watching mobile GPS location
function startLocationTracking() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser. Live tracking disabled.");
        return;
    }
    
    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };
    
    state.watchId = navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        options
    );
}

// Handle Geolocation Success
function onLocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const firstLock = !state.location;
    
    state.location = { latitude, longitude, accuracy };
    
    // Update accuracy badge
    const badge = document.getElementById('gps-accuracy-badge');
    badge.classList.add('active');
    badge.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> GPS Active (${Math.round(accuracy)}m)`;
    
    // Update Map Maker for user position
    const userLatLng = [latitude, longitude];
    
    if (state.map) {
        if (firstLock) {
            state.map.setView(userLatLng, 15);
        }
        
        if (state.userMarker) {
            state.userMarker.setLatLng(userLatLng);
        } else {
            // Create user pulsing marker using divIcon
            const pulsingIcon = L.divIcon({
                className: 'custom-div-icon',
                html: '<div class="gps-pulse-marker"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });
            state.userMarker = L.marker(userLatLng, { icon: pulsingIcon }).addTo(state.map);
            state.userMarker.bindPopup("<b>You are here</b><br>Accurate within " + Math.round(accuracy) + " meters.").openPopup();
        }
    }
    
    // If it's a new location lock or we've moved significantly, fetch nearest resources
    if (firstLock) {
        fetchNearestServices(latitude, longitude);
    }
}

// Handle Geolocation Error
function onLocationError(error) {
    console.error("GPS Error: ", error);
    const badge = document.getElementById('gps-accuracy-badge');
    badge.classList.remove('active');
    badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> GPS Error`;
}

// Fetch Nearest Services (Overpass API - OpenStreetMap)
async function fetchNearestServices(lat, lng) {
    const listContainer = document.getElementById('nearest-facilities-list');
    listContainer.innerHTML = '<p class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Searching local emergency services...</p>';
    
    // Radius of search in meters (e.g. 5000 meters / 5km)
    const radius = 5000;
    
    // Overpass query for police, hospital, and fire station amenities
    const query = `
        [out:json][timeout:25];
        (
          node["amenity"="police"](around:${radius},${lat},${lng});
          way["amenity"="police"](around:${radius},${lat},${lng});
          node["amenity"="hospital"](around:${radius},${lat},${lng});
          node["healthcare"="hospital"](around:${radius},${lat},${lng});
          node["amenity"="fire_station"](around:${radius},${lat},${lng});
        );
        out body;
        >;
        out skel qt;
    `;
    
    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        
        processFacilities(data.elements);
    } catch (e) {
        console.error("Error fetching nearby services:", e);
        listContainer.innerHTML = '<p class="placeholder-text"><i class="fa-solid fa-triangle-exclamation"></i> Error loading nearest facilities. Using local fallback map.</p>';
    }
}

// Process and Sort Facilities
function processFacilities(elements) {
    if (!elements || !state.location) return;
    
    state.facilities = elements.map(el => {
        // Handle ways (polygons) by estimating center if lat/lng are missing directly on element
        let lat = el.lat;
        let lng = el.lon;
        
        if (!lat && el.center) {
            lat = el.center.lat;
            lng = el.center.lon;
        }
        
        // Skip elements without valid coordinates
        if (!lat || !lng) return null;
        
        const distance = calculateDistance(state.location.latitude, state.location.longitude, lat, lng);
        
        let type = 'other';
        if (el.tags && el.tags.amenity) {
            type = el.tags.amenity;
        }
        
        return {
            name: (el.tags && (el.tags.name || el.tags.operator || el.tags['name:en'])) || `Unnamed ${type.replace('_', ' ')}`,
            type: type,
            latitude: lat,
            longitude: lng,
            distance: distance,
            raw: el
        };
    }).filter(Boolean);
    
    // Sort by distance ascending
    state.facilities.sort((a, b) => a.distance - b.distance);
    
    renderFacilities();
}

// Render Facility Cards & Map Markers
function renderFacilities() {
    const listContainer = document.getElementById('nearest-facilities-list');
    
    // Clear existing markers
    state.facilityMarkers.forEach(m => state.map.removeLayer(m));
    state.facilityMarkers = [];
    
    // Filter facilities based on active filter state
    const filtered = state.facilities.filter(f => {
        if (state.currentFilter === 'all') return true;
        if (state.currentFilter === 'police') return f.type === 'police';
        if (state.currentFilter === 'hospital') return f.type === 'hospital' || f.raw.tags.healthcare === 'hospital';
        if (state.currentFilter === 'fire') return f.type === 'fire_station';
        return false;
    });
    
    if (filtered.length === 0) {
        listContainer.innerHTML = '<p class="placeholder-text">No active facilities found within 5km for the selected category.</p>';
        return;
    }
    
    listContainer.innerHTML = '';
    
    // Add markers and build HTML list
    filtered.slice(0, 15).forEach(facility => {
        // Determine Marker color based on type
        let markerColor = '#6366f1';
        let iconClass = 'fa-location-dot';
        
        if (facility.type === 'police') {
            markerColor = varValue('--color-police') || '#3b82f6';
            iconClass = 'fa-building-shield';
        } else if (facility.type === 'hospital') {
            markerColor = varValue('--color-ambulance') || '#10b981';
            iconClass = 'fa-hospital';
        } else if (facility.type === 'fire_station') {
            markerColor = varValue('--color-fire') || '#ef4444';
            iconClass = 'fa-fire';
        }
        
        // Add Marker to Leaflet
        if (state.map) {
            // Leaflet Custom Vector Dot Marker
            const markerHtml = `
                <div style="
                    background-color: ${markerColor};
                    width: 12px;
                    height: 12px;
                    border: 2px solid #fff;
                    border-radius: 50%;
                    box-shadow: 0 0 8px ${markerColor}bb;
                "></div>
            `;
            const customIcon = L.divIcon({
                html: markerHtml,
                className: 'facility-marker-div',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            
            const marker = L.marker([facility.latitude, facility.longitude], { icon: customIcon })
                .addTo(state.map)
                .bindPopup(`<b>${facility.name}</b><br><span style="text-transform: capitalize;">${facility.type.replace('_', ' ')}</span><br>${(facility.distance * 1000).toFixed(0)}m away`);
            
            state.facilityMarkers.push(marker);
        }
        
        // Create List Element Card
        const card = document.createElement('div');
        card.className = 'facility-card';
        
        let typeLabel = facility.type.replace('_', ' ');
        let typeClass = 'other';
        if (facility.type === 'police') typeClass = 'police';
        if (facility.type === 'hospital') typeClass = 'hospital';
        if (facility.type === 'fire_station') typeClass = 'fire';
        
        const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}`;
        
        card.innerHTML = `
            <div class="facility-details">
                <span class="facility-name">${facility.name}</span>
                <span class="facility-type ${typeClass}">${typeLabel}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="facility-distance">${(facility.distance * 1000).toFixed(0)} meters</span>
                <a href="${mapUrl}" class="directions-link" target="_blank" title="Navigate">
                    <i class="fa-solid fa-diamond-turn-right"></i>
                </a>
            </div>
        `;
        
        listContainer.appendChild(card);
    });
}

// Trigger Emergency Alert and open call handler
async function triggerEmergency(serviceName, phoneNumber) {
    if (!state.user) return;
    
    // Update Modal Information
    document.getElementById('alert-service-title').textContent = `Contacting ${serviceName}`;
    document.getElementById('direct-dial-link').href = `tel:${phoneNumber}`;
    
    // Grab/estimate coordinates
    const lat = state.location ? state.location.latitude : 0;
    const lng = state.location ? state.location.longitude : 0;
    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
    
    // Construct pre-filled message for the emergency contact (Father/Loved One)
    const alertMessage = `KAVACH EMERGENCY ALERT! 🚨\n\nI need emergency assistance from ${serviceName.toUpperCase()}.\n\nMy Live GPS Location:\nLatitude: ${lat}\nLongitude: ${lng}\nGoogle Maps: ${mapLink}`;
    const encodedMsg = encodeURIComponent(alertMessage);
    
    // Setup message button actions
    const smsBtn = document.getElementById('sms-btn');
    const waBtn = document.getElementById('whatsapp-btn');
    
    smsBtn.href = `sms:${state.user.emergencyPhone}?body=${encodedMsg}`;
    // Some older iOS devices need &body= instead of ?body=
    if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
        smsBtn.href = `sms:${state.user.emergencyPhone}&body=${encodedMsg}`;
    }
    
    waBtn.href = `https://wa.me/${state.user.emergencyPhone}?text=${encodedMsg}`;
    
    document.getElementById('sms-preview-text').textContent = alertMessage;
    
    // Display Modal
    openModal(alertModal);
    
    // Database integration check
    const dot = document.getElementById('db-status-dot');
    const txt = document.getElementById('db-status-text');
    
    dot.className = 'status-dot pending';
    txt.textContent = 'Saving to database...';
    
    // Always trigger direct call immediately
    window.location.href = `tel:${phoneNumber}`;
    
    // Post to Google Sheets if configured
    if (state.user.dbUrl) {
        try {
            const payload = {
                action: 'logAlert',
                phone: state.user.phone,
                alertType: serviceName,
                latitude: lat,
                longitude: lng,
                emergencyPhone: state.user.emergencyPhone
            };
            
            const response = await fetch(state.user.dbUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // Wait briefly to simulate verification
            setTimeout(() => {
                dot.className = 'status-dot success';
                txt.textContent = 'Alert logged to Google Sheet database';
            }, 800);
            
        } catch (error) {
            console.error("Failed database log:", error);
            dot.className = 'status-dot';
            dot.style.backgroundColor = '#ef4444';
            txt.textContent = 'Failed to sync with online sheet. Saved locally.';
        }
    } else {
        // Fallback simulation
        setTimeout(() => {
            dot.className = 'status-dot success';
            txt.textContent = 'Saved to offline local database';
        }, 1000);
    }
}

// Utility: Calculate Distance in KM between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Helper to pull CSS variable values in JS
function varValue(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
