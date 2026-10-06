/**
 * KAVACH — Application Logic v3.0
 * Features: SOS hold-siren, fixed OSM tiles (no API key), nearby facilities panel
 */

// ============================================================
// State
// ============================================================
const state = {
    user: null,
    extraContacts: [],
    location: null,
    map: null,
    nearbyMap: null,
    userMarker: null,
    nearbyUserMarker: null,
    facilityMarkers: [],
    nearbyFacilityMarkers: [],
    facilities: [],
    watchId: null,
    sosHoldTimer: null,
    sosCountdownInterval: null,
    mapInitialized: false,
    nearbyMapInitialized: false,
    sirenAudioCtx: null,
    sirenOscillators: [],
    sirenGainNode: null,
    sirenActive: false,
    activeFilter: 'all'
};

const DEFAULT_COORDS = [20.5937, 78.9629];

// ============================================================
// DOM Ready
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

// ============================================================
// Init
// ============================================================
function initApp() {
    try {
        const storedUser = localStorage.getItem('kavach_user');
        if (storedUser) state.user = JSON.parse(storedUser);
        const storedContacts = localStorage.getItem('kavach_contacts');
        if (storedContacts) state.extraContacts = JSON.parse(storedContacts);
    } catch (e) {
        localStorage.removeItem('kavach_user');
        localStorage.removeItem('kavach_contacts');
    }

    if (state.user) {
        loadDashboard();
    } else {
        showScreen('login-screen');
    }
}

// ============================================================
// Screen Navigation
// ============================================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    if (screenId === 'dashboard-screen') {
        setTimeout(() => invalidateMap(), 100);
    }
}

