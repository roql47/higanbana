use std::{borrow::Cow, path::{Component, Path, PathBuf}, sync::OnceLock};
use tauri::{Assets, Manager, Runtime, utils::assets::{AssetKey, AssetsIter, CspHash}};

/// Loose, compressed-on-disk GLB/WOFF2/audio files keep Steam updates small.
/// Read only the requested file; never cache the entire game in the Rust process.
pub struct DiskAssets {
    root: OnceLock<PathBuf>,
}

impl DiskAssets {
    pub fn new() -> Self { Self { root: OnceLock::new() } }
}

fn resolve_asset(root: &Path, key: &str) -> Option<PathBuf> {
    let relative = Path::new(key.trim_start_matches('/'));
    if relative.components().any(|part| !matches!(part, Component::Normal(_))) { return None; }
    let file = root.join(relative).canonicalize().ok()?;
    (file.starts_with(root) && file.is_file()).then_some(file)
}

impl<R: Runtime> Assets<R> for DiskAssets {
    fn setup(&self, app: &tauri::App<R>) {
        if let Ok(root) = app.path().resource_dir().and_then(|p| p.join("content").canonicalize().map_err(Into::into)) {
            let _ = self.root.set(root);
        }
    }
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let path = self.root.get().and_then(|root| resolve_asset(root, key.as_ref()));
        if let Some(bytes) = path.and_then(|p| std::fs::read(p).ok()) { return Some(Cow::Owned(bytes)); }
        if key.as_ref() == "/index.html" {
            return Some(Cow::Borrowed(include_bytes!("../frontend/index.html")));
        }
        None
    }
    fn iter(&self) -> Box<AssetsIter<'_>> { Box::new(std::iter::empty()) }
    fn csp_hashes(&self, _html_path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> { Box::new(std::iter::empty()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_traversal_and_missing_assets() {
        let root = std::env::temp_dir().join(format!("higanbana-assets-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("valid.glb"), b"glTF").unwrap();
        let root = root.canonicalize().unwrap();
        assert_eq!(resolve_asset(&root, "/valid.glb"), Some(root.join("valid.glb")));
        assert!(resolve_asset(&root, "../outside").is_none());
        assert!(resolve_asset(&root, "folder/../../outside").is_none());
        assert!(resolve_asset(&root, "missing.glb").is_none());
        std::fs::remove_dir_all(root).unwrap();
    }
}
