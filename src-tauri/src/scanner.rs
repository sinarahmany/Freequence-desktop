use anyhow::Result;
use chrono::Utc;
use lofty::file::AudioFile;
use lofty::file::TaggedFileExt;
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use rusqlite::params;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;

use crate::db::Db;
use crate::ids;
use crate::model::ScanStatus;

#[derive(Clone)]
pub struct Scanner {
    db: Db,
    artwork_dir: PathBuf,
    scanning: Arc<AtomicBool>,
}

impl Scanner {
    pub fn new(db: Db, artwork_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&artwork_dir);
        Self {
            db,
            artwork_dir,
            scanning: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn is_scanning(&self) -> bool {
        self.scanning.load(Ordering::SeqCst)
    }

    pub fn status(&self) -> ScanStatus {
        ScanStatus {
            scanning: self.is_scanning(),
            started_at: None,
            finished_at: None,
            scanned: 0,
            added: 0,
            updated: 0,
            removed: 0,
            error: None,
        }
    }

    pub fn scan_directories(&self, directories: Vec<(String, PathBuf, bool)>) -> Result<ScanStatus> {
        if self.scanning.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
            return Ok(self.status());
        }

        let started_at = Utc::now().to_rfc3339();
        let mut scanned_count = 0i64;
        let mut added_count = 0i64;
        let mut updated_count = 0i64;

        for (name, dir_path, is_primary) in directories {
            if !dir_path.exists() {
                continue;
            }

            for entry in WalkDir::new(&dir_path).into_iter().filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let ext = path.extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                let (content_type, suffix) = match ext.as_str() {
                    "mp3" => ("audio/mpeg", ".mp3"),
                    "flac" => ("audio/flac", ".flac"),
                    "ogg" => ("audio/ogg", ".ogg"),
                    "opus" => ("audio/opus", ".opus"),
                    "m4a" => ("audio/mp4", ".m4a"),
                    "mp4" => ("audio/mp4", ".mp4"),
                    "wav" => ("audio/wav", ".wav"),
                    "aac" => ("audio/aac", ".aac"),
                    _ => continue,
                };

                scanned_count += 1;

                let rel_path = path.strip_prefix(&dir_path)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| path.to_string_lossy().to_string());

                let track_key = ids::track_key(is_primary, &name, &rel_path);
                let track_id = ids::track_id(&track_key);

                let metadata = match fs::metadata(path) {
                    Ok(m) => m,
                    Err(e) => {
                        eprintln!("Metadata error for {:?}: {:?}", path, e);
                        continue;
                    }
                };
                let size = metadata.len() as i64;
                let mtime = metadata.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);

