// ==================== BITE CLUB — LOCAL STORAGE PERSISTENCE ====================
// Provides persistent state for favourites, registrations, likes, reviews,
// comments, face-off votes, user profile, and dark mode preference.
//
// All keys are prefixed with "bc_" to avoid collisions.
// Falls back to an in-memory Map if localStorage is unavailable (private browsing).

const Storage = (function () {
  // ===== BACKEND =====
  let _memoryFallback = {};
  let _useMemory = false;

  try {
    const test = '__bc_test__';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
  } catch (e) {
    _useMemory = true;
  }

  function _get(key) {
    try {
      const raw = _useMemory ? _memoryFallback[key] : localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _set(key, value) {
    try {
      const json = JSON.stringify(value);
      if (_useMemory) {
        _memoryFallback[key] = json;
      } else {
        localStorage.setItem(key, json);
      }
    } catch (e) {
      // Storage full or unavailable — silent fail
    }
  }

  function _remove(key) {
    try {
      if (_useMemory) {
        delete _memoryFallback[key];
      } else {
        localStorage.removeItem(key);
      }
    } catch (e) {}
  }

  // ===== GENERIC =====

  function get(key, defaultValue) {
    const val = _get('bc_' + key);
    return val !== null ? val : (defaultValue !== undefined ? defaultValue : null);
  }

  function set(key, value) {
    _set('bc_' + key, value);
  }

  // ===== FAVOURITES =====

  function getFavourites() {
    return _get('bc_favourites') || [];
  }

  function toggleFavourite(venueId) {
    const favs = getFavourites();
    const idx = favs.indexOf(venueId);
    if (idx === -1) {
      favs.push(venueId);
    } else {
      favs.splice(idx, 1);
    }
    _set('bc_favourites', favs);
    return idx === -1; // true if now favourited
  }

  function isFavourite(venueId) {
    return getFavourites().includes(venueId);
  }

  // ===== EVENT REGISTRATIONS =====

  function getRegistrations() {
    return _get('bc_registrations') || [];
  }

  function registerForEvent(eventId) {
    const regs = getRegistrations();
    if (!regs.includes(eventId)) {
      regs.push(eventId);
      _set('bc_registrations', regs);
    }
  }

  function isRegistered(eventId) {
    return getRegistrations().includes(eventId);
  }

  // ===== REVIEW LIKES =====

  function getLikes() {
    return _get('bc_likes') || [];
  }

  function toggleLike(reviewId) {
    const likes = getLikes();
    const idx = likes.indexOf(reviewId);
    if (idx === -1) {
      likes.push(reviewId);
    } else {
      likes.splice(idx, 1);
    }
    _set('bc_likes', likes);
    return idx === -1; // true if now liked
  }

  function isLiked(reviewId) {
    return getLikes().includes(reviewId);
  }

  // ===== USER REVIEWS =====

  function getReviews(venueId) {
    return _get('bc_reviews_' + venueId) || [];
  }

  function addReview(venueId, reviewObj) {
    const reviews = getReviews(venueId);
    reviews.unshift(reviewObj); // newest first
    _set('bc_reviews_' + venueId, reviews);
  }

  // ===== COMMENTS =====

  function getComments(reviewId) {
    return _get('bc_comments_' + reviewId) || [];
  }

  function addComment(reviewId, commentObj) {
    const comments = getComments(reviewId);
    comments.push(commentObj);
    _set('bc_comments_' + reviewId, comments);
  }

  // ===== FACE-OFF VOTES =====

  function getVotes() {
    return _get('bc_votes') || {};
  }

  function castVote(matchId, venueId) {
    const votes = getVotes();
    votes[matchId] = venueId;
    _set('bc_votes', votes);
  }

  function hasVoted(matchId) {
    const votes = getVotes();
    return votes[matchId] !== undefined;
  }

  function getVotedVenue(matchId) {
    const votes = getVotes();
    return votes[matchId] || null;
  }

  // ===== USER PROFILE =====

  function getUserProfile() {
    return _get('bc_user') || null;
  }

  function setUserProfile(profile) {
    _set('bc_user', profile);
  }

  // ===== PROFILE PREFERENCES =====

  function getPreferences() {
    return _get('bc_preferences') || {
      location: '',
      suburbGroups: [],
      dietaryNeeds: [],
      cuisineTypes: [],
      priceRange: [],
      venueTypes: [],
      eventTypes: [],
      notifications: { newEvents: true, venueUpdates: false, weeklyDigest: true }
    };
  }

  function setPreferences(prefs) {
    _set('bc_preferences', prefs);
  }

  function getProfileComplete() {
    const profile = getUserProfile();
    const prefs = getPreferences();
    let score = 0;
    if (profile && profile.name) score += 25;
    if (profile && profile.bio) score += 15;
    if (prefs.location) score += 20;
    if (prefs.dietaryNeeds && prefs.dietaryNeeds.length) score += 10;
    if (prefs.cuisineTypes && prefs.cuisineTypes.length) score += 10;
    if (prefs.priceRange && prefs.priceRange.length) score += 10;
    if (prefs.eventTypes && prefs.eventTypes.length) score += 10;
    return Math.min(score, 100);
  }

  // ===== DARK MODE =====

  function getDarkMode() {
    const val = _get('bc_dark_mode');
    if (val !== null) return val;
    // Fall back to system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function setDarkMode(isDark) {
    _set('bc_dark_mode', isDark);
  }

  // ===== PUBLIC API =====

  return {
    get: get,
    set: set,

    getFavourites: getFavourites,
    toggleFavourite: toggleFavourite,
    isFavourite: isFavourite,

    getRegistrations: getRegistrations,
    registerForEvent: registerForEvent,
    isRegistered: isRegistered,

    getLikes: getLikes,
    toggleLike: toggleLike,
    isLiked: isLiked,

    getReviews: getReviews,
    addReview: addReview,

    getComments: getComments,
    addComment: addComment,

    getVotes: getVotes,
    castVote: castVote,
    hasVoted: hasVoted,
    getVotedVenue: getVotedVenue,

    getUserProfile: getUserProfile,
    setUserProfile: setUserProfile,

    getPreferences: getPreferences,
    setPreferences: setPreferences,
    getProfileComplete: getProfileComplete,

    getDarkMode: getDarkMode,
    setDarkMode: setDarkMode
  };
})();