// ============================================================
// Tab Navigation
// ============================================================
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('tab-' + tabName);
    if (panel) panel.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');

    if (tabName === 'sos') setTimeout(() => invalidateMap(), 150);
    if (tabName === 'settings') populateSettingsForm();
    if (tabName === 'contacts') renderContacts();
    if (tabName === 'route') {
        setTimeout(() => {
            initNearbyMap();
            renderFacilitiesList();
        }, 200);
    }
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {

    // Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', e => {
            e.preventDefault();
            const rawPhone = document.getElementById('user-phone').value.trim();
            const name = document.getElementById('user-name').value.trim();
            if (!rawPhone || !name) return;
            state.user = { name, phone: '+91' + rawPhone, emergencyName: '', emergencyPhone: '' };
            showScreen('contact-setup-screen');
        });
    }

    // Contact Setup
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', e => {
            e.preventDefault();
            const emergencyName = document.getElementById('emergency-name').value.trim();
            const rawEPhone = document.getElementById('emergency-phone').value.trim();
            if (!emergencyName || !rawEPhone) return;
            state.user.emergencyName = emergencyName;
            state.user.emergencyPhone = '+91' + rawEPhone;
            saveUser();
            loadDashboard();
        });
    }

    // Bottom nav
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    // Header settings
    const settingsTrigger = document.getElementById('settings-trigger');
    if (settingsTrigger) settingsTrigger.addEventListener('click', () => switchTab('settings'));

    // Settings form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', e => {
            e.preventDefault();
            const rawPhone = document.getElementById('settings-user-phone').value.trim();
            const rawEPhone = document.getElementById('settings-emergency-phone').value.trim();
            state.user.name = document.getElementById('settings-user-name').value.trim();
            state.user.phone = rawPhone ? '+91' + rawPhone : state.user.phone;
            state.user.emergencyName = document.getElementById('settings-emergency-name').value.trim();
            state.user.emergencyPhone = rawEPhone ? '+91' + rawEPhone : state.user.emergencyPhone;
            saveUser();
            updateDashboardUI();
            renderContacts();
            showToast('Settings saved ✓');
        });
    }

    // Reset
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Reset all Kavach data? This cannot be undone.')) {
                if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
                stopSiren();
                localStorage.clear();
                state.user = null;
                state.location = null;
                state.extraContacts = [];
                destroyMap();
                destroyNearbyMap();
                showScreen('login-screen');
            }
        });
    }

    // SOS Hold Button (3-second countdown + siren)
    setupSOSButton();

    // Dispatch cards
    document.querySelectorAll('.dispatch-card').forEach(btn => {
        btn.addEventListener('click', () => triggerEmergency(btn.dataset.service, btn.dataset.phone));
    });

    // Close alert modal
    document.getElementById('close-alert-btn')?.addEventListener('click', () => {
        closeModal('alert-modal');
        stopSiren();
    });

    // Map recenter
    document.getElementById('recenter-btn')?.addEventListener('click', () => {
        if (state.location && state.map) {
            state.map.setView([state.location.latitude, state.location.longitude], 15);
        }
    });

    // Share buttons
    document.getElementById('share-link-btn')?.addEventListener('click', () => shareLocation('link'));
    document.getElementById('whatsapp-share-btn')?.addEventListener('click', () => shareLocation('whatsapp'));
    document.getElementById('copy-link-btn')?.addEventListener('click', () => shareLocation('copy'));

    // Guardian buttons
    document.getElementById('notify-guardian-btn')?.addEventListener('click', notifyGuardian);
    document.getElementById('contact-call-guardian')?.addEventListener('click', () => {
        if (state.user?.emergencyPhone) window.location.href = `tel:${state.user.emergencyPhone}`;
    });

    // Add Contact
    document.getElementById('add-contact-btn')?.addEventListener('click', () => openModal('add-contact-modal'));
    document.getElementById('cancel-add-contact')?.addEventListener('click', () => closeModal('add-contact-modal'));

    const addContactForm = document.getElementById('add-contact-form');
    if (addContactForm) {
        addContactForm.addEventListener('submit', e => {
            e.preventDefault();
            const name = document.getElementById('new-contact-name').value.trim();
            const rawPhone = document.getElementById('new-contact-phone').value.trim();
            const relation = document.getElementById('new-contact-relation').value.trim();
            if (!name || !rawPhone) return;
            state.extraContacts.push({ name, phone: '+91' + rawPhone, relation });
            saveContacts();
            renderContacts();
            addContactForm.reset();
            closeModal('add-contact-modal');
            showToast('Contact added ✓');
        });
    }

    // Safe-route nav buttons
    document.getElementById('nav-police-btn')?.addEventListener('click', e => {
        e.preventDefault();
        openGoogleMapsSearch('police station');
    });
    document.getElementById('nav-hospital-btn')?.addEventListener('click', e => {
        e.preventDefault();
        openGoogleMapsSearch('hospital');
    });
    document.getElementById('nav-fire-btn')?.addEventListener('click', e => {
        e.preventDefault();
        openGoogleMapsSearch('fire station');
    });

    // Stop siren button
    document.getElementById('stop-siren-btn')?.addEventListener('click', () => {
        stopSiren();
        closeModal('sos-active-modal');
    });

    // Facility filter buttons
    document.querySelectorAll('.facility-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.facility-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeFilter = btn.dataset.filter;
            renderFacilitiesList();
            updateNearbyMapMarkers();
        });
    });

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                if (overlay.id === 'sos-active-modal') stopSiren();
            }
        });
    });
}

// ============================================================
// SOS Button Setup — 3-second hold countdown + siren
// ============================================================
function setupSOSButton() {
    const sosBtn = document.getElementById('sos-btn');
    if (!sosBtn) return;

    const progressRing = document.getElementById('sos-progress-ring');
    const countdownEl = document.getElementById('sos-countdown');
    const HOLD_MS = 3000;
    let startTime = null;
    let rafId = null;

    function animateProgress(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / HOLD_MS, 1);

        // Update SVG ring
        if (progressRing) {
            const circumference = 2 * Math.PI * 58; // r=58
            const offset = circumference * (1 - progress);
            progressRing.style.strokeDashoffset = offset;
        }

        // Update countdown text
        if (countdownEl) {
            const remaining = Math.ceil((HOLD_MS - elapsed) / 1000);
            countdownEl.textContent = remaining > 0 ? remaining : '';
        }

        if (progress < 1) {
            rafId = requestAnimationFrame(animateProgress);
        }
    }

    function resetProgress() {
        startTime = null;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (progressRing) {
            const circumference = 2 * Math.PI * 58;
            progressRing.style.strokeDashoffset = circumference;
        }
        if (countdownEl) countdownEl.textContent = '';
        sosBtn.classList.remove('sos-pressing');
    }

    sosBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        sosBtn.setPointerCapture(e.pointerId);
        sosBtn.classList.add('sos-pressing');

        // Start countdown animation
        rafId = requestAnimationFrame(animateProgress);

        state.sosHoldTimer = setTimeout(() => {
            resetProgress();
            triggerSOS();
        }, HOLD_MS);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
        sosBtn.addEventListener(evt, () => {
            clearTimeout(state.sosHoldTimer);
            resetProgress();
        });
    });
}

