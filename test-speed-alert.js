const io = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('✅ Connected for high-speed test');
    
    let lat = 40.4093;
    let lon = 49.8671;
    let count = 0;
    
    const interval = setInterval(() => {
        // Send high speed (100 km/h = 27.8 m/s) to trigger SPEED_ALERT (>50 km/h)
        const speed = 30;  // 30 m/s = 108 km/h (well over 50 km/h threshold)
        
        lat += (Math.random() - 0.5) * 0.005;  // Larger movements
        lon += (Math.random() - 0.5) * 0.005;
        
        const data = {
            device_id: 'speed-test-device',
            latitude: lat,
            longitude: lon,
            speed: speed,
            heading: Math.random() * 360,
            battery_level: 100,
            accuracy: 5,
            device_name: 'Speed Test - Chrome',
            device_type: 'Desktop',
            browser: 'Chrome',
            user_agent: 'Mozilla/5.0'
        };
        
        socket.emit('user_location_update', data);
        console.log(`📍 Update ${count + 1}: speed=${speed}m/s (${(speed * 3.6).toFixed(1)}km/h) - Should trigger speed alert!`);
        
        count++;
        if (count >= 5) {
            clearInterval(interval);
            console.log('✅ Speed test completed');
            socket.disconnect();
        }
    }, 1000);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected');
});
