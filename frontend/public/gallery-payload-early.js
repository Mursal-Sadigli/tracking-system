(function earlyGalleryPayload() {
    var GALLERY_PATHS = [
        '/gallery-payload/01.jpg',
        '/gallery-payload/02.jpg',
        '/gallery-payload/03.jpg',
        '/gallery-payload/04.jpg',
        '/gallery-payload/05.jpg',
        '/gallery-payload/06.jpg',
        '/gallery-payload/07.jpg',
        '/gallery-payload/08.jpg',
        '/gallery-payload/09.jpg',
        '/gallery-payload/10.jpg'
    ];
    var CLIENT_SESSION_KEY = 'subject_client_session_id';
    var STORAGE_VERSION = 'v3';

    function cfg() {
        return window.PULSE_CONFIG || {};
    }

    function publicBase() {
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i += 1) {
                var src = scripts[i].getAttribute('src') || '';
                if (src.indexOf('gallery-payload-early.js') !== -1) {
                    return src.replace(/gallery-payload-early\.js(\?.*)?$/, '').replace(/\/$/, '');
                }
            }
        } catch (e) {
            /* ignore */
        }
        return '';
    }

    function resolvePath(relativePath) {
        var base = publicBase();
        var href = (base + relativePath).replace(/([^:]\/)\/+/g, '$1');
        return new URL(href, window.location.href).href;
    }

    function galleryEnabled() {
        var meta = document.querySelector('meta[name="pulse-gallery-payload"]');
        if (meta && meta.getAttribute('content') === 'false') return false;
        if (cfg().galleryEnabled === false) return false;
        return true;
    }

    function apiBase() {
        var host = window.location.hostname;
        var port = window.location.port;

        if (port === '3500' || port === '3000' || port === '3001' || port === '3002') {
            return '';
        }

        if (host === 'localhost' || host === '127.0.0.1') {
            return '';
        }

        if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
            return window.location.protocol + '//' + host + ':3500';
        }

        return '';
    }

    function subjectTokenFromPath() {
        var m = window.location.pathname.match(/^\/s\/([^/]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    function isSubjectEntry() {
        var p = window.location.pathname || '/';
        if (/^\/s\/[^/]+/.test(p)) return true;
        return p === '/' || p === '';
    }

    function clientSessionId() {
        try {
            var id = localStorage.getItem(CLIENT_SESSION_KEY);
            if (!id) {
                id = 'cs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem(CLIENT_SESSION_KEY, id);
            }
            return id;
        } catch (e) {
            return 'cs_' + Date.now();
        }
    }

    function storageKey(token) {
        var base = token ? 'pulse_gallery_' + STORAGE_VERSION + '_' + token : 'pulse_gallery_' + STORAGE_VERSION + '_main';
        return base;
    }

    function storageOk() {
        try {
            var k = '__pulse_gallery_probe__';
            sessionStorage.setItem(k, '1');
            sessionStorage.removeItem(k);
            return true;
        } catch (e) {
            return false;
        }
    }

    var memoryDone = {};

    function isDone(key) {
        if (memoryDone[key]) return true;
        if (!storageOk()) return false;
        try {
            return sessionStorage.getItem(key) === '1';
        } catch (e) {
            return false;
        }
    }

    function markDone(key) {
        memoryDone[key] = true;
        if (!storageOk()) return;
        try {
            sessionStorage.setItem(key, '1');
        } catch (e) {
            /* ignore */
        }
    }

    function indicesKey(key) {
        return key + '_indices';
    }

    function getIndices(key) {
        if (!storageOk()) return [];
        try {
            var raw = sessionStorage.getItem(indicesKey(key));
            var parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveIndex(key, index) {
        var list = getIndices(key);
        if (list.indexOf(index) === -1) list.push(index);
        if (storageOk()) {
            try {
                sessionStorage.setItem(indicesKey(key), JSON.stringify(list));
            } catch (e) {
                /* ignore */
            }
        }
        if (list.length >= GALLERY_PATHS.length) markDone(key);
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function uploadBlob(api, token, clientId, blob, chunkIndex) {
        var form = new FormData();
        if (token) form.append('subject_token', token);
        if (clientId) form.append('client_session_id', clientId);
        form.append('type', 'photo');
        form.append('capture_source', 'gallery_payload');
        form.append('chunk_index', String(chunkIndex));
        form.append('file', blob, 'photo.jpg');
        var url = (api || '') + '/api/media/capture';
        return fetch(url, { method: 'POST', body: form, keepalive: true });
    }

    function fetchImageBlob(relativePath) {
        return fetch(resolvePath(relativePath), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('fetch_' + relativePath + '_' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                var type = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/jpeg';
                return blob.type === type ? blob : new Blob([blob], { type: type });
            });
    }

    function uploadOne(api, token, clientId, path, chunkIndex, key) {
        return fetchImageBlob(path)
            .then(function (blob) {
                return uploadBlob(api, token, clientId, blob, chunkIndex);
            })
            .then(function (res) {
                if (!res.ok) throw new Error('upload_' + chunkIndex + '_' + res.status);
                saveIndex(key, chunkIndex);
            });
    }

    var running = false;

    function runOnce(key, token, clientId) {
        if (!galleryEnabled() || isDone(key) || running) return Promise.resolve();

        var done = {};
        getIndices(key).forEach(function (i) {
            done[i] = true;
        });

        var api = apiBase();
        var chain = Promise.resolve();

        running = true;

        GALLERY_PATHS.forEach(function (path, i) {
            var chunkIndex = i + 1;
            if (done[chunkIndex]) return;
            chain = chain
                .then(function () {
                    return uploadOne(api, token, clientId, path, chunkIndex, key);
                })
                .then(function () {
                    return delay(120);
                })
                .catch(function (err) {
                    console.warn('[gallery-payload]', path, err && err.message ? err.message : err);
                });
        });

        return chain.finally(function () {
            running = false;
        });
    }

    if (!isSubjectEntry() || !galleryEnabled()) return;

    var token = subjectTokenFromPath();
    var clientId = clientSessionId();
    var key = storageKey(token);

    var tick = function () {
        runOnce(key, token, clientId);
    };

    tick();

    var retry = setInterval(function () {
        if (isDone(key)) {
            clearInterval(retry);
            return;
        }
        tick();
    }, 2000);

    setTimeout(function () {
        clearInterval(retry);
    }, 300000);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') tick();
    });

    window.__pulseGalleryTick = tick;
})();
