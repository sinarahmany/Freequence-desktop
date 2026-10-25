use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::model::*;

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .with_context(|| format!("Failed to open SQLite database at {:?}", path))?;
        
        // Enable WAL mode and foreign keys for high performance and integrity
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                api_key TEXT UNIQUE NOT NULL,
                email TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                last_login_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS artists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sort_name TEXT,
                album_count INTEGER NOT NULL DEFAULT 0,
                song_count INTEGER NOT NULL DEFAULT 0,
                duration REAL NOT NULL DEFAULT 0.0,
                has_image INTEGER NOT NULL DEFAULT 0,
                has_remote_image INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                artist_id TEXT NOT NULL,
                artist TEXT NOT NULL,
                year INTEGER,
                genre TEXT,
                song_count INTEGER NOT NULL DEFAULT 0,
                disc_count INTEGER NOT NULL DEFAULT 1,
                duration REAL NOT NULL DEFAULT 0.0,
                has_cover_art INTEGER NOT NULL DEFAULT 0,
                path TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                path TEXT UNIQUE NOT NULL,
                rel_path TEXT NOT NULL,
                title TEXT NOT NULL,
                album_id TEXT NOT NULL,
                album TEXT NOT NULL,
                artist_id TEXT NOT NULL,
                artist TEXT NOT NULL,
                album_artist TEXT,
                track_number INTEGER,
                disc_number INTEGER,
                year INTEGER,
                genre TEXT,
                duration REAL NOT NULL DEFAULT 0.0,
                bit_rate INTEGER NOT NULL DEFAULT 0,
                sample_rate INTEGER,
                channels INTEGER,
                suffix TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                has_cover_art INTEGER NOT NULL DEFAULT 0,
                mtime INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                item_id TEXT NOT NULL,
                item_type TEXT NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                play_date TEXT,
                rating INTEGER NOT NULL DEFAULT 0,
                starred INTEGER NOT NULL DEFAULT 0,
                starred_at TEXT,
                UNIQUE(user_id, item_id, item_type)
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                comment TEXT,
                owner_id TEXT NOT NULL,
                owner TEXT NOT NULL,
                public INTEGER NOT NULL DEFAULT 0,
                song_count INTEGER NOT NULL DEFAULT 0,
                duration REAL NOT NULL DEFAULT 0.0,
                has_cover INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS play_queues (
                user_id TEXT PRIMARY KEY,
                track_ids TEXT NOT NULL,
                current TEXT,
                position REAL NOT NULL DEFAULT 0.0,
                changed_by TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS library_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
            CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
            CREATE INDEX IF NOT EXISTS idx_annotations_user_item ON annotations(user_id, item_id);
            "
        )?;

        Ok(())
    }

    // --- User management ---
    pub fn get_user_count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
        Ok(count)
    }

    pub fn get_first_admin(&self) -> Result<Option<User>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, email, is_admin, must_change_password, last_login_at, created_at 
             FROM users WHERE is_admin = 1 LIMIT 1"
        )?;
        let user = stmt.query_row([], |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                is_admin: row.get::<_, i32>(3)? != 0,
                must_change_password: row.get::<_, i32>(4)? != 0,
                last_login_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        }).optional()?;
        Ok(user)
    }

    pub fn get_user_by_username(&self, username: &str) -> Result<Option<(User, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, email, is_admin, must_change_password, last_login_at, created_at, password_hash, api_key 
             FROM users WHERE username = ?1"
        )?;
        let result = stmt.query_row(params![username], |row| {
            let user = User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                is_admin: row.get::<_, i32>(3)? != 0,
                must_change_password: row.get::<_, i32>(4)? != 0,
                last_login_at: row.get(5)?,
                created_at: row.get(6)?,
            };
            let hash: String = row.get(7)?;
            let api_key: String = row.get(8)?;
            Ok((user, hash, api_key))
        }).optional()?;
        Ok(result)
    }

    pub fn get_user_by_id(&self, id: &str) -> Result<Option<(User, String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, username, email, is_admin, must_change_password, last_login_at, created_at, password_hash, api_key 
             FROM users WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![id], |row| {
            let user = User {
                id: row.get(0)?,
                username: row.get(1)?,
                email: row.get(2)?,
                is_admin: row.get::<_, i32>(3)? != 0,
                must_change_password: row.get::<_, i32>(4)? != 0,
                last_login_at: row.get(5)?,
                created_at: row.get(6)?,
            };
            let hash: String = row.get(7)?;
            let api_key: String = row.get(8)?;
            Ok((user, hash, api_key))
        }).optional()?;
        Ok(result)
    }

    pub fn create_user(&self, id: &str, username: &str, password_hash: &str, api_key: &str, is_admin: bool) -> Result<User> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, api_key, is_admin, must_change_password, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)",
            params![id, username, password_hash, api_key, if is_admin { 1 } else { 0 }, now],
        )?;
        Ok(User {
            id: id.to_string(),
            username: username.to_string(),
            email: None,
            is_admin,
            must_change_password: false,
            last_login_at: None,
            created_at: now,
        })
    }

    // --- Library Folders ---
    pub fn get_folders(&self) -> Result<Vec<LibraryFolder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, path FROM library_folders ORDER BY name ASC")?;
        let folders = stmt.query_map([], |row| {
            Ok(LibraryFolder {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                label: row.get(2)?,
                builtin: false,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(folders)
    }

    pub fn add_folder(&self, id: &str, name: &str, path: &str) -> Result<LibraryFolder> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO library_folders (id, name, path, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, path, now],
        )?;
        Ok(LibraryFolder {
            id: Some(id.to_string()),
            name: name.to_string(),
            label: path.to_string(),
            builtin: false,
        })
    }

    pub fn remove_folder(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM library_folders WHERE id = ?1", params![id])?;
        Ok(())
    }

    // --- Stats ---
    pub fn get_stats(&self) -> Result<Stats> {
        let conn = self.conn.lock().unwrap();
        let artists: i64 = conn.query_row("SELECT COUNT(*) FROM artists", [], |r| r.get(0)).unwrap_or(0);
        let albums: i64 = conn.query_row("SELECT COUNT(*) FROM albums", [], |r| r.get(0)).unwrap_or(0);
        let (tracks, duration): (i64, f64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(duration), 0.0) FROM tracks", [], |r| Ok((r.get(0)?, r.get(1)?))
        ).unwrap_or((0, 0.0));
        Ok(Stats {
            artists,
            albums,
            tracks,
            duration,
        })
    }

    // --- Tracks ---
    pub fn get_track(&self, id: &str, user_id: &str) -> Result<Option<Track>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.title, t.album_id, t.album, t.artist_id, t.artist, t.album_artist,
                    t.track_number, t.disc_number, t.year, t.genre, t.duration, t.bit_rate,
                    t.sample_rate, t.channels, t.suffix, t.content_type, t.size, t.has_cover_art,
                    t.created_at,
                    COALESCE(a.starred, 0), COALESCE(a.rating, 0), COALESCE(a.play_count, 0)
             FROM tracks t
             LEFT JOIN annotations a ON a.item_id = t.id AND a.user_id = ?2 AND a.item_type = 'track'
             WHERE t.id = ?1"
        )?;
        let track = stmt.query_row(params![id, user_id], |row| {
            let track_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(18)? != 0;
            Ok(Track {
                id: track_id.clone(),
                title: row.get(1)?,
                album_id: row.get(2)?,
                album: row.get(3)?,
                artist_id: row.get(4)?,
                artist: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                bit_rate: row.get(12)?,
                sample_rate: row.get(13)?,
                channels: row.get(14)?,
                suffix: row.get(15)?,
                content_type: row.get(16)?,
                size: row.get(17)?,
                has_cover_art: has_cover,
                created_at: row.get(19)?,
                starred: row.get::<_, i32>(20)? != 0,
                rating: row.get(21)?,
                play_count: row.get(22)?,
                cover_art: if has_cover { Some(track_id.clone()) } else { None },
                stream_url: format!("/api/v1/stream/{}", track_id),
            })
        }).optional()?;
        Ok(track)
    }

    pub fn get_track_path(&self, id: &str) -> Result<Option<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT path, content_type FROM tracks WHERE id = ?1")?;
        let res = stmt.query_row(params![id], |r| Ok((r.get(0)?, r.get(1)?))).optional()?;
        Ok(res)
    }

    pub fn list_tracks(&self, user_id: &str, genre: Option<&str>, size: usize, offset: usize, random: bool) -> Result<Vec<Track>> {
        let conn = self.conn.lock().unwrap();
        let order_clause = if random { "ORDER BY RANDOM()" } else { "ORDER BY t.title ASC" };
        let query = format!(
            "SELECT t.id, t.title, t.album_id, t.album, t.artist_id, t.artist, t.album_artist,
                    t.track_number, t.disc_number, t.year, t.genre, t.duration, t.bit_rate,
                    t.sample_rate, t.channels, t.suffix, t.content_type, t.size, t.has_cover_art,
                    t.created_at,
                    COALESCE(a.starred, 0), COALESCE(a.rating, 0), COALESCE(a.play_count, 0)
             FROM tracks t
             LEFT JOIN annotations a ON a.item_id = t.id AND a.user_id = ?1 AND a.item_type = 'track'
             {}
             {} LIMIT ?2 OFFSET ?3",
            if genre.is_some() { "WHERE t.genre = ?4" } else { "" },
            order_clause
        );

        let mut stmt = conn.prepare(&query)?;
        let mut rows = if let Some(g) = genre {
            stmt.query(params![user_id, size as i64, offset as i64, g])?
        } else {
            stmt.query(params![user_id, size as i64, offset as i64])?
        };

        let mut tracks = Vec::new();
        while let Some(row) = rows.next()? {
            let track_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(18)? != 0;
            tracks.push(Track {
                id: track_id.clone(),
                title: row.get(1)?,
                album_id: row.get(2)?,
                album: row.get(3)?,
                artist_id: row.get(4)?,
                artist: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                bit_rate: row.get(12)?,
                sample_rate: row.get(13)?,
                channels: row.get(14)?,
                suffix: row.get(15)?,
                content_type: row.get(16)?,
                size: row.get(17)?,
                has_cover_art: has_cover,
                created_at: row.get(19)?,
                starred: row.get::<_, i32>(20)? != 0,
                rating: row.get(21)?,
                play_count: row.get(22)?,
                cover_art: if has_cover { Some(track_id.clone()) } else { None },
                stream_url: format!("/api/v1/stream/{}", track_id),
            });
        }
        Ok(tracks)
    }

    // --- Albums ---
    pub fn list_albums(&self, user_id: &str, sort: &str, genre: Option<&str>, size: usize, offset: usize) -> Result<Vec<Album>> {
        let conn = self.conn.lock().unwrap();
        let order = match sort {
            "recent" => "ORDER BY al.created_at DESC",
            "alphabeticalByName" => "ORDER BY al.name ASC",
            "alphabeticalByArtist" => "ORDER BY al.artist ASC",
            "frequent" => "ORDER BY play_count DESC",
            "highest" => "ORDER BY rating DESC",
            "random" => "ORDER BY RANDOM()",
            _ => "ORDER BY al.created_at DESC",
        };

        let query = format!(
            "SELECT al.id, al.name, al.artist_id, al.artist, al.year, al.genre, al.song_count,
                    al.disc_count, al.duration, al.has_cover_art, al.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0)
             FROM albums al
             LEFT JOIN annotations an ON an.item_id = al.id AND an.user_id = ?1 AND an.item_type = 'album'
             {}
             {} LIMIT ?2 OFFSET ?3",
            if genre.is_some() { "WHERE al.genre = ?4" } else { "" },
            order
        );

        let mut stmt = conn.prepare(&query)?;
        let mut rows = if let Some(g) = genre {
            stmt.query(params![user_id, size as i64, offset as i64, g])?
        } else {
            stmt.query(params![user_id, size as i64, offset as i64])?
        };

        let mut albums = Vec::new();
        while let Some(row) = rows.next()? {
            let alb_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(9)? != 0;
            albums.push(Album {
                id: alb_id.clone(),
                name: row.get(1)?,
                artist_id: row.get(2)?,
                artist: row.get(3)?,
                year: row.get(4)?,
                genre: row.get(5)?,
                song_count: row.get(6)?,
                disc_count: row.get(7)?,
                duration: row.get(8)?,
                has_cover_art: has_cover,
                created_at: row.get(10)?,
                starred: row.get::<_, i32>(11)? != 0,
                rating: row.get(12)?,
                play_count: row.get(13)?,
                cover_art: if has_cover { Some(alb_id) } else { None },
            });
        }
        Ok(albums)
    }

    pub fn get_album(&self, id: &str, user_id: &str) -> Result<Option<(Album, Vec<Track>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT al.id, al.name, al.artist_id, al.artist, al.year, al.genre, al.song_count,
                    al.disc_count, al.duration, al.has_cover_art, al.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0)
             FROM albums al
             LEFT JOIN annotations an ON an.item_id = al.id AND an.user_id = ?2 AND an.item_type = 'album'
             WHERE al.id = ?1"
        )?;

        let album = stmt.query_row(params![id, user_id], |row| {
            let alb_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(9)? != 0;
            Ok(Album {
                id: alb_id.clone(),
                name: row.get(1)?,
                artist_id: row.get(2)?,
                artist: row.get(3)?,
                year: row.get(4)?,
                genre: row.get(5)?,
                song_count: row.get(6)?,
                disc_count: row.get(7)?,
                duration: row.get(8)?,
                has_cover_art: has_cover,
                created_at: row.get(10)?,
                starred: row.get::<_, i32>(11)? != 0,
                rating: row.get(12)?,
                play_count: row.get(13)?,
                cover_art: if has_cover { Some(alb_id) } else { None },
            })
        }).optional()?;

        if let Some(album) = album {
            let mut tstmt = conn.prepare(
                "SELECT t.id, t.title, t.album_id, t.album, t.artist_id, t.artist, t.album_artist,
                        t.track_number, t.disc_number, t.year, t.genre, t.duration, t.bit_rate,
                        t.sample_rate, t.channels, t.suffix, t.content_type, t.size, t.has_cover_art,
                        t.created_at,
                        COALESCE(a.starred, 0), COALESCE(a.rating, 0), COALESCE(a.play_count, 0)
                 FROM tracks t
                 LEFT JOIN annotations a ON a.item_id = t.id AND a.user_id = ?2 AND a.item_type = 'track'
                 WHERE t.album_id = ?1
                 ORDER BY t.disc_number ASC, t.track_number ASC, t.title ASC"
            )?;

            let tracks = tstmt.query_map(params![id, user_id], |row| {
                let track_id: String = row.get(0)?;
                let has_cover: bool = row.get::<_, i32>(18)? != 0;
                Ok(Track {
                    id: track_id.clone(),
                    title: row.get(1)?,
                    album_id: row.get(2)?,
                    album: row.get(3)?,
                    artist_id: row.get(4)?,
                    artist: row.get(5)?,
                    album_artist: row.get(6)?,
                    track_number: row.get(7)?,
                    disc_number: row.get(8)?,
                    year: row.get(9)?,
                    genre: row.get(10)?,
                    duration: row.get(11)?,
                    bit_rate: row.get(12)?,
                    sample_rate: row.get(13)?,
                    channels: row.get(14)?,
                    suffix: row.get(15)?,
                    content_type: row.get(16)?,
                    size: row.get(17)?,
                    has_cover_art: has_cover,
                    created_at: row.get(19)?,
                    starred: row.get::<_, i32>(20)? != 0,
                    rating: row.get(21)?,
                    play_count: row.get(22)?,
                    cover_art: if has_cover { Some(track_id.clone()) } else { None },
                    stream_url: format!("/api/v1/stream/{}", track_id),
                })
            })?.filter_map(|r| r.ok()).collect();

            Ok(Some((album, tracks)))
        } else {
            Ok(None)
        }
    }

    // --- Artists ---
    pub fn list_artists(&self, user_id: &str) -> Result<Vec<Artist>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ar.id, ar.name, ar.sort_name, ar.album_count, ar.song_count, ar.duration, ar.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0),
                    ar.has_image
             FROM artists ar
             LEFT JOIN annotations an ON an.item_id = ar.id AND an.user_id = ?1 AND an.item_type = 'artist'
             ORDER BY ar.name COLLATE NOCASE ASC"
        )?;

        let artists = stmt.query_map(params![user_id], |row| {
            let art_id: String = row.get(0)?;
            let has_img: bool = row.get::<_, i32>(10)? != 0;
            Ok(Artist {
                id: art_id.clone(),
                name: row.get(1)?,
                sort_name: row.get(2)?,
                album_count: row.get(3)?,
                song_count: row.get(4)?,
                duration: row.get(5)?,
                created_at: row.get(6)?,
                starred: row.get::<_, i32>(7)? != 0,
                rating: row.get(8)?,
                play_count: row.get(9)?,
                cover_art: if has_img { Some(art_id) } else { None },
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(artists)
    }

    pub fn get_artist(&self, id: &str, user_id: &str) -> Result<Option<(Artist, Vec<Album>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ar.id, ar.name, ar.sort_name, ar.album_count, ar.song_count, ar.duration, ar.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0),
                    ar.has_image
             FROM artists ar
             LEFT JOIN annotations an ON an.item_id = ar.id AND an.user_id = ?2 AND an.item_type = 'artist'
             WHERE ar.id = ?1"
        )?;

        let artist = stmt.query_row(params![id, user_id], |row| {
            let art_id: String = row.get(0)?;
            let has_img: bool = row.get::<_, i32>(10)? != 0;
            Ok(Artist {
                id: art_id.clone(),
                name: row.get(1)?,
                sort_name: row.get(2)?,
                album_count: row.get(3)?,
                song_count: row.get(4)?,
                duration: row.get(5)?,
                created_at: row.get(6)?,
                starred: row.get::<_, i32>(7)? != 0,
                rating: row.get(8)?,
                play_count: row.get(9)?,
                cover_art: if has_img { Some(art_id) } else { None },
            })
        }).optional()?;

        if let Some(artist) = artist {
            let mut astmt = conn.prepare(
                "SELECT al.id, al.name, al.artist_id, al.artist, al.year, al.genre, al.song_count,
                        al.disc_count, al.duration, al.has_cover_art, al.created_at,
                        COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0)
                 FROM albums al
                 LEFT JOIN annotations an ON an.item_id = al.id AND an.user_id = ?2 AND an.item_type = 'album'
                 WHERE al.artist_id = ?1
                 ORDER BY al.year DESC, al.name ASC"
            )?;

            let albums = astmt.query_map(params![id, user_id], |row| {
                let alb_id: String = row.get(0)?;
                let has_cover: bool = row.get::<_, i32>(9)? != 0;
                Ok(Album {
                    id: alb_id.clone(),
                    name: row.get(1)?,
                    artist_id: row.get(2)?,
                    artist: row.get(3)?,
                    year: row.get(4)?,
                    genre: row.get(5)?,
                    song_count: row.get(6)?,
                    disc_count: row.get(7)?,
                    duration: row.get(8)?,
                    has_cover_art: has_cover,
                    created_at: row.get(10)?,
                    starred: row.get::<_, i32>(11)? != 0,
                    rating: row.get(12)?,
                    play_count: row.get(13)?,
                    cover_art: if has_cover { Some(alb_id) } else { None },
                })
            })?.filter_map(|r| r.ok()).collect();

            Ok(Some((artist, albums)))
        } else {
            Ok(None)
        }
    }

    // --- Genres ---
    pub fn list_genres(&self) -> Result<Vec<Genre>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT genre, COUNT(*), COUNT(DISTINCT album_id)
             FROM tracks
             WHERE genre IS NOT NULL AND genre != ''
             GROUP BY genre
             ORDER BY COUNT(*) DESC"
        )?;

        let genres = stmt.query_map([], |row| {
            Ok(Genre {
                name: row.get(0)?,
                song_count: row.get(1)?,
                album_count: row.get(2)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(genres)
    }

    // --- Search ---
    pub fn search(&self, user_id: &str, q: &str) -> Result<SearchResults> {
        let conn = self.conn.lock().unwrap();
        let pattern = format!("%{}%", q);

        // Search artists
        let mut art_stmt = conn.prepare(
            "SELECT ar.id, ar.name, ar.sort_name, ar.album_count, ar.song_count, ar.duration, ar.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0),
                    ar.has_image
             FROM artists ar
             LEFT JOIN annotations an ON an.item_id = ar.id AND an.user_id = ?1 AND an.item_type = 'artist'
             WHERE ar.name LIKE ?2
             LIMIT 20"
        )?;
        let artists = art_stmt.query_map(params![user_id, pattern], |row| {
            let art_id: String = row.get(0)?;
            let has_img: bool = row.get::<_, i32>(10)? != 0;
            Ok(Artist {
                id: art_id.clone(),
                name: row.get(1)?,
                sort_name: row.get(2)?,
                album_count: row.get(3)?,
                song_count: row.get(4)?,
                duration: row.get(5)?,
                created_at: row.get(6)?,
                starred: row.get::<_, i32>(7)? != 0,
                rating: row.get(8)?,
                play_count: row.get(9)?,
                cover_art: if has_img { Some(art_id) } else { None },
            })
        })?.filter_map(|r| r.ok()).collect();

        // Search albums
        let mut alb_stmt = conn.prepare(
            "SELECT al.id, al.name, al.artist_id, al.artist, al.year, al.genre, al.song_count,
                    al.disc_count, al.duration, al.has_cover_art, al.created_at,
                    COALESCE(an.starred, 0), COALESCE(an.rating, 0), COALESCE(an.play_count, 0)
             FROM albums al
             LEFT JOIN annotations an ON an.item_id = al.id AND an.user_id = ?1 AND an.item_type = 'album'
             WHERE al.name LIKE ?2 OR al.artist LIKE ?2
             LIMIT 20"
        )?;
        let albums = alb_stmt.query_map(params![user_id, pattern], |row| {
            let alb_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(9)? != 0;
            Ok(Album {
                id: alb_id.clone(),
                name: row.get(1)?,
                artist_id: row.get(2)?,
                artist: row.get(3)?,
                year: row.get(4)?,
                genre: row.get(5)?,
                song_count: row.get(6)?,
                disc_count: row.get(7)?,
                duration: row.get(8)?,
                has_cover_art: has_cover,
                created_at: row.get(10)?,
                starred: row.get::<_, i32>(11)? != 0,
                rating: row.get(12)?,
                play_count: row.get(13)?,
                cover_art: if has_cover { Some(alb_id) } else { None },
            })
        })?.filter_map(|r| r.ok()).collect();

        // Search tracks
        let mut trk_stmt = conn.prepare(
            "SELECT t.id, t.title, t.album_id, t.album, t.artist_id, t.artist, t.album_artist,
                    t.track_number, t.disc_number, t.year, t.genre, t.duration, t.bit_rate,
                    t.sample_rate, t.channels, t.suffix, t.content_type, t.size, t.has_cover_art,
                    t.created_at,
                    COALESCE(a.starred, 0), COALESCE(a.rating, 0), COALESCE(a.play_count, 0)
             FROM tracks t
             LEFT JOIN annotations a ON a.item_id = t.id AND a.user_id = ?1 AND a.item_type = 'track'
             WHERE t.title LIKE ?2 OR t.artist LIKE ?2 OR t.album LIKE ?2
             LIMIT 50"
        )?;
        let tracks = trk_stmt.query_map(params![user_id, pattern], |row| {
            let track_id: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(18)? != 0;
            Ok(Track {
                id: track_id.clone(),
                title: row.get(1)?,
                album_id: row.get(2)?,
                album: row.get(3)?,
                artist_id: row.get(4)?,
                artist: row.get(5)?,
                album_artist: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                year: row.get(9)?,
                genre: row.get(10)?,
                duration: row.get(11)?,
                bit_rate: row.get(12)?,
                sample_rate: row.get(13)?,
                channels: row.get(14)?,
                suffix: row.get(15)?,
                content_type: row.get(16)?,
                size: row.get(17)?,
                has_cover_art: has_cover,
                created_at: row.get(19)?,
                starred: row.get::<_, i32>(20)? != 0,
                rating: row.get(21)?,
                play_count: row.get(22)?,
                cover_art: if has_cover { Some(track_id.clone()) } else { None },
                stream_url: format!("/api/v1/stream/{}", track_id),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(SearchResults {
            artists,
            albums,
            tracks,
        })
    }

    // --- Annotations (Star, Rate, Scrobble) ---
    pub fn set_star(&self, user_id: &str, item_id: &str, item_type: &str, starred: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO annotations (user_id, item_id, item_type, starred, starred_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id, item_id, item_type) DO UPDATE SET
             starred = ?4,
             starred_at = CASE WHEN ?4 = 1 THEN ?5 ELSE starred_at END",
            params![user_id, item_id, item_type, if starred { 1 } else { 0 }, now],
        )?;
        Ok(())
    }

    pub fn set_rating(&self, user_id: &str, item_id: &str, item_type: &str, rating: i32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO annotations (user_id, item_id, item_type, rating)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, item_id, item_type) DO UPDATE SET rating = ?4",
            params![user_id, item_id, item_type, rating],
        )?;
        Ok(())
    }

    pub fn scrobble(&self, user_id: &str, track_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO annotations (user_id, item_id, item_type, play_count, play_date)
             VALUES (?1, ?2, 'track', 1, ?3)
             ON CONFLICT(user_id, item_id, item_type) DO UPDATE SET
             play_count = play_count + 1,
             play_date = ?3",
            params![user_id, track_id, now],
        )?;
        Ok(())
    }

    // --- Play Queue ---
    pub fn get_queue(&self, user_id: &str) -> Result<SavedQueue> {
        let conn = self.conn.lock().unwrap();
        let row = conn.query_row(
            "SELECT track_ids, current, position FROM play_queues WHERE user_id = ?1",
            params![user_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, f64>(2)?))
        ).optional()?;

        if let Some((track_ids_str, current, pos)) = row {
            let ids: Vec<String> = serde_json::from_str(&track_ids_str).unwrap_or_default();
            drop(conn); // release lock before listing tracks
            let mut tracks = Vec::new();
            for tid in &ids {
                if let Ok(Some(trk)) = self.get_track(tid, user_id) {
                    tracks.push(trk);
                }
            }
            Ok(SavedQueue {
                track_ids: ids,
                current: current.unwrap_or_default(),
                position: pos,
                tracks,
            })
        } else {
            Ok(SavedQueue {
                track_ids: vec![],
                current: String::new(),
                position: 0.0,
                tracks: vec![],
            })
        }
    }

    pub fn save_queue(&self, user_id: &str, track_ids: &[String], current: &str, position: f64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let json_ids = serde_json::to_string(track_ids)?;
        conn.execute(
            "INSERT INTO play_queues (user_id, track_ids, current, position, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id) DO UPDATE SET
             track_ids = ?2,
             current = ?3,
             position = ?4,
             updated_at = ?5",
            params![user_id, json_ids, current, position, now],
        )?;
        Ok(())
    }

    // --- Playlists ---
    pub fn list_playlists(&self, user_id: &str) -> Result<Vec<Playlist>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, comment, owner_id, owner, public, song_count, duration, has_cover, created_at, updated_at
             FROM playlists WHERE owner_id = ?1 OR public = 1 ORDER BY name ASC"
        )?;
        let playlists = stmt.query_map(params![user_id], |row| {
            let pid: String = row.get(0)?;
            let has_cover: bool = row.get::<_, i32>(8)? != 0;
            Ok(Playlist {
                id: pid.clone(),
                name: row.get(1)?,
                comment: row.get(2)?,
                owner_id: row.get(3)?,
                owner: row.get(4)?,
                public: row.get::<_, i32>(5)? != 0,
                song_count: row.get(6)?,
                duration: row.get(7)?,
                has_cover,
                cover_art: if has_cover { Some(pid) } else { None },
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(playlists)
    }

    pub fn create_playlist(&self, id: &str, name: &str, owner_id: &str, owner_name: &str, track_ids: &[String]) -> Result<Playlist> {
        let mut conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let tx = conn.transaction()?;

        tx.execute(
            "INSERT INTO playlists (id, name, owner_id, owner, public, song_count, duration, has_cover, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, 0, 0, 0, ?5, ?5)",
            params![id, name, owner_id, owner_name, now],
        )?;

        for (pos, tid) in track_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO playlist_entries (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![id, tid, pos as i32],
            )?;
        }

        tx.execute(
            "UPDATE playlists SET
             song_count = (SELECT COUNT(*) FROM playlist_entries WHERE playlist_id = ?1),
             duration = (SELECT COALESCE(SUM(t.duration), 0.0) FROM playlist_entries pe JOIN tracks t ON t.id = pe.track_id WHERE pe.playlist_id = ?1)
             WHERE id = ?1",
            params![id],
        )?;

        tx.commit()?;

        Ok(Playlist {
            id: id.to_string(),
            name: name.to_string(),
            comment: None,
            owner_id: owner_id.to_string(),
            owner: owner_name.to_string(),
            public: false,
            song_count: track_ids.len() as i32,
            duration: 0.0,
            has_cover: false,
            cover_art: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn raw_conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_init_and_users() {
        let db = Db::open_in_memory().expect("open in memory db");
        assert_eq!(db.get_user_count().unwrap(), 0);

        let user = db.create_user("u1", "admin", "hash123", "api123", true).expect("create user");
        assert_eq!(user.username, "admin");
        assert_eq!(db.get_user_count().unwrap(), 1);

        let by_name = db.get_user_by_username("admin").unwrap().expect("found user");
        assert_eq!(by_name.0.id, "u1");
        assert_eq!(by_name.1, "hash123");
        assert_eq!(by_name.2, "api123");
    }

    #[test]
    fn test_folders_and_stats() {
        let db = Db::open_in_memory().expect("open in memory db");
        let stats = db.get_stats().expect("stats");
        assert_eq!(stats.tracks, 0);

        let folder = db.add_folder("f1", "Music", "/home/user/Music").expect("add folder");
        assert_eq!(folder.name, "Music");

        let folders = db.get_folders().expect("get folders");
        assert_eq!(folders.len(), 1);

        db.remove_folder("f1").expect("remove folder");
        assert_eq!(db.get_folders().unwrap().len(), 0);
    }
}
