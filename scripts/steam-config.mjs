import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function steamId(value, label) {
  if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > 4294967295) throw Error(`${label} must be a real positive Steam ID.`);
  return String(value);
}
export function makeSteamScripts(appId, depotId) {
  const app = steamId(appId, 'App ID'), depot = steamId(depotId, 'Depot ID');
  if (app === depot) throw Error('App ID and Depot ID must be different.');
  return {
    app: `"AppBuild"\n{\n  "AppID" "${app}"\n  "Desc" "Higanbana desktop preview"\n  "Preview" "1"\n  "ContentRoot" "../windows-x64"\n  "BuildOutput" "../steam-cache"\n  "Depots" { "${depot}" "depot_build_${depot}.vdf" }\n}\n`,
    depot: `"DepotBuild"\n{\n  "DepotID" "${depot}"\n  "FileMapping" { "LocalPath" "*" "DepotPath" "." "Recursive" "1" }\n  "FileExclusion" "steam_appid.txt"\n  "FileExclusion" "package-manifest.json"\n  "FileExclusion" "*.pdb"\n  "InstallScript" "installscript.vdf"\n}\n`,
    install: `"InstallScript"\n{\n  "Run Process"\n  {\n    "Higanbana WebView2"\n    {\n      "HasRunKey" "HKEY_LOCAL_MACHINE\\\\Software\\\\Valve\\\\Steam\\\\Apps\\\\${app}"\n      "Process 1" "%WINDIR%\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe"\n      "Command 1" "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \\"%INSTALLDIR%\\\\redist\\\\Install-WebView2.ps1\\""\n      "Requirement_OS" { "Is64BitWindows" "1" }\n    }\n  }\n}\n`,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = key => args[args.indexOf(key) + 1];
  if (!args.includes('--app-id') || !args.includes('--depot-id')) {
    throw Error('Usage: npm run steam:config -- --app-id YOUR_APP_ID --depot-id YOUR_WINDOWS_DEPOT_ID');
  }
  const app = steamId(value('--app-id'), 'App ID'), depot = steamId(value('--depot-id'), 'Depot ID');
  const scripts = makeSteamScripts(app, depot);
  const content = join(root, 'release/windows-x64');
  await stat(join(content, 'higanbana.exe'));
  await stat(join(content, 'redist/Install-WebView2.ps1'));
  const target = join(root, 'release/steam');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, `app_build_${app}.vdf`), scripts.app);
  await writeFile(join(target, `depot_build_${depot}.vdf`), scripts.depot);
  await writeFile(join(content, 'installscript.vdf'), scripts.install);
  await writeFile(join(target, 'launch-options.json'), JSON.stringify({ appId: app, depotId: depot,
    executable: 'higanbana.exe', operatingSystem: 'Windows', architecture: '64-bit', arguments: '',
    note: 'Enter these launch settings in Steamworks. Preview=1 only validates; no upload or SetLive is configured.' }, null, 2) + '\n');
  console.log(`SteamPipe preview configuration: ${target}\nPreview=1: validates files without uploading. No Steam operation was performed.`);
}
