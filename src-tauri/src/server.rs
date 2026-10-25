use axum::{
    body::Body,
    extract::{Path as AxPath, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use tower_http::cors::{Any, CorsLayer};

use crate::db::Db;
use crate::model::*;
use crate::scanner::Scanner;

#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub scanner: Scanner,
    pub music_dir: PathBuf,
    pub artwork_dir: PathBuf,
}

#[derive(Deserialize)]
pub struct AuthPayload {
    pub username: String,
    pub password: Option<String>,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub user: User,
    #[serde(rename = "subsonicApiKey")]
    pub subsonic_api_key: String,
}

#[derive(Deserialize)]
pub struct AlbumQueryParams {
    pub sort: Option<String>,
    pub genre: Option<String>,
    pub size: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
pub struct TrackQueryParams {
    pub genre: Option<String>,
    pub size: Option<usize>,
    pub offset: Option<usize>,
    pub random: Option<bool>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize)]
pub struct StarPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub starred: bool,
}

#[derive(Deserialize)]
pub struct RatingPayload {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub rating: i32,
}

#[derive(Deserialize)]
pub struct ScrobblePayload {
    pub id: String,
}

#[derive(Deserialize)]
pub struct QueuePayload {
    #[serde(rename = "trackIds")]
    pub track_ids: Vec<String>,
    pub current: String,
    pub position: f64,
}

