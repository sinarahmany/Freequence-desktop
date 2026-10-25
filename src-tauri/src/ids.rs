use std::sync::LazyLock;
use uuid::Uuid;

static NS_ARTIST: LazyLock<Uuid> =
    LazyLock::new(|| Uuid::new_v5(&Uuid::NAMESPACE_OID, b"musicplayer/artist"));
static NS_ALBUM: LazyLock<Uuid> =
    LazyLock::new(|| Uuid::new_v5(&Uuid::NAMESPACE_OID, b"musicplayer/album"));
static NS_TRACK: LazyLock<Uuid> =
    LazyLock::new(|| Uuid::new_v5(&Uuid::NAMESPACE_OID, b"musicplayer/track"));

pub fn normalize_key(s: &str) -> String {
    s.trim().to_lowercase()
}

pub fn artist_id(name: &str) -> String {
    Uuid::new_v5(&NS_ARTIST, normalize_key(name).as_bytes()).to_string()
}

pub fn album_id(album_artist: &str, name: &str) -> String {
    let key = format!("{}\0{}", normalize_key(album_artist), normalize_key(name));
    Uuid::new_v5(&NS_ALBUM, key.as_bytes()).to_string()
}

pub fn track_id(rel_path: &str) -> String {
    Uuid::new_v5(&NS_TRACK, rel_path.as_bytes()).to_string()
}

pub fn track_key(primary: bool, library: &str, rel: &str) -> String {
    let rel_normalized = rel.replace('\\', "/");
    if primary || library.is_empty() {
        rel_normalized
    } else {
        format!("//{}/{}", library, rel_normalized)
    }
}

pub fn new_playlist_id() -> String {
    Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uuid_generation() {
        let aid = artist_id("Pink Floyd");
        let aid2 = artist_id("  pink floyd  ");
        assert_eq!(aid, aid2);
        assert!(!aid.is_empty());

        let albid = album_id("Pink Floyd", "The Dark Side of the Moon");
        let albid2 = album_id("pink floyd", "the dark side of the moon");
        assert_eq!(albid, albid2);

        let tid = track_id("01 Speak to Me.mp3");
        assert_eq!(tid, track_id("01 Speak to Me.mp3"));

        let key_prim = track_key(true, "main", "rock/song.mp3");
        assert_eq!(key_prim, "rock/song.mp3");

        let key_sec = track_key(false, "external", "rock/song.mp3");
        assert_eq!(key_sec, "//external/rock/song.mp3");
    }
}
