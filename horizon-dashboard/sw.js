// ================================================================
// HORIZON BD Opportunity Engine — Service Worker
// Intercepts /api/* requests and serves from IndexedDB
// ================================================================

var DB_NAME = 'horizon';
var DB_VERSION = 1;
var STORES = {
    opportunities: 'opportunities',
    details: 'details',
    briefs: 'briefs',
    stats: 'stats',
    scheduler: 'scheduler',
    mutations: 'mutations'
};

// ----------------------------------------------------------------
// IndexedDB helpers
// ----------------------------------------------------------------

function openDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORES.opportunities)) {
                var oppStore = db.createObjectStore(STORES.opportunities, { keyPath: 'id' });
                oppStore.createIndex('sector', 'sector', { unique: false });
                oppStore.createIndex('jurisdiction', 'jurisdiction', { unique: false });
                oppStore.createIndex('status', 'status', { unique: false });
                oppStore.createIndex('composite_score', 'composite_score', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.details)) {
                db.createObjectStore(STORES.details, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.briefs)) {
                db.createObjectStore(STORES.briefs, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.stats)) {
                db.createObjectStore(STORES.stats);
            }
            if (!db.objectStoreNames.contains(STORES.scheduler)) {
                db.createObjectStore(STORES.scheduler);
            }
            if (!db.objectStoreNames.contains(STORES.mutations)) {
                db.createObjectStore(STORES.mutations, { autoIncrement: true });
            }
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
    });
}

function idbGet(db, storeName, key) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).get(key);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function idbGetAll(db, storeName) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readonly');
        var req = tx.objectStore(storeName).getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function idbPut(db, storeName, value, key) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var req = key !== undefined ? store.put(value, key) : store.put(value);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

// ----------------------------------------------------------------
// Install — seed IndexedDB from imported data (if available)
// ----------------------------------------------------------------

var _seeded = false;

try {
    importScripts('assets/sw-seed-data.js');
} catch (e) {
    // sw-seed-data.js not available (e.g., GitHub Pages without CI build)
    // SW will install without data and act as a pass-through
    console.warn('[HORIZON SW] Seed data not available:', e.message || e);
}

self.addEventListener('install', function(event) {
    if (typeof self.SEED_DATA !== 'undefined') {
        event.waitUntil(seedDatabase().then(function() {
            _seeded = true;
            return self.skipWaiting();
        }));
    } else {
        _seeded = false;
        event.waitUntil(self.skipWaiting());
    }
});

function seedDatabase() {
    if (typeof self.SEED_DATA === 'undefined') {
        return Promise.resolve();
    }
    var seed = self.SEED_DATA;
    return openDB().then(function(db) {
        return new Promise(function(resolve, reject) {
            var storeNames = [
                STORES.opportunities,
                STORES.details,
                STORES.briefs,
                STORES.stats,
                STORES.scheduler
            ];
            var tx = db.transaction(storeNames, 'readwrite');
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { reject(tx.error); };

            var oppStore = tx.objectStore(STORES.opportunities);
            (seed.opportunities || []).forEach(function(opp) {
                oppStore.put(opp);
            });

            var detailStore = tx.objectStore(STORES.details);
            Object.keys(seed.details || {}).forEach(function(id) {
                var d = seed.details[id];
                d.id = parseInt(id, 10);
                detailStore.put(d);
            });

            var briefStore = tx.objectStore(STORES.briefs);
            Object.keys(seed.briefs || {}).forEach(function(id) {
                var b = seed.briefs[id];
                b.id = parseInt(id, 10);
                briefStore.put(b);
            });

            tx.objectStore(STORES.stats).put(seed.stats, 'current');

            tx.objectStore(STORES.scheduler).put(seed.scheduler || {
                running: false, run_at: null, last_run: null, next_run: null
            }, 'current');
        });
    }).then(function() {
        delete self.SEED_DATA;
    });
}

// ----------------------------------------------------------------
// Activate — take control of all clients immediately
// ----------------------------------------------------------------

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

// ----------------------------------------------------------------
// Fetch — intercept /api/* requests
// ----------------------------------------------------------------

self.addEventListener('fetch', function(event) {
    // Only intercept API requests if we have seeded data
    if (!_seeded) return;

    var url = new URL(event.request.url);
    var pathname = url.pathname;

    var apiIndex = pathname.indexOf('/api/');
    if (apiIndex === -1) return;

    var apiPath = pathname.substring(apiIndex);

    if (event.request.method === 'GET') {
        event.respondWith(handleApiGet(apiPath));
    } else if (event.request.method === 'POST') {
        event.respondWith(
            event.request.json().then(function(body) {
                return handleApiPost(apiPath, body);
            })
        );
    }
});

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status || 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

