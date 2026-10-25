# Freequence (Rust & Tauri Desktop)

A modern, fast self-hosted music player and streaming desktop client built with **Rust** and **Tauri v2**, packaged for universal Linux distribution via **Flatpak (Flathub)**.

## Highlights

- **Native Rust Engine**: Embedded high-performance audio metadata extraction using [Lofty](https://crates.io/crates/lofty) for MP3, FLAC, OGG, Opus, M4A, and WAV.
- **Embedded SQLite**: Embedded [rusqlite](https://crates.io/crates/rusqlite) database with WAL mode storing tracks, albums, artists, playlists, play counts, and ratings.
- **Dual Capability**: Runs as a standalone desktop music player and simultaneously hosts an embedded [Axum](https://crates.io/crates/axum) REST & Subsonic API on `127.0.0.1:4533` for mobile clients (Symfonium, DSub, Amperfy).
- **Embedded Web Player**: Reuses the responsive React 19 / Vite / Tailwind UI with dark mode, queue management, and seekable streaming.
- **Universal Linux Compatibility**: Native Flatpak sandbox (`io.github.sinarahmany.Freequence-desktop`) with PipeWire/PulseAudio integration and XDG directory standards.

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.85+)
- [Node.js](https://nodejs.org/) (20+)

### Development

Install UI dependencies and launch the Tauri dev environment:

```bash
# Install UI dependencies
npm --prefix ui install

# Run the app in development mode
npx @tauri-apps/cli dev
```

### Running Tests

The test suite validates deterministic UUIDv5 algorithms, SQLite migrations, and the audio scanner on sample music files:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Building

### Desktop Binary

```bash
npm --prefix ui run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

### Flatpak (Flathub)

Build and install locally using `flatpak-builder`:

```bash
flatpak-builder --user --install --force-clean build-dir io.github.sinarahmany.Freequence-desktop.yml
flatpak run io.github.sinarahmany.Freequence-desktop
```