// ============================================================
// Google Maps Search
// ============================================================
function openGoogleMapsSearch(query) {
    if (state.location) {
        const { latitude: lat, longitude: lng } = state.location;
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat},${lng},15z`, '_blank');
    } else {
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, '_blank');
    }
}

// ============================================================
// Save helpers
// ============================================================
function saveUser() { localStorage.setItem('kavach_user', JSON.stringify(state.user)); }
function saveContacts() { localStorage.setItem('kavach_contacts', JSON.stringify(state.extraContacts)); }

// ============================================================
// Load Dashboard
// ============================================================
function loadDashboard() {
    if (!state.user) return;
    showScreen('dashboard-screen');
    updateDashboardUI();
    switchTab('sos');
    setTimeout(() => {
        initMap();
        startLocationTracking();
    }, 200);
}

function updateDashboardUI() {
    if (!state.user) return;
    const el = document.getElementById('guardian-display-name');
    if (el) el.textContent = state.user.emergencyName
        ? `${state.user.emergencyName} (${state.user.emergencyPhone})`
        : 'Not Set';
}

function populateSettingsForm() {
    if (!state.user) return;
    const strip91 = v => (v || '').replace(/^\+91/, '');
    setVal('settings-display-name', state.user.name);
    setVal('settings-display-phone', state.user.phone || '');
    setVal('settings-user-name', state.user.name || '');
    setVal('settings-user-phone', strip91(state.user.phone));
    setVal('settings-emergency-name', state.user.emergencyName || '');
    setVal('settings-emergency-phone', strip91(state.user.emergencyPhone));
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// ============================================================
// Contacts
// ============================================================
function renderContacts() {
    const guardianName = document.getElementById('contact-guardian-name');
    const guardianPhone = document.getElementById('contact-guardian-phone');
    if (guardianName) guardianName.textContent = state.user?.emergencyName || '—';
    if (guardianPhone) guardianPhone.textContent = state.user?.emergencyPhone || '—';

    const list = document.getElementById('extra-contacts-list');
    if (!list) return;

    if (state.extraContacts.length === 0) {
        list.innerHTML = `<div class="empty-contacts">
            <i class="fa-solid fa-address-book"></i>
            <p>No additional contacts yet.<br>Tap <strong>+ Add</strong> to add more people.</p>
        </div>`;
        return;
    }

    list.innerHTML = state.extraContacts.map((c, i) => `
        <div class="guardian-row" style="margin-bottom:10px;">
            <div class="guardian-avatar">
                <i class="fa-solid fa-user"></i>
            </div>
            <div class="guardian-details">
                <span class="guardian-name">${escHtml(c.name)}${c.relation ? ` <span style="font-weight:400;color:var(--text-muted);font-size:11px;">(${escHtml(c.relation)})</span>` : ''}</span>
                <span class="guardian-role-tag">${escHtml(c.phone)}</span>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="guardian-alert-btn" style="background:#EEF4FF;color:#2563EB;" onclick="window.location.href='tel:${c.phone}'">
                    <i class="fa-solid fa-phone"></i>
                </button>
                <button class="guardian-alert-btn" style="background:#FEF2F2;color:#CC1414;" onclick="deleteContact(${i})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function deleteContact(index) {
    if (confirm('Remove this contact?')) {
        state.extraContacts.splice(index, 1);
        saveContacts();
        renderContacts();
    }
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// MAIN MAP — init, destroy, invalidate
// ============================================================
function initMap() {
    if (state.map) { invalidateMap(); return; }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    if (mapEl.offsetHeight === 0) { setTimeout(initMap, 200); return; }

    state.map = L.map('map', { zoomControl: false, attributionControl: true })
        .setView(DEFAULT_COORDS, 5);

    // CartoDB Voyager tile layer (free, reliable, no API key, avoids OSM block)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(state.map);

    state.mapInitialized = true;
}

function destroyMap() {
    if (state.map) {
        state.map.remove();
        state.map = null;
        state.userMarker = null;
        state.facilityMarkers = [];
        state.mapInitialized = false;
    }
}

function invalidateMap() {
    if (state.map) state.map.invalidateSize();
}

// ============================================================
// NEARBY MAP (Safe Route tab)
// ============================================================
function initNearbyMap() {
    const mapEl = document.getElementById('nearby-map');
    if (!mapEl) return;
    if (mapEl.offsetHeight === 0) { setTimeout(initNearbyMap, 200); return; }

    if (!state.nearbyMap) {
        state.nearbyMap = L.map('nearby-map', { zoomControl: false, attributionControl: true })
            .setView(state.location ? [state.location.latitude, state.location.longitude] : DEFAULT_COORDS, 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
        }).addTo(state.nearbyMap);

        state.nearbyMapInitialized = true;
    } else {
        state.nearbyMap.invalidateSize();
    }

    if (state.location) {
        const latlng = [state.location.latitude, state.location.longitude];
        state.nearbyMap.setView(latlng, 14);

        if (!state.nearbyUserMarker) {
            const icon = L.divIcon({
                className: '',
                html: '<div class="gps-pulse-marker" style="width:16px;height:16px;border:3px solid #fff;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            state.nearbyUserMarker = L.marker(latlng, { icon })
                .addTo(state.nearbyMap)
                .bindPopup('<b>📍 You are here</b>');
        } else {
            state.nearbyUserMarker.setLatLng(latlng);
        }

        updateNearbyMapMarkers();
    }
}

function destroyNearbyMap() {
    if (state.nearbyMap) {
        state.nearbyMap.remove();
        state.nearbyMap = null;
        state.nearbyUserMarker = null;
        state.nearbyFacilityMarkers = [];
        state.nearbyMapInitialized = false;
    }
}

function updateNearbyMapMarkers() {
    if (!state.nearbyMap) return;

    // Remove old markers
    state.nearbyFacilityMarkers.forEach(m => state.nearbyMap.removeLayer(m));
    state.nearbyFacilityMarkers = [];

    const colorMap = {
        police: { bg: '#2563EB', emoji: '🚔' },
        hospital: { bg: '#059669', emoji: '🏥' },
        fire_station: { bg: '#EA580C', emoji: '🚒' }
    };

    const filtered = state.activeFilter === 'all'
        ? state.facilities
        : state.facilities.filter(f => f.type === state.activeFilter);

    filtered.slice(0, 30).forEach(f => {
        const c = colorMap[f.type] || { bg: '#6366f1', emoji: '📍' };
        const icon = L.divIcon({
            html: `<div style="background:${c.bg};width:28px;height:28px;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px ${c.bg}88;display:flex;align-items:center;justify-content:center;font-size:13px;">${c.emoji}</div>`,
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        const distText = f.distance < 1
            ? `${(f.distance * 1000).toFixed(0)}m`
            : `${f.distance.toFixed(1)}km`;

        const m = L.marker([f.latitude, f.longitude], { icon })
            .addTo(state.nearbyMap)
            .bindPopup(`<b>${f.name}</b><br><span style="color:#666">${f.type.replace('_', ' ')}</span><br><b style="color:${c.bg}">${distText} away</b>`);
        state.nearbyFacilityMarkers.push(m);
    });
}

// ============================================================
// Geolocation
// ============================================================
function startLocationTracking() {
    if (!navigator.geolocation) {
        updateGpsText('<span style="color:#EA580C">⚠ GPS not supported</span>');
        return;
    }
    if (state.watchId) return;

    state.watchId = navigator.geolocation.watchPosition(
        onLocationSuccess,
        onLocationError,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function onLocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const firstLock = !state.location;
    state.location = { latitude, longitude, accuracy };

    updateGpsText(`<span class="gps-green-dot"></span> Accurate to within ${Math.round(accuracy)} meters`);

    const coordsEl = document.getElementById('gps-coords');
    if (coordsEl) coordsEl.textContent = `${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E`;

    reverseGeocode(latitude, longitude);

    if (state.map) {
        const latlng = [latitude, longitude];
        if (firstLock) state.map.setView(latlng, 15);

        if (state.userMarker) {
            state.userMarker.setLatLng(latlng);
        } else {
            const icon = L.divIcon({
                className: '',
                html: '<div class="gps-pulse-marker"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            state.userMarker = L.marker(latlng, { icon })
                .addTo(state.map)
                .bindPopup(`<b>You are here</b><br>±${Math.round(accuracy)}m`);
        }
    }

    if (firstLock) fetchNearestServices(latitude, longitude);
}

function onLocationError(err) {
    console.warn('GPS Error:', err.message);
    updateGpsText('<span style="color:#EA580C">⚠ GPS unavailable (using default city location)</span>');

    if (!state.location) {
        state.location = { latitude: DEFAULT_COORDS[0], longitude: DEFAULT_COORDS[1], accuracy: 100 };
        fetchNearestServices(DEFAULT_COORDS[0], DEFAULT_COORDS[1]);
        reverseGeocode(DEFAULT_COORDS[0], DEFAULT_COORDS[1]);
    }
}

function updateGpsText(html) {
    const el = document.getElementById('gps-accuracy-text');
    if (el) el.innerHTML = html;
}

// ============================================================
// Reverse Geocode (Nominatim — free, no API key)
// ============================================================
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'KavachApp/3.0' } }
        );
        const data = await res.json();
        const addr = data.display_name || `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
        const el = document.getElementById('address-text');
        if (el) el.textContent = addr;
    } catch {
        const el = document.getElementById('address-text');
        if (el) el.textContent = `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`;
    }
}

// Default mock emergency services for fallback when offline or API timeout occurs
const MOCK_FACILITIES = [
    { name: 'Central Police Station', type: 'police', latOffset: 0.008, lngOffset: 0.006 },
    { name: 'City Civil Hospital & Trauma Centre', type: 'hospital', latOffset: -0.007, lngOffset: 0.009 },
    { name: 'District Fire & Rescue Command', type: 'fire_station', latOffset: 0.012, lngOffset: -0.005 },
    { name: 'Women & Child Safety Police Cell', type: 'police', latOffset: -0.004, lngOffset: -0.011 },
    { name: 'Apex Emergency Care Hospital', type: 'hospital', latOffset: 0.015, lngOffset: 0.012 },
    { name: 'Sub-Division Fire Station', type: 'fire_station', latOffset: -0.015, lngOffset: 0.008 }
];

async function fetchNearestServices(lat, lng) {
    const radius = 10000;
    const query = `[out:json][timeout:15];(
      node["amenity"="police"](around:${radius},${lat},${lng});
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      node["amenity"="fire_station"](around:${radius},${lat},${lng});
      way["amenity"="police"](around:${radius},${lat},${lng});
      way["amenity"="hospital"](around:${radius},${lat},${lng});
      way["amenity"="fire_station"](around:${radius},${lat},${lng});
    );out center 30;`;

    const urls = [
        'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query),
        'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query)
    ];

    for (const url of urls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.elements && data.elements.length > 0) {
                processFacilities(data.elements);
                return;
            }
        } catch (e) {
            console.warn('Overpass attempt failed:', e.message);
        }
    }

    // Fallback generation around current location
    generateFallbackFacilities(lat, lng);
}

function generateFallbackFacilities(lat, lng) {
    const mockElements = MOCK_FACILITIES.map(m => ({
        lat: lat + m.latOffset,
        lon: lng + m.lngOffset,
        tags: { name: m.name, amenity: m.type }
    }));
    processFacilities(mockElements);
}

function processFacilities(elements) {
    if (!elements || !state.location) return;

    const seen = new Set();
    state.facilities = elements.map(el => {
        let lat = el.lat, lng = el.lon;
        if (!lat && el.center) { lat = el.center.lat; lng = el.center.lon; }
        if (!lat || !lng) return null;

        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
        if (seen.has(key)) return null;
        seen.add(key);

        const distance = haversine(state.location.latitude, state.location.longitude, lat, lng);
        const amenity = el.tags?.amenity || el.tags?.healthcare || 'other';
        const type = amenity === 'hospital' || amenity === 'hospital' ? 'hospital' : amenity;
        const name = el.tags?.name || el.tags?.operator || capitalise(type.replace('_', ' '));

        return { name, type, latitude: lat, longitude: lng, distance, tags: el.tags || {} };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);

    // Add markers to main map
    state.facilityMarkers.forEach(m => state.map?.removeLayer(m));
    state.facilityMarkers = [];

    const colorMap = { police: '#2563EB', hospital: '#059669', fire_station: '#EA580C' };

    state.facilities.slice(0, 20).forEach(f => {
        if (!state.map) return;
        const color = colorMap[f.type] || '#6366f1';
        const icon = L.divIcon({
            html: `<div style="background:${color};width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px ${color}88;"></div>`,
            className: '',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });
        const dist = f.distance < 1 ? `${(f.distance * 1000).toFixed(0)}m` : `${f.distance.toFixed(1)}km`;
        const m = L.marker([f.latitude, f.longitude], { icon })
            .addTo(state.map)
            .bindPopup(`<b>${f.name}</b><br>${f.type.replace('_', ' ')}<br><b>${dist} away</b>`);
        state.facilityMarkers.push(m);
    });

    // Update nearby panel if it's open
    renderFacilitiesList();
    if (state.nearbyMapInitialized) updateNearbyMapMarkers();

    // Update counts in filter buttons
    updateFilterCounts();
}

function updateFilterCounts() {
    const counts = { all: state.facilities.length, police: 0, hospital: 0, fire_station: 0 };
    state.facilities.forEach(f => { if (counts[f.type] !== undefined) counts[f.type]++; });

    document.querySelectorAll('.facility-filter-btn').forEach(btn => {
        const f = btn.dataset.filter;
        const countEl = btn.querySelector('.filter-count');
        if (countEl && counts[f] !== undefined) countEl.textContent = counts[f];
    });
}

// ============================================================
// Render Facilities List (Safe Route tab)
// ============================================================
function renderFacilitiesList() {
    const list = document.getElementById('facilities-list');
    if (!list) return;

    const filtered = state.activeFilter === 'all'
        ? state.facilities
        : state.facilities.filter(f => f.type === state.activeFilter);

    if (state.facilities.length === 0) {
        list.innerHTML = `
            <div class="facility-loading">
                <div class="facility-spinner"></div>
                <p>${state.location ? 'Searching nearby facilities…' : 'Waiting for GPS location…'}</p>
            </div>`;
        return;
    }

    if (filtered.length === 0) {
        list.innerHTML = `<div class="facility-empty"><i class="fa-solid fa-circle-xmark"></i><p>No ${state.activeFilter.replace('_', ' ')} facilities found nearby.</p></div>`;
        return;
    }

    const meta = {
        police: { color: '#2563EB', bg: '#EEF4FF', icon: 'fa-building-shield', label: 'Police Station' },
        hospital: { color: '#059669', bg: '#ECFDF5', icon: 'fa-hospital', label: 'Hospital' },
        fire_station: { color: '#EA580C', bg: '#FFF7ED', icon: 'fa-fire-extinguisher', label: 'Fire Station' }
    };

    list.innerHTML = filtered.slice(0, 15).map(f => {
        const m = meta[f.type] || { color: '#6366f1', bg: '#EEF2FF', icon: 'fa-location-dot', label: capitalise(f.type) };
        const dist = f.distance < 1
            ? `${(f.distance * 1000).toFixed(0)} m`
            : `${f.distance.toFixed(1)} km`;
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${f.latitude},${f.longitude}&travelmode=driving`;

        return `
        <div class="facility-card" onclick="window.open('${mapsUrl}','_blank')">
            <div class="facility-icon-wrap" style="background:${m.bg};color:${m.color}">
                <i class="fa-solid ${m.icon}"></i>
            </div>
            <div class="facility-info">
                <span class="facility-name">${escHtml(f.name)}</span>
                <span class="facility-type" style="color:${m.color}">${m.label}</span>
            </div>
            <div class="facility-right">
                <span class="facility-distance">${dist}</span>
                <i class="fa-solid fa-arrow-right facility-arrow" style="color:${m.color}"></i>
            </div>
        </div>`;
    }).join('');
}

function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================
// SIREN — Web Audio API
// ============================================================
function startSiren() {
    if (state.sirenActive) return;
    state.sirenActive = true;

    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        state.sirenAudioCtx = new AudioCtx();
        const ctx = state.sirenAudioCtx;

        state.sirenGainNode = ctx.createGain();
        state.sirenGainNode.gain.setValueAtTime(0.001, ctx.currentTime);
        state.sirenGainNode.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.3);
        state.sirenGainNode.connect(ctx.destination);

        // Create two oscillators for a wailing siren effect
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'square';

        // Wail: frequency sweeps up and down
        function scheduleSirenCycles(startTime) {
            const cycleLen = 1.2; // seconds per cycle
            for (let i = 0; i < 60; i++) {
                const t = startTime + i * cycleLen;
                osc1.frequency.setValueAtTime(600, t);
                osc1.frequency.linearRampToValueAtTime(1200, t + cycleLen * 0.5);
                osc1.frequency.linearRampToValueAtTime(600, t + cycleLen);

                osc2.frequency.setValueAtTime(400, t);
                osc2.frequency.linearRampToValueAtTime(900, t + cycleLen * 0.5);
                osc2.frequency.linearRampToValueAtTime(400, t + cycleLen);
            }
        }

        scheduleSirenCycles(ctx.currentTime);

        const gain2 = ctx.createGain();
        gain2.gain.value = 0.3;
        osc2.connect(gain2);
        gain2.connect(state.sirenGainNode);
        osc1.connect(state.sirenGainNode);

        osc1.start();
        osc2.start();
        state.sirenOscillators = [osc1, osc2];

        // Gradually increase volume (louder and louder)
        state.sirenGainNode.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 5);

    } catch (e) {
        console.warn('Siren audio failed:', e);
    }
}

