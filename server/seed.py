import random
from datetime import datetime, timedelta, timezone
import psycopg
from app.core.config import settings
from app.core.security import get_password_hash
from migrate import apply_all

def seed_db():
    print("Seeding database...")
    conn_str = settings.database_url

    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            # Clean db first
            cur.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;")

        # Rebuild schema from the migration files
        apply_all(conn)

        with conn.cursor() as cur:
            # Create users
            hashed = get_password_hash("password123")
            cur.execute("""
                INSERT INTO users (email, password_hash, role) VALUES 
                ('admin@quickcourt.com', %s, 'admin'),
                ('owner1@quickcourt.com', %s, 'owner'),
                ('owner2@quickcourt.com', %s, 'owner'),
                ('user1@quickcourt.com', %s, 'user'),
                ('user2@quickcourt.com', %s, 'user'),
                ('user3@quickcourt.com', %s, 'user')
                RETURNING id, role;
            """, (hashed, hashed, hashed, hashed, hashed, hashed))
            users = cur.fetchall()
            owners = [u[0] for u in users if u[1] == 'owner']
            regular_users = [u[0] for u in users if u[1] == 'user']
            
            # Create 6 venues
            venues_data = [
                (owners[0], 'Downtown Hoops', 'Premium indoor basketball courts in the heart of the city.', 'approved'),
                (owners[0], 'City Tennis Center', 'Professional grade clay and hard tennis courts.', 'approved'),
                (owners[1], 'Westside Padel', 'New padel courts with glass walls.', 'approved'),
                (owners[1], 'Elite Squash Club', 'High-end squash courts.', 'approved'),
                (owners[0], 'Community Soccer Fields', 'Outdoor artificial turf for 5v5.', 'approved'),
                (owners[1], 'Pending Court Arena', 'A newly submitted arena.', 'pending')
            ]
            
            venue_ids = []
            for v in venues_data:
                cur.execute("INSERT INTO venues (owner_id, name, description, status) VALUES (%s, %s, %s, %s) RETURNING id;", v)
                venue_ids.append(cur.fetchone()[0])
            
            # Add photos
            photos = [
                'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1526627725916-d352ba8311a6?auto=format&fit=crop&q=80'
            ]
            for vid in venue_ids:
                for i, photo_url in enumerate(photos[:random.randint(1,4)]):
                    cur.execute("INSERT INTO venue_photos (venue_id, url, display_order) VALUES (%s, %s, %s);", (vid, photo_url, i))

            # Add courts to approved venues
            court_ids = []
            for vid in venue_ids[:-1]: # skip pending
                for i in range(1, random.randint(2, 5)):
                    cur.execute("""
                        INSERT INTO courts (venue_id, name, sport, price_per_hour, open_time, close_time) 
                        VALUES (%s, %s, %s, %s, '08:00', '22:00') RETURNING id, price_per_hour;
                    """, (vid, f'Court {i}', random.choice(['Basketball', 'Tennis', 'Padel', 'Squash', 'Soccer']), random.randint(20, 100)))
                    court_ids.append(cur.fetchone())
                    
            # Add bookings (past and future)
            now = datetime.now(timezone.utc)
            for cid, price in court_ids:
                # 2 past completed bookings
                for _ in range(2):
                    days_ago = random.randint(1, 30)
                    start_hour = random.randint(9, 20)
                    start_time = now - timedelta(days=days_ago)
                    start_time = start_time.replace(hour=start_hour, minute=0, second=0, microsecond=0)
                    end_time = start_time + timedelta(hours=1)
                    user_id = random.choice(regular_users)
                    
                    cur.execute("""
                        INSERT INTO bookings (court_id, user_id, type, time_range, status, price_snapshot) 
                        VALUES (%s, %s, 'booking', tstzrange(%s, %s, '[)'), 'completed', %s) RETURNING id;
                    """, (cid, user_id, start_time, end_time, price))
                    booking_id = cur.fetchone()[0]
                    
                    # Add review for completed booking
                    if random.random() > 0.3:
                        rating = random.randint(3, 5)
                        comments = ["Great court!", "Nice facilities.", "Had a fun time.", "Court was clean.", "A bit pricey but good."]
                        cur.execute("""
                            INSERT INTO reviews (booking_id, booking_status, user_id, rating, comment) 
                            VALUES (%s, 'completed', %s, %s, %s);
                        """, (booking_id, user_id, rating, random.choice(comments)))
                        
                # 1 future confirmed booking
                days_ahead = random.randint(1, 14)
                start_hour = random.randint(9, 20)
                start_time = now + timedelta(days=days_ahead)
                start_time = start_time.replace(hour=start_hour, minute=0, second=0, microsecond=0)
                end_time = start_time + timedelta(hours=1)
                
                cur.execute("""
                    INSERT INTO bookings (court_id, user_id, type, time_range, status, price_snapshot) 
                    VALUES (%s, %s, 'booking', tstzrange(%s, %s, '[)'), 'confirmed', %s);
                """, (cid, random.choice(regular_users), start_time, end_time, price))

        conn.commit()
    print("Database seeded.")

if __name__ == "__main__":
    seed_db()
