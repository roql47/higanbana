#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
use tauri::{Manager, WebviewWindow};
use std::{io::Write, sync::Mutex};

#[derive(Default)]
struct Diagnostics(Mutex<u16>);

#[tauri::command]
fn report_diagnostic(app: tauri::AppHandle, state: tauri::State<Diagnostics>, message: String) {
    let Ok(mut count) = state.0.lock() else { return };
    if *count >= 200 { return; }
    *count += 1;
    let Ok(dir) = app.path().app_log_dir() else { return };
    if std::fs::create_dir_all(&dir).is_err() { return; }
    let path = dir.join("runtime.log");
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 512 * 1024) {
        let _ = std::fs::rename(&path, dir.join("runtime.previous.log"));
    }
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
        let _ = writeln!(file, "[{timestamp}] {}", message.chars().take(4096).collect::<String>());
    }
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let value = !window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(value).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
fn close_game(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

fn main() {
    let mut context = tauri::generate_context!();
    if !cfg!(debug_assertions) { context.set_assets(Box::new(assets::DiskAssets::new())); }
    tauri::Builder::default()
        .manage(Diagnostics::default())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize(); let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![toggle_fullscreen, close_game, report_diagnostic])
        .setup(|app| {
            let config = app.config().app.windows.first().expect("main window configuration");
            let builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
            // A stable profile survives game updates; it is outside Steam's install directory.
            #[cfg(target_os = "windows")]
            let builder = builder.data_directory(app.path().app_local_data_dir()?.join("webview"));
            let builder = builder.on_navigation(|url| {
                url.scheme() == "tauri" && url.host_str() == Some("localhost")
                    || matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost")
                    || cfg!(debug_assertions) && url.host_str() == Some("127.0.0.1") && url.port() == Some(5188)
            });
            builder.build()?;
            Ok(())
        })
        .run(context)
        .expect("Higanbana desktop runtime failed");
}