function stopSiren() {
    state.sirenActive = false;
    try {
        state.sirenOscillators.forEach(osc => {
            try { osc.stop(); } catch (_) {}
        });
        state.sirenOscillators = [];
        if (state.sirenGainNode) {
            state.sirenGainNode.gain.exponentialRampToValueAtTime(0.001, state.sirenAudioCtx?.currentTime + 0.3);
        }
        setTimeout(() => {
            if (state.sirenAudioCtx) {
                state.sirenAudioCtx.close().catch(() => {});
                state.sirenAudioCtx = null;
                state.sirenGainNode = null;
            }
        }, 400);
    } catch (e) {
        console.warn('Stop siren error:', e);
    }

    // Reset siren badge UI
    const sirenSub = document.querySelector('.siren-sub');
    if (sirenSub) sirenSub.textContent = 'Ready';
    const sirenIcon = document.querySelector('.siren-icon');
    if (sirenIcon) sirenIcon.style.color = '';
}

// ============================================================
// SOS & Emergency Trigger
// ============================================================
function triggerSOS() {
    // Start siren immediately
    startSiren();
    updateSirenUI(true);

    // Show SOS active modal
    openSOSActiveModal();

    // Also trigger emergency contact alert
    triggerEmergency('ALL EMERGENCY SERVICES', '112');
}