function handleApiGet(apiPath) {
    if (apiPath === '/api/stats') {
        return openDB().then(function(db) {
            return idbGet(db, STORES.stats, 'current');
        }).then(function(data) {
            return jsonResponse(data || {});
        });
    }

    if (apiPath === '/api/scheduler') {
        return openDB().then(function(db) {
            return idbGet(db, STORES.scheduler, 'current');
        }).then(function(data) {
            return jsonResponse(data || { running: false });
        });
    }

    if (apiPath === '/api/opportunities') {
        return openDB().then(function(db) {
            return idbGetAll(db, STORES.opportunities);
        }).then(function(opps) {
            opps.sort(function(a, b) {
                return (b.composite_score || 0) - (a.composite_score || 0);
            });
            return jsonResponse(opps);
        });
    }

    var briefMatch = apiPath.match(/^\/api\/opportunities\/(\d+)\/brief$/);
    if (briefMatch) {
        var briefId = parseInt(briefMatch[1], 10);
        return openDB().then(function(db) {
            return idbGet(db, STORES.briefs, briefId);
        }).then(function(data) {
            if (data) return jsonResponse(data);
            return jsonResponse({ error: 'Not found' }, 404);
        });
    }

    var detailMatch = apiPath.match(/^\/api\/opportunities\/(\d+)$/);
    if (detailMatch) {
        var detailId = parseInt(detailMatch[1], 10);
        return openDB().then(function(db) {
            return idbGet(db, STORES.details, detailId);
        }).then(function(data) {
            if (data) return jsonResponse(data);
            return jsonResponse({ error: 'Not found' }, 404);
        });
    }

    return Promise.resolve(jsonResponse({ error: 'Not found' }, 404));
}

function handleApiPost(apiPath, body) {
    var scoreMatch = apiPath.match(/^\/api\/opportunities\/(\d+)\/score$/);
    if (scoreMatch) {
        var scoreId = parseInt(scoreMatch[1], 10);
        return openDB().then(function(db) {
            return idbGet(db, STORES.details, scoreId).then(function(detail) {
                if (detail && body.scores) {
                    if (!detail.scores) detail.scores = {};
                    for (var k in body.scores) {
                        detail.scores[k] = body.scores[k];
                    }
                    if (body.composite_score !== undefined) {
                        detail.composite_score = body.composite_score;
                    }
                    return idbPut(db, STORES.details, detail);
                }
            }).then(function() {
                return idbGet(db, STORES.opportunities, scoreId);
            }).then(function(opp) {
                if (opp && body.scores) {
                    if (!opp.scores) opp.scores = {};
                    for (var k in body.scores) {
                        opp.scores[k] = body.scores[k];
                    }
                    if (body.composite_score !== undefined) {
                        opp.composite_score = body.composite_score;
                    }
                    return idbPut(db, STORES.opportunities, opp);
                }
            }).then(function() {
                return idbGet(db, STORES.briefs, scoreId);
            }).then(function(brief) {
                if (brief && body.scores) {
                    if (!brief.scores) brief.scores = {};
                    for (var k in body.scores) {
                        brief.scores[k] = body.scores[k];
                    }
                    if (body.composite_score !== undefined) {
                        brief.composite_score = body.composite_score;
                    }
                    return idbPut(db, STORES.briefs, brief);
                }
            }).then(function() {
                return idbPut(db, STORES.mutations, {
                    timestamp: Date.now(),
                    type: 'score_update',
                    oppId: scoreId,
                    payload: body
                });
            }).then(function() {
                return jsonResponse({ ok: true, id: scoreId });
            });
        });
    }

    var statusMatch = apiPath.match(/^\/api\/opportunities\/(\d+)\/status$/);
    if (statusMatch) {
        var statusId = parseInt(statusMatch[1], 10);
        var newStatus = body.status;
        return openDB().then(function(db) {
            return idbGet(db, STORES.details, statusId).then(function(detail) {
                if (detail) {
                    detail.status = newStatus;
                    return idbPut(db, STORES.details, detail);
                }
            }).then(function() {
                return idbGet(db, STORES.opportunities, statusId);
            }).then(function(opp) {
                if (opp) {
                    opp.status = newStatus;
                    return idbPut(db, STORES.opportunities, opp);
                }
            }).then(function() {
                return idbGet(db, STORES.briefs, statusId);
            }).then(function(brief) {
                if (brief) {
                    brief.status = newStatus;
                    return idbPut(db, STORES.briefs, brief);
                }
            }).then(function() {
                return idbPut(db, STORES.mutations, {
                    timestamp: Date.now(),
                    type: 'status_update',
                    oppId: statusId,
                    payload: { status: newStatus }
                });
            }).then(function() {
                return jsonResponse({ ok: true, id: statusId, status: newStatus });
            });
        });
    }

    return Promise.resolve(jsonResponse({ ok: true }));
}