                // Read tags via Lofty with relaxed parsing to handle non-standard tags gracefully
                let tagged_file = match Probe::open(path)
                    .map(|p| p.options(lofty::config::ParseOptions::new().parsing_mode(lofty::config::ParsingMode::Relaxed)))
                    .and_then(|p| p.read())
                {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Lofty probe/read error for {:?}: {:?}", path, e);
                        continue;
                    }
                };

                let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
                let properties = tagged_file.properties();

                let title = tag
                    .and_then(|t| t.title())
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown Title").to_string());

                let artist = tag
                    .and_then(|t| t.artist())
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|| "Unknown Artist".to_string());

                let album_artist = tag
                    .and_then(|t| t.get_string(lofty::tag::ItemKey::AlbumArtist))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| artist.clone());

                let album_name = tag
                    .and_then(|t| t.album())
                    .map(|s| s.into_owned())
                    .unwrap_or_else(|| "Unknown Album".to_string());

                let genre = tag
                    .and_then(|t| t.genre())
                    .map(|s| s.into_owned());

                let year = tag
                    .and_then(|t| t.get_string(lofty::tag::ItemKey::Year))
                    .and_then(|y| y.parse::<i32>().ok());
                let track_number = tag.and_then(|t| t.track()).map(|n| n as i32);
                let disc_number = tag.and_then(|t| t.disk()).map(|n| n as i32);

                let duration = properties.duration().as_secs_f64();
                let bit_rate = properties.audio_bitrate().unwrap_or(0) as i32;
                let sample_rate = properties.sample_rate().map(|s| s as i32);
                let channels = properties.channels().map(|c| c as i32);

                let artist_id = ids::artist_id(&album_artist);
                let album_id = ids::album_id(&album_artist, &album_name);

                // Extract artwork if present
                let mut has_cover_art = false;
                if let Some(tag) = &tag {
                    if let Some(pic) = tag.pictures().iter().find(|p| p.pic_type() == PictureType::CoverFront).or_else(|| tag.pictures().first()) {
                        let cover_path = self.artwork_dir.join(format!("{}.jpg", album_id));
                        if !cover_path.exists() {
                            let _ = fs::write(&cover_path, pic.data());
                        }
                        has_cover_art = true;
                    }
                }

                let now = Utc::now().to_rfc3339();
                let conn = self.db.raw_conn();

                // Upsert Artist
                let _ = conn.execute(
                    "INSERT INTO artists (id, name, created_at)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(id) DO UPDATE SET name = ?2",
                    params![artist_id, album_artist, now],
                );

                // Upsert Album
                let parent_dir = path.parent().map(|p| p.to_string_lossy().to_string());
                let _ = conn.execute(
                    "INSERT INTO albums (id, name, artist_id, artist, year, genre, has_cover_art, path, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                     ON CONFLICT(id) DO UPDATE SET
                     name = ?2, artist = ?4, year = COALESCE(?5, year), genre = COALESCE(?6, genre),
                     has_cover_art = CASE WHEN ?7 = 1 THEN 1 ELSE has_cover_art END",
                    params![album_id, album_name, artist_id, album_artist, year, genre, if has_cover_art { 1 } else { 0 }, parent_dir, now],
                );

                // Upsert Track
                let path_str = path.to_string_lossy().to_string();
                let res = conn.execute(
                    "INSERT INTO tracks (id, path, rel_path, title, album_id, album, artist_id, artist,
                                         album_artist, track_number, disc_number, year, genre, duration,
                                         bit_rate, sample_rate, channels, suffix, content_type, size,
                                         has_cover_art, mtime, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
                     ON CONFLICT(id) DO UPDATE SET
                     path = ?2, rel_path = ?3, title = ?4, album_id = ?5, album = ?6, artist_id = ?7,
                     artist = ?8, album_artist = ?9, track_number = ?10, disc_number = ?11, year = ?12,
                     genre = ?13, duration = ?14, bit_rate = ?15, sample_rate = ?16, channels = ?17,
                     size = ?20, has_cover_art = ?21, mtime = ?22",
                    params![
                        track_id, path_str, rel_path, title, album_id, album_name, artist_id, artist,
                        album_artist, track_number, disc_number, year, genre, duration, bit_rate,
                        sample_rate, channels, suffix, content_type, size, if has_cover_art { 1 } else { 0 },
                        mtime, now
                    ],
                );

                match res {
                    Ok(affected) if affected > 0 => added_count += 1,
                    Ok(_) => updated_count += 1,
                    Err(e) => eprintln!("Insert error for {:?}: {:?}", path, e),
                }
            }
        }

        // Update aggregates
        let conn = self.db.raw_conn();
        let _ = conn.execute(
            "UPDATE albums SET
             song_count = (SELECT COUNT(*) FROM tracks WHERE album_id = albums.id),
             disc_count = COALESCE((SELECT MAX(disc_number) FROM tracks WHERE album_id = albums.id), 1),
             duration = (SELECT COALESCE(SUM(duration), 0.0) FROM tracks WHERE album_id = albums.id)",
            [],
        );

        let _ = conn.execute(
            "UPDATE artists SET
             album_count = (SELECT COUNT(*) FROM albums WHERE artist_id = artists.id),
             song_count = (SELECT COUNT(*) FROM tracks WHERE artist_id = artists.id),
             duration = (SELECT COALESCE(SUM(duration), 0.0) FROM tracks WHERE artist_id = artists.id)",
            [],
        );

        self.scanning.store(false, Ordering::SeqCst);
        let finished_at = Utc::now().to_rfc3339();

        Ok(ScanStatus {
            scanning: false,
            started_at: Some(started_at),
            finished_at: Some(finished_at),
            scanned: scanned_count,
            added: added_count,
            updated: updated_count,
            removed: 0,
            error: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scanner_on_music_folder() {
        let music_dir = PathBuf::from("../music");
        if !music_dir.exists() {
            return;
        }

        let db = Db::open_in_memory().expect("db");
        let artwork_dir = std::env::temp_dir().join("freequence_test_art");
        let scanner = Scanner::new(db.clone(), artwork_dir);

        let status = scanner
            .scan_directories(vec![("Music".to_string(), music_dir, true)])
            .expect("scan");

        eprintln!("Scanned result: {:?}", status);
        assert!(status.scanned >= 3);
        assert!(status.added >= 3);

        let stats = db.get_stats().expect("stats");
        assert!(stats.tracks >= 3);
        assert!(stats.albums >= 1);
        assert!(stats.artists >= 1);
    }
}