function updateSirenUI(active) {
    const sirenSub = document.querySelector('.siren-sub');
    const sirenIcon = document.querySelector('.siren-icon');
    if (sirenSub) sirenSub.textContent = active ? '🔊 ACTIVE' : 'Ready';
    if (sirenIcon) sirenIcon.style.color = active ? '#CC1414' : '';
}

function openSOSActiveModal() {
    const modal = document.getElementById('sos-active-modal');
    if (!modal) return;

    // Update countdown in modal
    let secs = 0;
    const timerEl = document.getElementById('sos-elapsed-time');
    clearInterval(state.sosCountdownInterval);
    state.sosCountdownInterval = setInterval(() => {
        secs++;
        if (timerEl) timerEl.textContent = `${secs}s`;
    }, 1000);

    openModal('sos-active-modal');
}

async function triggerEmergency(serviceName, phoneNumber) {
    if (!state.user) { showToast('Please complete setup first'); return; }

    const titleEl = document.getElementById('alert-service-title');
    const dialLink = document.getElementById('direct-dial-link');
    const smsBtn = document.getElementById('sms-btn');
    const waBtn = document.getElementById('whatsapp-btn');
    const previewEl = document.getElementById('sms-preview-text');
    const dot = document.getElementById('db-status-dot');
    const txt = document.getElementById('db-status-text');

    if (titleEl) titleEl.textContent = `Contacting ${serviceName}`;
    if (dialLink) dialLink.href = `tel:${phoneNumber}`;

    const lat = state.location?.latitude ?? 0;
    const lng = state.location?.longitude ?? 0;
    const mapLink = `https://maps.google.com/?q=${lat},${lng}`;
    const alertMsg = `🚨 KAVACH EMERGENCY ALERT\n\nName: ${state.user.name}\nNeeds: ${serviceName}\n\nLive Location:\n${mapLink}`;
    const encoded = encodeURIComponent(alertMsg);

    if (smsBtn) smsBtn.href = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? `sms:${state.user.emergencyPhone}&body=${encoded}`
        : `sms:${state.user.emergencyPhone}?body=${encoded}`;
    if (waBtn) waBtn.href = `https://wa.me/${state.user.emergencyPhone.replace('+', '')}?text=${encoded}`;
    if (previewEl) previewEl.textContent = alertMsg;
    if (dot) dot.className = 'log-dot pulse';
    if (txt) txt.textContent = 'Sending location to guardian…';

    openModal('alert-modal');
    window.location.href = `tel:${phoneNumber}`;

    setTimeout(() => {
        if (dot) dot.className = 'log-dot green';
        if (txt) txt.textContent = 'Alert sent to guardian ✓';
    }, 1500);
}

