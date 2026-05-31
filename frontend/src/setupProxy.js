const { createProxyMiddleware } = require('http-proxy-middleware');

const backendTarget = 'http://127.0.0.1:3500';

module.exports = function setupProxy(app) {
    app.use(
        '/api',
        createProxyMiddleware({
            target: backendTarget,
            changeOrigin: true
        })
    );

    app.use(
        '/socket.io',
        createProxyMiddleware({
            target: backendTarget,
            changeOrigin: true,
            ws: true
        })
    );
};