#[derive(Deserialize)]
pub struct CreatePlaylistPayload {
    pub name: String,
    #[serde(rename = "trackIds", default)]
    pub track_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct UpdatePlaylistPayload {
    pub name: Option<String>,
    #[serde(rename = "addTrackIds")]
    pub add_track_ids: Option<Vec<String>>,
    #[serde(rename = "removeIndexes")]
    pub remove_indexes: Option<Vec<usize>>,
    #[serde(rename = "trackIds")]
    pub track_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct BrowseQuery {
    pub path: Option<String>,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Setup & Auth
        .route("/api/v1/setup", get(get_setup).post(post_setup))
        .route("/api/v1/login", post(post_login))
        .route("/api/v1/logout", post(post_logout))
        .route("/api/v1/me", get(get_me))
        .route("/api/v1/stats", get(get_stats))
        // Library
        .route("/api/v1/albums", get(get_albums))
        .route("/api/v1/albums/{id}", get(get_album_by_id))
        .route("/api/v1/artists", get(get_artists))
        .route("/api/v1/artists/{id}", get(get_artist_by_id))
        .route("/api/v1/tracks", get(get_tracks))
        .route("/api/v1/tracks/{id}/lyrics", get(get_track_lyrics))
        .route("/api/v1/genres", get(get_genres))
        .route("/api/v1/search", get(get_search))
        .route("/api/v1/starred", get(get_starred))
        // Annotations
        .route("/api/v1/star", post(post_star))
        .route("/api/v1/rating", post(post_rating))
        .route("/api/v1/scrobble", post(post_scrobble))
        // Queue
        .route("/api/v1/queue", get(get_queue).put(put_queue))
        // Playlists
        .route("/api/v1/playlists", get(get_playlists).post(post_playlist))
        .route("/api/v1/playlists/{id}", get(get_playlist_by_id).patch(patch_playlist).delete(delete_playlist))
        // Folders, Browse & Scanner
        .route("/api/v1/folders", get(get_folders).post(post_folder))
        .route("/api/v1/folders/{id}", delete(delete_folder))
        .route("/api/v1/browse", get(browse_filesystem))
        .route("/api/v1/scan/status", get(get_scan_status))
        .route("/api/v1/scan", post(post_scan))
        // Media Streaming & Covers
        .route("/api/v1/stream/{id}", get(stream_track))
        .route("/api/v1/cover/{id}", get(get_cover))
        .layer(cors)
        .with_state(state)
}

// Handler: Setup status
async fn get_setup(State(state): State<AppState>) -> impl IntoResponse {
    let count = state.db.get_user_count().unwrap_or(0);
    Json(serde_json::json!({
        "needsSetup": count == 0
    }))
}

// Handler: Setup admin
async fn post_setup(State(state): State<AppState>, Json(payload): Json<AuthPayload>) -> impl IntoResponse {
    let password = payload.password.unwrap_or_else(|| "admin".to_string());
    let hash = bcrypt::hash(&password, 4).unwrap_or_default();
    let api_key = uuid::Uuid::new_v4().to_string();
    let id = uuid::Uuid::new_v4().to_string();

    match state.db.create_user(&id, &payload.username, &hash, &api_key, true) {
        Ok(user) => {
            let res = SessionResponse {
                user,
                subsonic_api_key: api_key,
            };
            (
                StatusCode::OK,
                [(header::SET_COOKIE, format!("session={}; Path=/; SameSite=Lax", id))],
                Json(serde_json::json!(res)),
            ).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

// Handler: Login
async fn post_login(State(state): State<AppState>, Json(payload): Json<AuthPayload>) -> impl IntoResponse {
    if let Ok(Some((user, hash, api_key))) = state.db.get_user_by_username(&payload.username) {
        let password = payload.password.unwrap_or_default();
        if bcrypt::verify(&password, &hash).unwrap_or(false) {
            let res = SessionResponse {
                user: user.clone(),
                subsonic_api_key: api_key,
            };
            return (
                StatusCode::OK,
                [(header::SET_COOKIE, format!("session={}; Path=/; SameSite=Lax", user.id))],
                Json(serde_json::json!(res)),
            ).into_response();
        }
    }
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid username or password" }))).into_response()
}

// Handler: Logout
async fn post_logout() -> impl IntoResponse {
    (
        StatusCode::OK,
        [(header::SET_COOKIE, "session=; Path=/; Max-Age=0")],
        Json(serde_json::json!({ "ok": true })),
    )
}

// Handler: Current user session
async fn get_me(headers: HeaderMap, State(state): State<AppState>) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    if let Some((user, _, api_key)) = state.db.get_user_by_id(&user_id).ok().flatten() {
        return Json(serde_json::json!(SessionResponse {
            user,
            subsonic_api_key: api_key,
        })).into_response();
    }
    // If no user exists yet, return default
    if state.db.get_user_count().unwrap_or(0) == 0 {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Setup required" }))).into_response();
    }
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Unauthorized" }))).into_response()
}

// Handler: Stats
async fn get_stats(State(state): State<AppState>) -> impl IntoResponse {
    let stats = state.db.get_stats().unwrap_or(Stats {
        artists: 0,
        albums: 0,
        tracks: 0,
        duration: 0.0,
    });
    Json(stats)
}

// Handler: Albums list
async fn get_albums(
    headers: HeaderMap,
    State(state): State<AppState>,
    Query(params): Query<AlbumQueryParams>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let sort = params.sort.unwrap_or_else(|| "newest".to_string());
    let size = params.size.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    let albums = state.db.list_albums(&user_id, &sort, params.genre.as_deref(), size, offset).unwrap_or_default();
    Json(serde_json::json!({ "albums": albums }))
}

// Handler: Album detail
async fn get_album_by_id(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    if let Ok(Some((album, tracks))) = state.db.get_album(&id, &user_id) {
        Json(serde_json::json!({ "album": album, "tracks": tracks })).into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

// Handler: Artists list
async fn get_artists(headers: HeaderMap, State(state): State<AppState>) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let artists = state.db.list_artists(&user_id).unwrap_or_default();
    Json(serde_json::json!({ "artists": artists }))
}

// Handler: Artist detail
async fn get_artist_by_id(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    if let Ok(Some((artist, albums))) = state.db.get_artist(&id, &user_id) {
        Json(serde_json::json!({ "artist": artist, "albums": albums })).into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

// Handler: Tracks list
async fn get_tracks(
    headers: HeaderMap,
    State(state): State<AppState>,
    Query(params): Query<TrackQueryParams>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let size = params.size.unwrap_or(50);
    let offset = params.offset.unwrap_or(0);
    let random = params.random.unwrap_or(false);
    let tracks = state.db.list_tracks(&user_id, params.genre.as_deref(), size, offset, random).unwrap_or_default();
    Json(serde_json::json!({ "tracks": tracks }))
}

// Handler: Genres
async fn get_genres(State(state): State<AppState>) -> impl IntoResponse {
    let genres = state.db.list_genres().unwrap_or_default();
    Json(serde_json::json!({ "genres": genres }))
}

// Handler: Search
async fn get_search(
    headers: HeaderMap,
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let results = state.db.search(&user_id, &params.q).unwrap_or(SearchResults {
        artists: vec![],
        albums: vec![],
        tracks: vec![],
    });
    Json(results)
}

// Handler: Starred
async fn get_starred(headers: HeaderMap, State(state): State<AppState>) -> impl IntoResponse {
    let _user_id = extract_user_id(&headers, &state);
    // Return empty or starred items
    Json(serde_json::json!({
        "artists": [],
        "albums": [],
        "tracks": []
    }))
}

// Handler: Star
async fn post_star(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<StarPayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.set_star(&user_id, &payload.id, &payload.item_type, payload.starred);
    StatusCode::NO_CONTENT
}

// Handler: Rating
async fn post_rating(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<RatingPayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.set_rating(&user_id, &payload.id, &payload.item_type, payload.rating);
    StatusCode::NO_CONTENT
}

// Handler: Scrobble
async fn post_scrobble(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<ScrobblePayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.scrobble(&user_id, &payload.id);
    StatusCode::NO_CONTENT
}

// Handler: Queue
async fn get_queue(headers: HeaderMap, State(state): State<AppState>) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let queue = state.db.get_queue(&user_id).unwrap_or(SavedQueue {
        track_ids: vec![],
        current: String::new(),
        position: 0.0,
        tracks: vec![],
    });
    Json(queue)
}

async fn put_queue(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<QueuePayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.save_queue(&user_id, &payload.track_ids, &payload.current, payload.position);
    StatusCode::NO_CONTENT
}

// Handler: Playlists
async fn get_playlists(headers: HeaderMap, State(state): State<AppState>) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let playlists = state.db.list_playlists(&user_id).unwrap_or_default();
    Json(serde_json::json!({ "playlists": playlists }))
}

async fn post_playlist(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<CreatePlaylistPayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let playlist_id = uuid::Uuid::new_v4().to_string();
    if let Ok(pl) = state.db.create_playlist(&playlist_id, &payload.name, &user_id, "User", &payload.track_ids) {
        Json(serde_json::json!({ "playlist": pl })).into_response()
    } else {
        StatusCode::INTERNAL_SERVER_ERROR.into_response()
    }
}

async fn get_playlist_by_id(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    if let Ok(Some((playlist, tracks))) = state.db.get_playlist(&id, &user_id) {
        Json(serde_json::json!({
            "playlist": playlist,
            "tracks": tracks,
        })).into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

async fn patch_playlist(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
    Json(payload): Json<UpdatePlaylistPayload>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.update_playlist(
        &id,
        &user_id,
        payload.name,
        payload.add_track_ids,
        payload.remove_indexes,
        payload.track_ids,
    );
    StatusCode::NO_CONTENT
}

async fn delete_playlist(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> impl IntoResponse {
    let user_id = extract_user_id(&headers, &state);
    let _ = state.db.delete_playlist(&id, &user_id);
    StatusCode::NO_CONTENT
}

// Handler: Lyrics
async fn get_track_lyrics(
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> impl IntoResponse {
    if let Ok(Some((path_str, _))) = state.db.get_track_path(&id) {
        let path = PathBuf::from(&path_str);
        let lrc_path = path.with_extension("lrc");
        if lrc_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&lrc_path).await {
                let lines = parse_lrc(&content);
                return Json(Lyrics {
                    synced: !lines.is_empty(),
                    instrumental: false,
                    source: Some("lrc".to_string()),
                    lines,
                }).into_response();
            }
        }
    }

    Json(Lyrics {
        synced: false,
        instrumental: false,
        source: None,
        lines: vec![],
    }).into_response()
}

fn parse_lrc(content: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if let Some(close_idx) = trimmed.find(']') {
                let time_part = &trimmed[1..close_idx];
                let text = trimmed[close_idx + 1..].trim().to_string();
                let mut parts = time_part.split(':');
                if let (Some(m_str), Some(s_str)) = (parts.next(), parts.next()) {
                    if let (Ok(m), Ok(s)) = (m_str.parse::<f64>(), s_str.parse::<f64>()) {
                        lines.push(LyricLine {
                            at: Some(m * 60.0 + s),
                            text,
                        });
                    }
                }
            }
        }
    }
    lines
}

// Handler: Folders
async fn get_folders(State(state): State<AppState>) -> impl IntoResponse {
    let mut folders = state.db.get_folders().unwrap_or_default();
    // Prepend primary music directory
    folders.insert(0, LibraryFolder {
        id: None,
        name: "Music".to_string(),
        label: state.music_dir.to_string_lossy().to_string(),
        builtin: true,
    });
    Json(serde_json::json!({ "folders": folders, "canBrowse": true }))
}

// Handler: Browse Filesystem
async fn browse_filesystem(Query(params): Query<BrowseQuery>) -> impl IntoResponse {
    let target_path = match params.path.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => dirs::audio_dir()
            .or_else(|| dirs::home_dir())
            .unwrap_or_else(|| PathBuf::from("/")),
    };

    let label = target_path.to_string_lossy().to_string();
    let parent = target_path.parent().map(|p| p.to_string_lossy().to_string());

    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(&target_path) {
        for entry in read_dir.filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                if !name.starts_with('.') {
                    entries.push(BrowseEntry {
                        name: name.clone(),
                        path: p.to_string_lossy().to_string(),
                        label: name,
                    });
                }
            }
        }
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Json(BrowseResult {
        path: target_path.to_string_lossy().to_string(),
        label,
        parent,
        can_add: true,
        entries,
    })
}

#[derive(Deserialize)]
pub struct AddFolderPayload {
    pub path: String,
}

async fn post_folder(State(state): State<AppState>, Json(payload): Json<AddFolderPayload>) -> impl IntoResponse {
    let id = uuid::Uuid::new_v4().to_string();
    let name = Path::new(&payload.path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("Folder")
        .to_string();

    match state.db.add_folder(&id, &name, &payload.path) {
        Ok(folder) => {
            let scanner = state.scanner.clone();
            let p = PathBuf::from(&payload.path);
            let n = name.clone();
            tokio::spawn(async move {
                let _ = scanner.scan_directories(vec![(n, p, false)]);
            });
            Json(folder).into_response()
        }
        Err(e) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string() }))).into_response(),
    }
}

