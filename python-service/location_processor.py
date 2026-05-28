#!/usr/bin/env python3
"""
Real GPS Location Processor Service
Processes real user location data from frontend, calculates metrics, enriches with city info
"""

import asyncio
import aiomysql
import requests
import math
from datetime import datetime

class LocationProcessor:
    def __init__(self):
        self.pool = None
        self.city_cache = {}  # Cache city lookups
        self.running = True
        
    async def connect_db(self):
        """Connect to MySQL database"""
        try:
            self.pool = await aiomysql.create_pool(
                host='localhost',
                port=3306,
                user='root',
                password='',
                db='tracking_db',
                minsize=5,
                maxsize=20,
                autocommit=True
            )
            print("✅ [Location Processor] Connected to MySQL (MariaDB)")
        except Exception as e:
            print(f"❌ [Location Processor] Database connection failed: {e}")
            raise

    def calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two GPS points using Haversine formula (meters)"""
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
        """Get city name from coordinates using Nominatim (OpenStreetMap)."""
        cache_key = f"{lat:.4f},{lon:.4f}"

        if cache_key in self.city_cache:
            return self.city_cache[cache_key]

        try:
            response = requests.get(
                'https://nominatim.openstreetmap.org/reverse',
                params={'lat': lat, 'lon': lon, 'format': 'json', 'zoom': 10, 'addressdetails': 1},
                timeout=3,
                headers={'User-Agent': 'TrackingSystem/1.0'}
            )
            if response.status_code == 200:
                data = response.json()
                address = data.get('address', {})
                city = (
                    address.get('city')
                    or address.get('town')
                    or address.get('village')
                    or address.get('county')
                    or address.get('district')
                    or 'Unknown Location'
                )
                self.city_cache[cache_key] = city
                return city
        except Exception:
            pass

        return 'Location Unknown'

    async def process_real_locations(self):
        """Main processor: Get real user locations, calculate metrics, update database"""
        print("🚀 [Location Processor] Starting real location tracking...")
        print("   ✓ Processes REAL GPS coordinates from users")
        print("   ✓ No fake/simulated data")
        print("   ✓ Detects city/town/village")
        print("   ✓ Calculates speed and movement status\n")
        
        while self.running:
            try:
                async with self.pool.acquire() as conn:
                    async with conn.cursor() as cursor:
                        # Get all active user devices (from last 30 minutes)
                        await cursor.execute("""
                            SELECT DISTINCT device_id 
                            FROM gps_tracks 
                            WHERE device_id LIKE 'user_%'
                            AND timestamp > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
                            ORDER BY device_id
                        """)
                        
                        active_users = await cursor.fetchall()
                        
                        for (device_id,) in active_users:
                            # Get last 2 GPS points for this user
                            await cursor.execute("""
                                SELECT latitude, longitude, speed, heading, timestamp
                                FROM gps_tracks
                                WHERE device_id = %s
                                ORDER BY timestamp DESC
                                LIMIT 2
                            """, (device_id,))
                            
                            points = await cursor.fetchall()
                            
                            if len(points) >= 2:
                                curr_lat, curr_lon, curr_speed, curr_heading, curr_time = points[0]
                                prev_lat, prev_lon, prev_speed, prev_heading, prev_time = points[1]
                                
                                # Calculate distance traveled (meters)
                                distance_m = self.calculate_distance(prev_lat, prev_lon, curr_lat, curr_lon)
                                time_diff = (curr_time - prev_time).total_seconds()
                                
                                # Calculate speed in m/s and km/h
                                calculated_speed_ms = distance_m / time_diff if time_diff > 0 else 0
                                calculated_speed_kmh = calculated_speed_ms * 3.6
                                
                                # Use max of reported speed and calculated speed
                                final_speed = max((curr_speed or 0) * 3.6, calculated_speed_kmh)
                                
                                # Determine movement status (moving if > 1.8 km/h)
                                is_moving = final_speed > 1.8
                                
                                # Get city name for coordinates
                                city = self.get_city_from_coords(curr_lat, curr_lon)
                                
                                # Update database with calculated values
                                await cursor.execute("""
                                    UPDATE gps_tracks
                                    SET speed = %s, is_moving = %s, city = %s, heading = %s
                                    WHERE device_id = %s AND timestamp = %s
                                """, (final_speed / 3.6, is_moving, city, curr_heading or 0, device_id, curr_time))
                                
                                # Display real location info
                                status_icon = "🏃" if is_moving else "⏸️"
                                print(f"📍 [{city:20}] {device_id:15} | {curr_lat:.6f}, {curr_lon:.6f} | {status_icon} {final_speed:6.1f} km/h")
                
                await asyncio.sleep(5)  # Process every 5 seconds
                
            except Exception as e:
                print(f"❌ [Location Processor] Error: {e}")
                await asyncio.sleep(5)

    async def close(self):
        """Close database connection"""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            print("\n✅ [Location Processor] Closed database connection")

async def main():
    """Main entry point"""
    processor = LocationProcessor()
    
    try:
        await processor.connect_db()
        await processor.process_real_locations()
    except KeyboardInterrupt:
        print("\n⏹️  Shutdown requested...")
        processor.running = False
    finally:
        await processor.close()

if __name__ == '__main__':
    asyncio.run(main())
