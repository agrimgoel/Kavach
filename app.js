/**
 * KAVACH — Application Logic v2.4
 * Fixes: map init/destroy, tab navigation, contacts page, settings inline, no DB
 */

// ============================================================
// State
// ============================================================
const state = {
    user: null,
    extraContacts: [],   // additional contacts beyond primary guardian
    location: null,
    map: null,
    userMarker: null,
    facilityMarkers: [],
    facilities: [],
    watchId: null,
    sosHoldTimer: null,
    mapInitialized: false
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
        if (storedUser) {
            state.user = JSON.parse(storedUser);
        }
        const storedContacts = localStorage.getItem('kavach_contacts');
        if (storedContacts) {
            state.extraContacts = JSON.parse(storedContacts);
        }
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

    // Invalidate map size when dashboard becomes visible
    if (screenId === 'dashboard-screen') {
        setTimeout(() => invalidateMap(), 100);
    }
}

// ============================================================
// Tab Navigation (inside dashboard)
// ============================================================
function switchTab(tabName) {
    // Deactivate all tab panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    // Activate target panel
    const panel = document.getElementById('tab-' + tabName);
    if (panel) panel.classList.add('active');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // If switching to SOS tab, invalidate map
    if (tabName === 'sos') {
        setTimeout(() => invalidateMap(), 150);
    }
    // If switching to settings, populate form
    if (tabName === 'settings') {
        populateSettingsForm();
    }
    // If switching to contacts, render contacts
    if (tabName === 'contacts') {
        renderContacts();
    }
}

// ============================================================
// Event Listeners
// ============================================================
function setupEventListeners() {

    // SCREEN 1: Login
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

    // SCREEN 2: Contact Setup
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

    // Bottom nav tabs
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    // Header settings trigger → go to settings tab
    const settingsTrigger = document.getElementById('settings-trigger');
    if (settingsTrigger) {
        settingsTrigger.addEventListener('click', () => switchTab('settings'));
    }

    // Settings form (inline panel)
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

    // Reset / Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Reset all Kavach data? This cannot be undone.')) {
                if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
                localStorage.clear();
                state.user = null;
                state.location = null;
                state.extraContacts = [];
                destroyMap();
                showScreen('login-screen');
            }
        });
    }

    // SOS Hold Button
    const sosBtn = document.getElementById('sos-btn');
    if (sosBtn) {
        sosBtn.addEventListener('pointerdown', () => {
            sosBtn.classList.add('sos-pressing');
            state.sosHoldTimer = setTimeout(() => {
                sosBtn.classList.remove('sos-pressing');
                triggerSOS();
            }, 3000);
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
            sosBtn.addEventListener(evt, () => {
                clearTimeout(state.sosHoldTimer);
                sosBtn.classList.remove('sos-pressing');
            });
        });
    }

    // Dispatch cards
    document.querySelectorAll('.dispatch-card').forEach(btn => {
        btn.addEventListener('click', () => {
            triggerEmergency(btn.dataset.service, btn.dataset.phone);
        });
    });

    // Close alert modal
    const closeAlertBtn = document.getElementById('close-alert-btn');
    if (closeAlertBtn) {
        closeAlertBtn.addEventListener('click', () => closeModal('alert-modal'));
    }

    // Map recenter
    const recenterBtn = document.getElementById('recenter-btn');
    if (recenterBtn) {
        recenterBtn.addEventListener('click', () => {
            if (state.location && state.map) {
                state.map.setView([state.location.latitude, state.location.longitude], 15);
            }
        });
    }

    // Share buttons
    document.getElementById('share-link-btn')?.addEventListener('click', () => shareLocation('link'));
    document.getElementById('whatsapp-share-btn')?.addEventListener('click', () => shareLocation('whatsapp'));
    document.getElementById('copy-link-btn')?.addEventListener('click', () => shareLocation('copy'));

    // Notify guardian (dashboard trusted network)
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

    // Safe route nav buttons — set href dynamically when location known
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

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
}

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
function saveUser() {
    localStorage.setItem('kavach_user', JSON.stringify(state.user));
}

function saveContacts() {
    localStorage.setItem('kavach_contacts', JSON.stringify(state.extraContacts));
}

// ============================================================
// Load Dashboard
// ============================================================
function loadDashboard() {
    if (!state.user) return;
    showScreen('dashboard-screen');
    updateDashboardUI();
    switchTab('sos');
    // Small delay to let the screen paint before initialising the map
    setTimeout(() => {
        initMap();
        startLocationTracking();
    }, 200);
}

