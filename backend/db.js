const mysql = require('mysql2');

/** Render-də DB_HOST yoxdursa MySQL söndürülür; yerli inkişafda localhost istifadə olunur */
const DB_ENABLED =
    process.env.DB_HOST != null && String(process.env.DB_HOST).trim() !== ''
        ? true
        : process.env.RENDER !== 'true';

const noopPool = {
    execute: async () => [[]],
    query: async () => [{ affectedRows: 0 }]
};

let promisePool = noopPool;

if (DB_ENABLED) {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'tracking_user',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'tracking_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    promisePool = pool.promise();
}

async function initDB() {
    if (!DB_ENABLED) {
        console.log(
            'ℹ️ MySQL söndürülüb — real-time izləmə yaddaşda işləyir. DB üçün Render-də DB_HOST və s. env əlavə edin.'
        );
        return;
    }

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
        console.error('❌ Database error:', error.message || error);
    }
}

module.exports = { pool: promisePool, initDB, DB_ENABLED };
