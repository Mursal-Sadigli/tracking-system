// GPS Simulator Client - Sadə Arka Plan Simulyasiyası
const io = require('socket.io-client');

const socket = io('http://localhost:3000');

// Hər cihaz üçün ayrı pozisyon saxla
const positions = {
    'phone_001': {
        lat: 40.4093,
        lon: 49.8671,
        angle: 0,
        speed: 0
    },
    'phone_002': {
        lat: 40.4100,
        lon: 49.8680,
        angle: 45,
        speed: 0
    },
    'car_001': {
        lat: 40.4080,
        lon: 49.8650,
        angle: 180,
        speed: 0
    }
};

socket.on('connect', () => {
    console.log('✅ GPS Simulator başladı');
    
    // Hər 3 saniyədə bir güncəllə (bildirişsiz)
    setInterval(() => {
        Object.keys(positions).forEach((deviceId) => {
            const pos = positions[deviceId];
            
            // Kiçik rəndəm hərəkət
            pos.lat += (Math.random() - 0.5) * 0.0008;
            pos.lon += (Math.random() - 0.5) * 0.0008;
            pos.angle += (Math.random() - 0.5) * 5;
            pos.speed = Math.random() * 18;
            
            socket.emit('gps_update', {
                device_id: deviceId,
                latitude: pos.lat,
                longitude: pos.lon,
                speed: pos.speed,
                heading: (pos.angle % 360 + 360) % 360
            });
        });
    }, 3000);
});

socket.on('disconnect', () => {
    console.log('❌ Serverlə əlaqə kəsildi');
});

process.on('SIGINT', () => {
    console.log('\n✋ GPS Simulator durduruldu');
    process.exit(0);
});