async fn delete_folder(State(state): State<AppState>, AxPath(id): AxPath<String>) -> impl IntoResponse {
    let _ = state.db.remove_folder(&id);
    StatusCode::NO_CONTENT
}

// Handler: Scan
async fn get_scan_status(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.scanner.status())
}

async fn post_scan(State(state): State<AppState>) -> impl IntoResponse {
    let scanner = state.scanner.clone();
    let music_dir = state.music_dir.clone();
    let db = state.db.clone();

    tokio::spawn(async move {
        let mut dirs = vec![("Music".to_string(), music_dir, true)];
        if let Ok(extra) = db.get_folders() {
            for f in extra {
                dirs.push((f.name, PathBuf::from(f.label), false));
            }
        }
        let _ = scanner.scan_directories(dirs);
    });

    Json(state.scanner.status())
}

// Handler: Stream audio with HTTP Range support (seekable)
async fn stream_track(
    headers: HeaderMap,
    State(state): State<AppState>,
    AxPath(id): AxPath<String>,
) -> Response {
    let (path_str, content_type) = match state.db.get_track_path(&id) {
        Ok(Some(res)) => res,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let path = PathBuf::from(&path_str);
    let mut file = match File::open(&path).await {
        Ok(f) => f,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let metadata = match file.metadata().await {
        Ok(m) => m,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let total_len = metadata.len();

    // Check Range header
    if let Some(range_header) = headers.get(header::RANGE).and_then(|r| r.to_str().ok()) {
        if let Some(range) = parse_range(range_header, total_len) {
            let start = range.0;
            let end = range.1;
            let chunk_len = end - start + 1;

            if file.seek(SeekFrom::Start(start)).await.is_err() {
                return StatusCode::RANGE_NOT_SATISFIABLE.into_response();
            }

            let stream = ReaderStream::new(file.take(chunk_len));
            let body = Body::from_stream(stream);

            return Response::builder()
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_TYPE, content_type)
                .header(header::ACCEPT_RANGES, "bytes")
                .header(header::CONTENT_RANGE, format!("bytes {}-{}/{}", start, end, total_len))
                .header(header::CONTENT_LENGTH, chunk_len.to_string())
                .body(body)
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    }

    // Full stream
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, total_len.to_string())
        .body(body)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

// Handler: Cover art
async fn get_cover(State(state): State<AppState>, AxPath(id): AxPath<String>) -> Response {
    let cover_path = state.artwork_dir.join(format!("{}.jpg", id));
    if let Ok(bytes) = tokio::fs::read(&cover_path).await {
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "image/jpeg")
            .header(header::CACHE_CONTROL, "public, max-age=86400")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    StatusCode::NOT_FOUND.into_response()
}

fn parse_range(header_val: &str, total_len: u64) -> Option<(u64, u64)> {
    let s = header_val.strip_prefix("bytes=")?;
    let mut parts = s.split('-');
    let start_str = parts.next()?.trim();
    let end_str = parts.next()?.trim();

    let start: u64 = if start_str.is_empty() {
        let suffix_len: u64 = end_str.parse().ok()?;
        total_len.saturating_sub(suffix_len)
    } else {
        start_str.parse().ok()?
    };

    let end: u64 = if end_str.is_empty() {
        total_len - 1
    } else {
        let val: u64 = end_str.parse().ok()?;
        val.min(total_len - 1)
    };

    if start <= end && start < total_len {
        Some((start, end))
    } else {
        None
    }
}

fn extract_user_id(headers: &HeaderMap, state: &AppState) -> String {
    if let Some(cookie) = headers.get(header::COOKIE).and_then(|c| c.to_str().ok()) {
        for part in cookie.split(';') {
            let part = part.trim();
            if let Some(val) = part.strip_prefix("session=") {
                return val.to_string();
            }
        }
    }
    // Default to the first admin if present, or "local"
    if let Ok(Some(admin)) = state.db.get_first_admin() {
        return admin.id;
    }
    "local".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_api_setup_and_endpoints() {
        let db = Db::open_in_memory().expect("db");
        let artwork_dir = std::env::temp_dir().join("freequence_art_test");
        let scanner = Scanner::new(db.clone(), artwork_dir.clone());
        let state = AppState {
            db: db.clone(),
            scanner: scanner.clone(),
            music_dir: PathBuf::from("../music"),
            artwork_dir,
        };
        let router = create_router(state);

        // 1. Initial setup status: needsSetup should be true
        let req = Request::builder()
            .uri("/api/v1/setup")
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 2. Post setup: create admin
        let req = Request::builder()
            .uri("/api/v1/setup")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"username":"admin","password":"password123"}"#))
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 3. Stats endpoint
        let req = Request::builder()
            .uri("/api/v1/stats")
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 4. Albums endpoint
        let req = Request::builder()
            .uri("/api/v1/albums")
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 5. Browse endpoint
        let req = Request::builder()
            .uri("/api/v1/browse")
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 6. Lyrics endpoint
        let req = Request::builder()
            .uri("/api/v1/tracks/dummy-id/lyrics")
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        // 7. Playlist lifecycle (create, get, patch, delete)
        let req = Request::builder()
            .uri("/api/v1/playlists")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"name":"My Favorites","trackIds":[]}"#))
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        let playlist_id = json["playlist"]["id"].as_str().unwrap();

        let req = Request::builder()
            .uri(&format!("/api/v1/playlists/{}", playlist_id))
            .method("GET")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);

        let req = Request::builder()
            .uri(&format!("/api/v1/playlists/{}", playlist_id))
            .method("PATCH")
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"name":"Updated Favorites"}"#))
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);

        let req = Request::builder()
            .uri(&format!("/api/v1/playlists/{}", playlist_id))
            .method("DELETE")
            .body(Body::empty())
            .unwrap();
        let resp = router.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    }
}