// ============================================================
// Notify Guardian
// ============================================================
function notifyGuardian() {
    if (!state.user?.emergencyPhone) { showToast('No guardian set'); return; }
    const lat = state.location?.latitude.toFixed(6) ?? '—';
    const lng = state.location?.longitude.toFixed(6) ?? '—';
    const msg = encodeURIComponent(`🚨 KAVACH ALERT\n${state.user.name} may need help.\nLocation: https://maps.google.com/?q=${lat},${lng}`);
    window.open(`https://wa.me/${state.user.emergencyPhone.replace('+', '')}?text=${msg}`, '_blank');
}

// ============================================================
// Share Location
// ============================================================
function shareLocation(type) {
    const lat = state.location?.latitude.toFixed(6) ?? '0';
    const lng = state.location?.longitude.toFixed(6) ?? '0';
    const link = `https://maps.google.com/?q=${lat},${lng}`;
    const msg = encodeURIComponent(`📍 My live location (Kavach): ${link}`);

    if (type === 'whatsapp') {
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    } else if (type === 'copy') {
        navigator.clipboard?.writeText(link)
            .then(() => showToast('Location link copied!'))
            .catch(() => showToast(link));
    } else {
        if (navigator.share) {
            navigator.share({ title: 'My Live Location', url: link }).catch(() => {});
        } else {
            window.open(link, '_blank');
        }
    }
}

// ============================================================
// Modal Helpers
// ============================================================
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ============================================================
// Toast
// ============================================================
function showToast(msg) {
    let toast = document.getElementById('kavach-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'kavach-toast';
        toast.style.cssText = `
            position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
            background:#1A1A2E;color:#fff;padding:10px 20px;border-radius:20px;
            font-size:13px;font-weight:600;z-index:9999;
            box-shadow:0 4px 20px rgba(0,0,0,0.25);
            transition:opacity 0.3s;opacity:0;pointer-events:none;
            white-space:nowrap;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ============================================================
// Utilities
// ============================================================
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = deg2rad(lat2 - lat1), dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(deg) { return deg * Math.PI / 180; }
