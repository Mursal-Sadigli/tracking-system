export function getNetworkInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
        online: navigator.onLine,
        effective_type: conn?.effectiveType || null,
        downlink_mbps: conn?.downlink != null ? conn.downlink : null,
        rtt_ms: conn?.rtt != null ? conn.rtt : null,
        save_data: conn?.saveData ?? null
    };
}

export function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';
    else if (ua.indexOf('Edge') > -1) browser = 'Edge';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';

    let device_type = 'Desktop';
    if (/Android/i.test(ua)) device_type = 'Android Phone';
    else if (/iPhone|iPad|iPod/i.test(ua)) device_type = 'iPhone/iPad';
    else if (/Windows Phone/i.test(ua)) device_type = 'Windows Phone';
    else if (/tablet/i.test(ua)) device_type = 'Tablet';

    let os = 'Unknown';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac OS|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    return {
        device_name: `${device_type} - ${browser}`,
        device_type,
        browser,
        os,
        user_agent: ua,
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
        pixel_ratio: window.devicePixelRatio || 1,
        language: navigator.language || '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        network: getNetworkInfo()
    };
}
