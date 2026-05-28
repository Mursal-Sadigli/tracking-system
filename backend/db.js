const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'tracking_user',
    password: '',  // Şifrə yoxdur
    database: 'tracking_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

async function initDB() {
    try {
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS devices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id VARCHAR(100) UNIQUE NOT NULL,
                user_id INT,
                name VARCHAR(100),
                is_active BOOLEAN DEFAULT true,
                last_seen TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS gps_tracks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id VARCHAR(100) NOT NULL,
                latitude DOUBLE NOT NULL,
                longitude DOUBLE NOT NULL,
                speed FLOAT DEFAULT 0,
                heading FLOAT DEFAULT 0,
                is_moving BOOLEAN DEFAULT false,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_device_time (device_id, timestamp)
            )
        `);

        console.log('✅ MySQL database initialized');
    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

module.exports = { pool: promisePool, initDB };