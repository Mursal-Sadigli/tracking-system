const io = require('socket.io-client');

// Connect to backend
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('✅ Connected to backend');
    
    // Simulate device movement from starting point
    let lat = 40.4093;  // Baku
    let lon = 49.8671;
    let speed = 5;      // m/s
    let heading = 45;   // degrees
    let battery = 100;
    
    let count = 0;
    const maxUpdates = 60;  // Send 60 updates
    
    const interval = setInterval(() => {
        if (count >= maxUpdates) {
            clearInterval(interval);
            console.log('✅ Test completed');
            socket.disconnect();
            return;
        }
        
        // Simulate movement (small increments)
        lat += (Math.random() - 0.5) * 0.001;
        lon += (Math.random() - 0.5) * 0.001;
        speed = 8 + Math.random() * 15;  // 8-23 m/s (varies)
        heading = (heading + Math.random() * 30 - 15) % 360;
        battery = Math.max(20, battery - 0.5);  // Gradually decrease
        
        const data = {
            device_id: 'test-device-1',
            latitude: lat,
            longitude: lon,
            speed: speed,
            heading: Math.round(heading),
            battery_level: Math.round(battery),
            accuracy: 5,
            device_name: 'Test Device - Chrome',
            device_type: 'Desktop',
            browser: 'Chrome',
            user_agent: 'Mozilla/5.0'
        };
        
        socket.emit('user_location_update', data);
        console.log(`📍 Update ${count + 1}/${maxUpdates}: lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)}, speed=${speed.toFixed(1)}m/s, heading=${heading.toFixed(0)}°, battery=${battery.toFixed(0)}%`);
        
        count++;
    }, 1000);  // Update every second
});

socket.on('location_update', (data) => {
    console.log('📡 Received from backend:', data.device_id, data.latitude, data.longitude);
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected');
});
