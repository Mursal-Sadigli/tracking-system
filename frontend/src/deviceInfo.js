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

    return {
        device_name: `${device_type} - ${browser}`,
        device_type,
        browser,
        user_agent: ua
    };
}
