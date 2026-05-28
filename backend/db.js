const mysql = require('mysql2');

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
            'ℹ️ MySQL söndürülüb — case/track data JSON store-da saxlanır (backend/data/store.json).'
        );
        return;
    }

    try {
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS cases (
                case_id VARCHAR(64) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                priority VARCHAR(20) DEFAULT 'normal',
                subject_token VARCHAR(64) UNIQUE NOT NULL,
                device_id VARCHAR(100),
                notes TEXT,
                speed_limit_kmh INT DEFAULT 80,
                corridor_buffer_m INT DEFAULT 200,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP NULL
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS case_events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                case_id VARCHAR(64) NOT NULL,
                event_type VARCHAR(64) NOT NULL,
                device_id VARCHAR(100),
                payload_json JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_case_events (case_id, created_at)
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS mission_routes (
                case_id VARCHAR(64) PRIMARY KEY,
                geojson_line JSON NOT NULL,
                corridor_buffer_m INT DEFAULT 200,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS consent_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                case_id VARCHAR(64),
                subject_token VARCHAR(64),
                ip_address VARCHAR(64),
                user_agent TEXT,
                consent_text_hash VARCHAR(64),
                granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS gps_tracks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                device_id VARCHAR(100) NOT NULL,
                case_id VARCHAR(64),
                latitude DOUBLE NOT NULL,
                longitude DOUBLE NOT NULL,
                speed FLOAT DEFAULT 0,
                heading FLOAT DEFAULT 0,
                is_moving BOOLEAN DEFAULT false,
                accuracy FLOAT,
                location_quality VARCHAR(32),
                battery_level INT DEFAULT 100,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                device_name VARCHAR(100),
                device_type VARCHAR(64),
                browser VARCHAR(64),
                user_agent TEXT,
                INDEX idx_device_time (device_id, timestamp),
                INDEX idx_case_time (case_id, timestamp)
            )
        `);

        console.log('✅ MySQL database initialized (cases, events, tracks)');
    } catch (error) {
        console.error('❌ Database error:', error.message || error);
    }
}

async function runRetention(days = 30) {
    if (!DB_ENABLED) return { deleted: 0 };
    try {
        const [result] = await promisePool.execute(
            `DELETE FROM gps_tracks WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );
        return { deleted: result.affectedRows || 0 };
    } catch (e) {
        console.warn('Retention:', e.message);
        return { deleted: 0 };
    }
}

module.exports = { pool: promisePool, initDB, DB_ENABLED, runRetention };
