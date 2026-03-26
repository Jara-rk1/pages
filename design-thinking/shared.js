// ==================== BITE CLUB — SHARED UTILITIES ====================
// Common functions extracted from index.html, events.html, venue.html

/**
 * Calculate average rating across critic + community reviews.
 * @param {Object} venue — venue object with criticReviews and communityReviews arrays
 * @returns {string} — formatted average (e.g. "8.5") or "N/A"
 */
function getAvgRating(venue) {
  const all = [...venue.criticReviews, ...venue.communityReviews];
  if (!all.length) return 'N/A';
  return (all.reduce((s, r) => s + r.rating, 0) / all.length).toFixed(1);
}

/**
 * Check if a venue is participating in any upcoming event.
 * @param {number} venueId
 * @returns {boolean}
 */
function hasUpcomingEvent(venueId) {
  return EVENTS.some(e => e.status === 'upcoming' && e.venueIds.includes(venueId));
}

/**
 * Format a date string (YYYY-MM-DD) into a readable format.
 * @param {string} dateStr — e.g. "2026-04-12"
 * @returns {string} — e.g. "12 Apr 2026"
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Just now') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Show a toast notification.
 * @param {string} msg — message text
 * @param {'success'|'error'|''} [type] — optional type for styling (.toast-success / .toast-error)
 */
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast';
  if (type === 'success') t.classList.add('toast-success');
  else if (type === 'error') t.classList.add('toast-error');
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/**
 * Image fallback handler — replaces broken images with a themed SVG placeholder.
 * Use as: <img onerror="handleImageError(this, 'cafe')" ...>
 * @param {HTMLImageElement} img
 * @param {'cafe'|'restaurant'|'event'} [type='cafe']
 */
function handleImageError(img, type) {
  const colors = {
    cafe: { bg: '#2A5A1B', icon: '\u2615' },
    restaurant: { bg: '#C24D1E', icon: '\uD83C\uDF7D' },
    event: { bg: '#D4952E', icon: '\uD83D\uDCC5' }
  };
  const c = colors[type] || colors.cafe;
  img.onerror = null; // prevent infinite loop
  img.src = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="${c.bg}" opacity="0.15"/>
      <text x="300" y="180" text-anchor="middle" font-size="64">${c.icon}</text>
      <text x="300" y="240" text-anchor="middle" font-family="Inter,sans-serif" font-size="16" fill="#9B9B9B">Image unavailable</text>
    </svg>`
  )}`;
}

/**
 * Render the shared navigation bar into a <nav id="navbar"> placeholder.
 * @param {string} activePage — one of 'explore', 'events', 'faceoff', 'about'
 */
function renderNavbar(activePage) {
  const el = document.getElementById('navbar');
  if (!el) return;

  const pages = [
    { id: 'explore', label: 'Explore', href: 'index.html' },
    { id: 'events', label: 'Events', href: 'events.html' },
    { id: 'faceoff', label: 'Face-Off', href: 'faceoff.html' },
    { id: 'about', label: 'About', href: 'about.html' },
    { id: 'profile', label: 'Profile', href: 'profile.html' }
  ];

  const links = pages.map(p =>
    `<li><a href="${p.href}"${p.id === activePage ? ' class="active"' : ''}>${p.label}</a></li>`
  ).join('');

  // Dark mode toggle button — show correct icon based on current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const darkModeBtn = `<button class="theme-toggle" aria-label="Toggle dark mode" onclick="toggleDarkMode()" title="Toggle dark mode">
    <span class="theme-toggle-icon">${isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
  </button>`;

  el.className = 'navbar';
  el.innerHTML = `
    <div class="nav-content">
      <a href="index.html" class="nav-logo">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <defs>
            <mask id="bc-bite">
              <rect width="32" height="32" fill="white"/>
              <circle cx="28" cy="4" r="7.5" fill="black"/>
            </mask>
            <linearGradient id="bc-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#3D7A2A"/>
              <stop offset="100%" stop-color="#1B3B12"/>
            </linearGradient>
          </defs>
          <g mask="url(#bc-bite)">
            <circle cx="16" cy="16" r="15" fill="url(#bc-grad)"/>
            <circle cx="16" cy="16" r="14.5" fill="none" stroke="#4A7C28" stroke-width="0.5" opacity="0.4"/>
            <g transform="translate(12.5, 8.5)">
              <rect x="0" y="0" width="1.3" height="5" rx="0.65" fill="#E8A838"/>
              <rect x="2.85" y="0" width="1.3" height="5" rx="0.65" fill="#E8A838"/>
              <rect x="5.7" y="0" width="1.3" height="5" rx="0.65" fill="#E8A838"/>
              <path d="M0.65 5 Q3.5 7.5 6.35 5" fill="none" stroke="#E8A838" stroke-width="1.2"/>
              <rect x="2.5" y="6.5" width="2" height="8.5" rx="1" fill="#E8A838"/>
            </g>
          </g>
        </svg>
        <div>
          <span class="nav-logo-text">Bite Club</span>
          <span class="nav-logo-sub">Discover \u00B7 Review \u00B7 Connect</span>
        </div>
      </a>
      <ul class="nav-links" id="navLinks">
        ${links}
      </ul>
      ${darkModeBtn}
      <button class="nav-hamburger" aria-label="Toggle navigation menu" onclick="document.getElementById('navLinks').classList.toggle('open')">\u2630</button>
    </div>
  `;
}

/**
 * Render the shared footer into a <div id="footer"> placeholder.
 */
function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `
    <footer class="footer">
      <p>Bite Club &copy; 2026 \u2014 A community of food lovers exploring Melbourne\u2019s best.</p>
      <p style="margin-top:0.5rem;">Built with \u2764 for Design Thinking</p>
    </footer>
  `;
}

/**
 * Toggle dark mode and persist preference.
 */
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  if (typeof Storage !== 'undefined' && Storage.setDarkMode) {
    Storage.setDarkMode(newTheme === 'dark');
  }
  // Update toggle icon
  const icon = document.querySelector('.theme-toggle-icon');
  if (icon) icon.textContent = newTheme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
}

/**
 * Apply saved dark mode preference on page load.
 */
function applyDarkMode() {
  if (typeof Storage !== 'undefined' && Storage.getDarkMode) {
    const isDark = Storage.getDarkMode();
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      const icon = document.querySelector('.theme-toggle-icon');
      if (icon) icon.textContent = '\u2600\uFE0F';
    }
  }
}

// Auto-apply dark mode on script load
applyDarkMode();
