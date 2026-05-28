import asyncio
import aiomysql
import json
import math
import requests
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional, Tuple

@dataclass
class GPSPoint:
    device_id: str
    latitude: float
    longitude: float
    speed: float
    heading: float
    timestamp: datetime

class GPSProcessor:
    def __init__(self):
        self.pool = None
        self.last_positions = {}  # device_id -> last position
        self.running = True
        self.city_cache = {}  # Cache for city lookups
        
    async def connect_db(self):
        """MySQL bağlantısı (XAMPP/MariaDB üçün)"""
        self.pool = await aiomysql.create_pool(
            host='localhost',
            port=3306,
            user='root',
            password='',  # Şifrə yoxdur (XAMPP default)
            db='tracking_db',
            minsize=5,
            maxsize=20,
            autocommit=True
        )
        print("✅ Python Service: Connected to MySQL (MariaDB)")
    
    def calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Haversine formula - calculate distance between two points in meters"""
        R = 6371000  # Earth radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * \
            math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def get_city_from_coords(self, lat: float, lon: float) -> str:
        """Get city name from coordinates using reverse geocoding"""
        cache_key = f"{lat:.3f},{lon:.3f}"
        if cache_key in self.city_cache:
            return self.city_cache[cache_key]
        
        try:
            # Using Nominatim for reverse geocoding
            response = requests.get(
                f'https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=10&addressdetails=1',
                timeout=2
            )
            if response.status_code == 200:
                data = response.json()
                address = data.get('address', {})
                
                # Try to get city, town, or village
                city = address.get('city') or \
                       address.get('town') or \
                       address.get('village') or \
                       address.get('county') or \
                       'Unknown'
                
                self.city_cache[cache_key] = city
                return city
        except Exception as e:
            print(f"⚠️  City lookup error: {e}")
        
        return 'Unknown'
    
    async def process_real_gps_data(self):
        """Process real GPS data from database - runs continuously"""
        print("🚀 Python Service: Starting real GPS data processor...")
        
        while self.running:
            try:
                async with self.pool.acquire() as conn:
                    async with conn.cursor() as cursor:
                        # Get latest GPS points for each active device
                        await cursor.execute("""
                            SELECT device_id, MAX(timestamp) as last_time 
                            FROM gps_tracks 
                            WHERE timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                            GROUP BY device_id
                        """)
                        
                        active_devices = await cursor.fetchall()
                        
                        for device_id, last_time in active_devices:
                            if not device_id.startswith('user_'):
                                continue  # Only process real user devices
                            
                            # Get last 2 points for this device
                            await cursor.execute("""
                                SELECT latitude, longitude, speed, heading, timestamp 
                                FROM gps_tracks 
                                WHERE device_id = %s 
                                ORDER BY timestamp DESC 
                                LIMIT 2
                            """, (device_id,))
                            
                            points = await cursor.fetchall()
                            
                            if len(points) >= 2:
                                curr = points[0]
                                prev = points[1]
                                
                                curr_lat, curr_lon, curr_speed, curr_heading, curr_time = curr
                                prev_lat, prev_lon, prev_speed, prev_heading, prev_time = prev
                                
                                # Calculate actual speed from distance
                                distance = self.calculate_distance(prev_lat, prev_lon, curr_lat, curr_lon)
                                time_diff = (curr_time - prev_time).total_seconds()
                                
                                if time_diff > 0:
                                    calculated_speed = distance / time_diff  # m/s
                                else:
                                    calculated_speed = 0
                                
                                # Use max of reported and calculated speed
                                final_speed = max(curr_speed or 0, calculated_speed)
                                is_moving = final_speed > 0.5  # > 1.8 km/h
                                
                                # Get city for this location
                                city = self.get_city_from_coords(curr_lat, curr_lon)
                                
                                # Update gps_tracks with city and calculated speed
                                await cursor.execute("""
                                    UPDATE gps_tracks 
                                    SET speed = %s, is_moving = %s, city = %s
                                    WHERE device_id = %s AND timestamp = %s
                                """, (final_speed, is_moving, city, device_id, curr_time))
                                
                                status = "🏃 Moving" if is_moving else "⏸️ Stopped"
                                speed_kmh = final_speed * 3.6
                                print(f"[{city}] {device_id}: {curr_lat:.6f}, {curr_lon:.6f} | {status} | {speed_kmh:.1f} km/h")
                        
                await asyncio.sleep(5)  # Process every 5 seconds
                
            except Exception as e:
                print(f"❌ Error processing GPS data: {e}")
                await asyncio.sleep(5)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def calculate_speed(self, prev: GPSPoint, curr: GPSPoint) -> float:
        """Calculate speed in m/s between two points"""
        distance = self.calculate_distance(
            prev.latitude, prev.longitude,
            curr.latitude, curr.longitude
        )
        time_diff = (curr.timestamp - prev.timestamp).total_seconds()
        
        if time_diff > 0:
            return distance / time_diff
        return 0.0
    
    async def process_gps_point(self, point: GPSPoint):
        """Process a single GPS point"""
        # Get last position for this device
        last_pos = self.last_positions.get(point.device_id)
        
        if last_pos:
            # Calculate actual speed from movement
            calculated_speed = self.calculate_speed(last_pos, point)
            
            # Use max of reported speed and calculated speed
            final_speed = max(point.speed, calculated_speed)
            
            # Determine if moving (faster than 0.5 m/s = 1.8 km/h)
            is_moving = final_speed > 0.5
            
            # Calculate heading if moving
            if is_moving:
                heading = math.degrees(
                    math.atan2(
                        point.longitude - last_pos.longitude,
                        point.latitude - last_pos.latitude
                    )
                )
                if heading < 0:
                    heading += 360
            else:
                heading = point.heading or 0
        else:
            final_speed = point.speed or 0
            is_moving = final_speed > 0.5
            heading = point.heading or 0
        
        # Save to MySQL database
        async with self.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                    INSERT INTO gps_tracks (device_id, latitude, longitude, speed, heading, is_moving, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (point.device_id, point.latitude, point.longitude, 
                      final_speed, heading, is_moving, point.timestamp))
        
        # Update last position
        self.last_positions[point.device_id] = point
        
        # Print summary
        status = "🏃 Moving" if is_moving else "⏸️ Stopped"
        print(f"[Python] {point.device_id}: {point.latitude:.6f}, {point.longitude:.6f} | {status} | {final_speed * 3.6:.1f} km/h")
    
    async def simulate_gps_data(self):
        """Simulate GPS data for testing"""
        # Start position (Baku city center)
        base_lat = 40.4093
        base_lon = 49.8671
        
        devices = ['device_001', 'device_002', 'device_003']
        positions = {}
        
        for device in devices:
            positions[device] = {
                'lat': base_lat + random.uniform(-0.01, 0.01),
                'lon': base_lon + random.uniform(-0.01, 0.01),
                'angle': random.uniform(0, 360),
                'speed': random.uniform(0, 15)  # 0-54 km/h
            }
        
        print("🔄 Starting GPS simulation...")
        
        while self.running:
            for device in devices:
                pos = positions[device]
                
                # Move point
                if pos['speed'] > 0.1:
                    # Convert speed from m/s to degrees (approx)
                    distance_per_sec = pos['speed'] / 111320
                    rad = math.radians(pos['angle'])
                    
                    pos['lat'] += distance_per_sec * math.cos(rad)
                    pos['lon'] += distance_per_sec * math.sin(rad)
                    
                    # Randomly change direction
                    if random.random() < 0.05:
                        pos['angle'] += random.uniform(-30, 30)
                        pos['speed'] = max(0, pos['speed'] + random.uniform(-2, 2))
                
                # Create GPS point
                point = GPSPoint(
                    device_id=device,
                    latitude=pos['lat'],
                    longitude=pos['lon'],
                    speed=pos['speed'],
                    heading=pos['angle'],
                    timestamp=datetime.now()
                )
                
                # Process point
                await self.process_gps_point(point)
            
            # Wait 1 second before next update
            await asyncio.sleep(1)
    
    async def run(self):
        await self.connect_db()
        print("🚀 GPS Processor started")
        await self.simulate_gps_data()
    
    def stop(self):
        self.running = False

async def main():
    processor = GPSProcessor()
    try:
        await processor.run()
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
        processor.stop()

if __name__ == "__main__":
    asyncio.run(main())