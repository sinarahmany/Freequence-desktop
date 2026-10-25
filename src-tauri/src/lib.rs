pub mod db;
pub mod ids;
pub mod model;
pub mod scanner;
pub mod server;

use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use tracing::info;

use db::Db;
use scanner::Scanner;
use server::{create_router, AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Determine data directory (XDG compliant or app_data_dir)
            let app_data_dir = dirs::data_dir()
                .map(|d| d.join("freequence"))
                .unwrap_or_else(|| PathBuf::from("./data"));
            let _ = fs::create_dir_all(&app_data_dir);

            let db_path = app_data_dir.join("freequence.db");
            let artwork_dir = app_data_dir.join("artwork");
            let _ = fs::create_dir_all(&artwork_dir);

            // Locate default music directory (either ./music or system Audio/Music folder)
            let local_music = PathBuf::from("./music");
            let music_dir = if local_music.exists() {
                local_music
            } else {
                dirs::audio_dir().unwrap_or_else(|| PathBuf::from("./music"))
            };

            info!("Starting Freequence with DB: {:?}, Music: {:?}", db_path, music_dir);

            let db = Db::open(&db_path).expect("Failed to initialize database");
            let scanner = Scanner::new(db.clone(), artwork_dir.clone());

            let state = AppState {
                db: db.clone(),
                scanner: scanner.clone(),
                music_dir: music_dir.clone(),
                artwork_dir,
            };

            // Spawn embedded Axum HTTP server in background Tokio task
            let router = create_router(state);
            tauri::async_runtime::spawn(async move {
                let addr = SocketAddr::from(([127, 0, 0, 1], 4533));
                let listener = tokio::net::TcpListener::bind(addr).await;
                match listener {
                    Ok(listener) => {
                        println!("Freequence embedded server listening on http://{}", addr);
                        let _ = axum::serve(listener, router).await;
                    }
                    Err(e) => {
                        eprintln!("Failed to bind server on http://{}: {:?}", addr, e);
                    }
                }
            });

            // Trigger an initial scan if the music directory exists
            if music_dir.exists() {
                let sc = scanner.clone();
                let mdir = music_dir.clone();
                std::thread::spawn(move || {
                    let _ = sc.scan_directories(vec![("Music".to_string(), mdir, true)]);
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
