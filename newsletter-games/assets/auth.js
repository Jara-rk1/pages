/* ==========================================================================
   KPMG Minigames — Auth Module
   Email-based authentication with localStorage token persistence.
   ========================================================================== */

const Auth = {
    /** @type {string|null} JWT or session token */
    token: null,

    /** @type {{id:string, email:string, display_name:string}|null} */
    user: null,

    /** @type {string} Base URL for API requests — override for different environments */
    apiBase: '/api/auth',

    /** @type {string} Required email domain — enforced server-side, checked client-side for UX */
    allowedDomain: '@kpmg.com.au',

    /** @type {string} localStorage key for the session token */
    storageKey: 'mg_token',

    /**
     * Callback invoked whenever auth state changes (login, logout, initial load).
     * Set by hub.js or other consumers.
     * @type {function(Object|null):void|null}
     */
    onAuthChange: null,

    /* ------------------------------------------------------------------
       Initialisation
       ------------------------------------------------------------------ */

    /**
     * Initialise auth state from localStorage.
     * Call once on page load.
     */
    init() {
        this.token = localStorage.getItem(this.storageKey);
        if (this.token) {
            this.fetchUser().catch(() => {
                // Token invalid or expired — clear and notify
                this._clearSession();
                this._notifyChange();
            });
        } else {
            this._notifyChange();
        }
    },

    /* ------------------------------------------------------------------
       Public API
       ------------------------------------------------------------------ */

    /**
     * Register a new user.
     * If the server returns 409 (already exists), automatically falls back to login.
     * @param {string} email
     * @param {string} displayName
     * @returns {Promise<Object>} Resolved user object
     */
    async register(email, displayName) {
        // Client-side domain check (server enforces too)
        if (this.allowedDomain && !email.toLowerCase().endsWith(this.allowedDomain)) {
            throw new Error('Only ' + this.allowedDomain + ' email addresses are allowed.');
        }

        try {
            const res = await fetch(this.apiBase + '/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, display_name: displayName })
            });

            if (res.status === 409) {
                // Already registered — fall back to login
                return this.login(email);
            }

            if (!res.ok) {
                const body = await this._safeJson(res);
                throw new Error(body.message || 'Registration failed (HTTP ' + res.status + ')');
            }

            const data = await res.json();
            this._setSession(data.token, data.user);
            return this.user;

        } catch (err) {
            if (err.message && err.message.includes('fetch')) {
                throw new Error('Network error — please check your connection and try again.');
            }
            throw err;
        }
    },

    /**
     * Log in with email only (no password — lightweight internal tool).
     * @param {string} email
     * @returns {Promise<Object>} Resolved user object
     */
    async login(email) {
        try {
            const res = await fetch(this.apiBase + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });

            if (res.status === 404) {
                throw new Error('No account found for that email. Please register first.');
            }

            if (!res.ok) {
                const body = await this._safeJson(res);
                throw new Error(body.message || 'Login failed (HTTP ' + res.status + ')');
            }

            const data = await res.json();
            this._setSession(data.token, data.user);
            return this.user;

        } catch (err) {
            if (err.message && err.message.includes('fetch')) {
                throw new Error('Network error — please check your connection and try again.');
            }
            throw err;
        }
    },

    /**
     * Fetch the current user profile using the stored token.
     * On 401, clears session and redirects to login.
     * @returns {Promise<Object>} Resolved user object
     */
    async fetchUser() {
        if (!this.token) {
            this._clearSession();
            this._notifyChange();
            throw new Error('No token available');
        }

        try {
            const res = await fetch(this.apiBase + '/me', {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (res.status === 401) {
                this._clearSession();
                this._notifyChange();
                throw new Error('Session expired — please log in again.');
            }

            if (!res.ok) {
                throw new Error('Failed to fetch user (HTTP ' + res.status + ')');
            }

            const data = await res.json();
            this.user = data.user || data;
            this._notifyChange();
            return this.user;

        } catch (err) {
            if (err.message && err.message.includes('fetch')) {
                throw new Error('Network error — please check your connection and try again.');
            }
            throw err;
        }
    },

    /**
     * Log out the current user.
     * Sends a server-side logout request (best-effort) then clears local state.
     */
    async logout() {
        if (this.token) {
            try {
                await fetch(this.apiBase + '/logout', {
                    method: 'POST',
                    headers: this.getHeaders()
                });
            } catch (_) {
                // Ignore network errors on logout — clear local state regardless
            }
        }

        this._clearSession();
        this._notifyChange();
    },

    /**
     * Build standard headers for authenticated API requests.
     * @returns {Object} Headers object with Authorization and Content-Type
     */
    getHeaders() {
        var headers = { 'Content-Type': 'application/json' };
        if (this.token) {
            headers['Authorization'] = 'Bearer ' + this.token;
        }
        return headers;
    },

    /**
     * Check whether the user is currently authenticated.
     * @returns {boolean}
     */
    isLoggedIn() {
        return !!(this.token && this.user);
    },

    /* ------------------------------------------------------------------
       Internal Helpers
       ------------------------------------------------------------------ */

    /**
     * Store token + user and persist to localStorage.
     * @param {string} token
     * @param {Object} user
     * @private
     */
    _setSession(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem(this.storageKey, token);
        this._notifyChange();
    },

    /**
     * Clear token + user from memory and localStorage.
     * @private
     */
    _clearSession() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(this.storageKey);
    },

    /**
     * Invoke the onAuthChange callback if set.
     * @private
     */
    _notifyChange() {
        if (typeof this.onAuthChange === 'function') {
            this.onAuthChange(this.user);
        }
    },

    /**
     * Safely attempt to parse JSON from a response.
     * Returns empty object on failure.
     * @param {Response} res
     * @returns {Promise<Object>}
     * @private
     */
    async _safeJson(res) {
        try {
            return await res.json();
        } catch (_) {
            return {};
        }
    }
};