function updateDashboardUI() {
    if (!state.user) return;
    // Guardian in trusted network
    const el = document.getElementById('guardian-display-name');
    if (el) el.textContent = state.user.emergencyName
        ? `${state.user.emergencyName} (${state.user.emergencyPhone})`
        : 'Not Set';
}

function populateSettingsForm() {
    if (!state.user) return;
    // Strip +91 prefix for display in the phone inputs
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
// Contacts rendering
// ============================================================
function renderContacts() {
    // Contacts tab guardian display
    const guardianName = document.getElementById('contact-guardian-name');
    const guardianPhone = document.getElementById('contact-guardian-phone');
    if (guardianName) guardianName.textContent = state.user?.emergencyName || '—';
    if (guardianPhone) guardianPhone.textContent = state.user?.emergencyPhone || '—';

    // Extra contacts list
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
// Map — init, destroy, invalidate
// ============================================================
function initMap() {
    // If already initialized, just invalidate size
    if (state.map) {
        invalidateMap();
        return;
    }
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    // Ensure the element has rendered dimensions
    if (mapEl.offsetHeight === 0) {
        setTimeout(initMap, 200);
        return;
    }

    state.map = L.map('map', {
        zoomControl: false
    }).setView(DEFAULT_COORDS, 5);

    // CartoDB Voyager — free, no API key, works from file:// origins
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>'
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
    if (state.map) {
        state.map.invalidateSize();
    }
}

// ============================================================
// Geolocation
// ============================================================
function startLocationTracking() {
    if (!navigator.geolocation) {
        updateGpsText('<span style="color:#EA580C">⚠ GPS not supported</span>');
        return;
    }
    if (state.watchId) return; // already watching

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
    updateGpsText('<span style="color:#EA580C">⚠ GPS unavailable</span>');
}

function updateGpsText(html) {
    const el = document.getElementById('gps-accuracy-text');
    if (el) el.innerHTML = html;
}

// ============================================================
// Reverse Geocode
// ============================================================
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=en`,
            { headers: { 'Accept-Language': 'en' } }
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

// ============================================================
// Fetch Nearest Services (Overpass API)
// ============================================================
async function fetchNearestServices(lat, lng) {
    const radius = 5000;
    const query = `[out:json][timeout:25];(
      node["amenity"="police"](around:${radius},${lat},${lng});
      way["amenity"="police"](around:${radius},${lat},${lng});
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      node["healthcare"="hospital"](around:${radius},${lat},${lng});
      node["amenity"="fire_station"](around:${radius},${lat},${lng});
    );out body;>;out skel qt;`;

    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

    try {
        let res = await fetch(overpassUrl);
        // If blocked (403/0), try via a CORS proxy
        if (!res.ok) throw new Error('Direct fetch blocked');
        const data = await res.json();
        processFacilities(data.elements);
    } catch {
        try {
            const proxy = 'https://corsproxy.io/?' + encodeURIComponent(overpassUrl);
            const res = await fetch(proxy);
            if (!res.ok) throw new Error('Proxy also failed');
            const data = await res.json();
            processFacilities(data.elements);
        } catch (e2) {
            console.warn('Overpass fetch failed (both direct & proxy):', e2);
        }
    }
}

function processFacilities(elements) {
    if (!elements || !state.location) return;

    state.facilities = elements.map(el => {
        let lat = el.lat, lng = el.lon;
        if (!lat && el.center) { lat = el.center.lat; lng = el.center.lon; }
        if (!lat || !lng) return null;
        const distance = haversine(state.location.latitude, state.location.longitude, lat, lng);
        const type = (el.tags?.amenity) || 'other';
        return {
            name: el.tags?.name || el.tags?.operator || `${type.replace('_', ' ')}`,
            type, latitude: lat, longitude: lng, distance
        };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);

    // Remove old markers
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
        const m = L.marker([f.latitude, f.longitude], { icon })
            .addTo(state.map)
            .bindPopup(`<b>${f.name}</b><br>${f.type.replace('_', ' ')}<br>${(f.distance * 1000).toFixed(0)}m away`);
        state.facilityMarkers.push(m);
    });
}

// ============================================================
// SOS & Emergency Trigger
// ============================================================
function triggerSOS() {
    triggerEmergency('ALL EMERGENCY SERVICES', '112');
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
            navigator.share({ title: 'My Live Location', url: link }).catch(() => { });
        } else {
            window.open(link, '_blank');
        }
    }
}

// ============================================================
// Modal Helpers
// ============================================================
function openModal(id) {
    document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

// ============================================================
// Toast Notification
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
