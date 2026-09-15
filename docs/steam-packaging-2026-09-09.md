# Steam 데스크톱 패키징 — 2026-09-09

최신 UI·패키지: [게임 UI 개선](./ui-review-2026-09-09.md). 앞선 모델 변경은 [우물 물증·게다 묘역 아트 마감](./well-geta-art-2026-09-09.md), 장면 수정은 [우물·묘지 플레이 문제 수정](./act-scene-fixes-2026-09-09.md).

후속 최적화 패키지: [환경음 구간 재생·실내 가림 처리](./resource-optimization-2026-09-09.md). 아래 표는 최신 패키지이며, 기존 네이티브 QA 설명과 후속 변경의 QA 범위는 구분한다.

현재 코드를 Windows x64 실행 파일과 macOS Apple Silicon 앱으로 패키징했다. **ACT 18까지의 개발 프리뷰**이며 Steam 업로드·출시, Windows 실기기 QA, 배포용 코드 서명은 수행하지 않았다.

## 결과물과 검증

| 결과물 | 압축 파일 | 설치 파일 합계(매니페스트 제외) |
|---|---:|---:|
| Windows x64 | 82,847,189 bytes | 93.68MiB |
| macOS arm64 | 81,339,961 bytes | 93.02MiB |

위 파일은 저장소의 `release/Higanbana-0.1.0-Windows-x64-preview.zip` 및 `release/Higanbana-0.1.0-macOS-arm64-preview.zip`이다. Windows 압축 해제 폴더가 Steam의 콘텐츠 루트가 된다. Windows 361개·Mac 362개 파일의 크기·SHA-256 및 ZIP 무결성을 확인했다(매니페스트 제외).

- 최신 게임/패키징 자동 테스트 **104개**, 타입 검사 및 데스크톱 콘텐츠 빌드 통과. 앞선 Rust 파일 접근 테스트 **1개**와 웹 하위 경로 빌드 검증 기록은 유지한다.
- 이전 아트 변경의 Mac QA에서는 숨은 묘역과 환자복 앞 체크포인트를 실행해 모델·텍스처를 확인했다. 전체 게다 퍼즐 경로는 브라우저 보행 검증을 통과했다. 후속 UI 변경은 브라우저에서 확인했으며 Mac 잠금으로 네이티브 UI 시각 검수는 수행하지 못했다. 최신 해시는 UI 개선 문서에 기록했다.
- Mac 네이티브 앱에서 텍스처 수정 후 로딩 334/334 완료, 미오 모델과 지면·나무·건물의 정상 표시를 화면으로 확인했다. 게임 내 종료로 저장한 뒤 재실행하여 ACT 2 이어하기를 확인했다. 마지막 검증 세션의 오류·경고·CSP 위반 로그는 없었다.
- Windows 실행 파일 생성 및 PE x64/DLL 의존성 검사는 통과했다. **Windows에서 실제 실행한 결과는 아직 없다.** 웹 빌드의 약 5MB 메인 청크 경고는 남아 있으며, 네이티브 실행 안정성이나 장시간 메모리 측정을 대신하지 않는다.

## 구성과 최적화

- Tauri 2 / Rust 릴리스 빌드: 최적화 레벨 3, thin LTO, 단일 코드 생성 단위, 심볼 제거.
- OS의 WebView를 사용한다. Windows는 WebView2, Mac은 WKWebView다. 별도 Chromium·Node 런타임을 패키지에 넣지 않는다. [Tauri 프로세스 구조](https://v2.tauri.app/concept/process-model/).
- 모델·이미지·오디오를 `content/`에 개별 배포한다. Rust가 전체 게임 파일을 실행 파일에 내장하거나 상주 캐시하지 않고, 요청받은 파일만 읽는다. Steam에서 변경된 파일을 교체하기 쉬운 구조다.
- 원본 모델과 호환용 텍스처를 보존했다. 개발 소스, 소스맵, 음성 샘플, 빌드 도구는 제외했다.
- 한국어·일본어 명조/손글씨 4개 서체를 오프라인 WOFF2로 포함했다. 원본 약 42.5MiB를 현재 코드·스토리보드의 사용 문자 중심으로 합계 **1,958,716 bytes**로 만들었다. 이는 원본 폰트 파일과의 비교이며, 이전 Google Fonts 브라우저 전송량과의 비교가 아니다. OFL 라이선스 및 파생 서체명 변경을 포함했다.
- Windows WebView2 설치 부트스트래퍼 1,783,000 bytes를 포함했다. 이미 공용 런타임이 있으면 설치를 건너뛰며, 없는 PC에서는 첫 설치에 인터넷이 필요하다. 런타임 자체의 설치 공간은 게임 폴더 크기에 포함되지 않는다. [Microsoft 배포 문서](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).
- 단일 인스턴스, 네이티브 전체 화면·종료, 창 포커스 이탈 시 일시정지, 앱 전용 저장 프로필을 연결했다. 로컬 오류 로그는 실행당 200건으로 제한하고 512KiB 이후 이전 로그로 순환한다. 외부로 전송하지 않는다.

패키징 방식으로 설치 파일과 부가 런타임의 중복을 줄였다. **GPU/RAM 사용량이나 FPS 개선률을 측정한 것은 아니다.** 특히 Mac 호환 경로의 원본 WebP 텍스처는 KTX2보다 GPU 메모리를 더 사용할 수 있다.

## 패키징 중 확인한 텍스처 오류

첫 Mac 실행에서는 버스 좌석·운전사·나무 등이 흰색으로 표시됐다. 로그에 `THREE.GLTFLoader: Couldn't load texture blob:tauri://localhost/...`가 반복됐다. GLB 내부 이미지의 Blob을 `fetch`로 읽는데 CSP의 `connect-src`에 `blob:`가 빠져 있었다. 로컬 `blob:`·`data:` 읽기를 허용하도록 수정했다.

이후 Mac의 `tauri:` origin에서는 Sayo KTX2 모델 디코딩이 끝나지 않아 242/243에서 로딩이 정지했다. 같은 모델의 원본 WebP 경로에서는 로딩 329/329와 게임 시작이 완료됐다. 이 환경에서만 원본 해상도 WebP를 선택하고, Windows WebView2와 일반 브라우저의 GPU 압축 경로는 유지한다. Mac KTX2는 별도 디코더 호환 검증 후 다시 활성화해야 한다.

주인공 모델을 로드하기 전 HEAD 응답의 `Content-Type`에 `gltf`가 있어야 한다는 조건도 제거했다. 네이티브 파일 프로토콜이 유효한 GLB를 `application/octet-stream`으로 반환해 주인공을 캡슐로 대체하던 문제였다. 이제 GLTFLoader가 실제 파일을 검증하며 불필요한 사전 요청도 사라졌다.

## 재빌드

Node 버전은 `.nvmrc`, Rust 의존성은 `src-tauri/Cargo.lock`을 따른다. 사용한 Rust는 1.98.1이다. 일반 개발 PC는 [Tauri 선행 조건](https://v2.tauri.app/start/prerequisites/)에 맞게 도구를 설치한다. 이 Mac의 Rust·cargo-xwin·SDK 캐시는 `.build-tools/`에 격리했으며 배포하지 않는다.

```sh
npm ci
npm test
npm run typecheck
cargo fetch --locked --manifest-path src-tauri/Cargo.toml

# Windows 개발 PC 또는 이 Mac의 cargo-xwin 환경
npm run desktop:build -- --target x86_64-pc-windows-msvc --no-bundle -- --locked
node scripts/package-desktop.mjs fetch-redist
npm run package:steam -- --platform windows-x64

# Apple Silicon Mac
npm run desktop:build -- --bundles app -- --locked
npm run package:steam -- --platform macos-arm64

# Rust 파일 접근 검증 (먼저 desktop content 빌드 필요)
npm run desktop:test
```

Windows 교차 빌드는 LLVM/LLD와 cargo-xwin을 사용했다. 마지막 링크의 Microsoft 디버그 PDB 부재 경고는 배포에 포함하지 않는 심볼 관련이며 실행 파일 생성은 성공했다. PE x64 형식 및 가져오는 DLL을 확인했다. 별도 `vcruntime` DLL 의존성 없이 Windows 시스템 DLL/UCRT를 사용한다. **Windows 실행 검증을 대체하지 않는다.** `.github/workflows/desktop.yml`은 Windows에서 수동 실행하는 빌드·테스트·아티팩트 워크플로이며 업로드나 출시를 자동 실행하지 않는다.

폰트에 없는 새 문자를 스토리에 추가하면 `scripts/desktop-fonts.py`를 다시 실행해야 한다. 필요한 Python 패키지는 `fonttools[woff]`, `brotli`, `zopfli`다. 원본 출처·해시는 `public/fonts/manifest.json`, 라이선스는 같은 디렉터리에 있다.

## Steam 연결

실제 App ID와 **Windows용 Depot ID**가 있어야 한다. 임의 ID로 업로드하지 않는다.

```sh
npm run steam:config -- --app-id YOUR_APP_ID --depot-id YOUR_WINDOWS_DEPOT_ID
```

이 명령은 `release/steam/`에 App/Depot VDF를, Windows 콘텐츠 폴더에 최초 실행 설치 스크립트를 만든다. `Preview=1`이 기본이므로 SteamPipe 검증만 하며, 실제 업로드와 `SetLive`는 자동 설정하지 않는다. Steamworks 실행 파일 설정은 `higanbana.exe`, Windows, 64-bit다. 업로드할 때는 검증 이후 Preview 값을 별도로 바꾸고 Steamworks에서 테스트 브랜치를 선택한다. 생성된 `steam_appid.txt`는 배포에 포함하지 않도록 제외 규칙을 넣었다. [SteamPipe](https://partner.steamgames.com/doc/sdk/uploading), [InstallScripts](https://partner.steamgames.com/doc/sdk/installscripts).

Windows 저장 프로필은 `%LOCALAPPDATA%\com.higanbana.game\webview`다. Mac은 앱 식별자에 해당하는 WKWebView 영구 저장소를 사용한다. 기존 웹사이트/브라우저의 저장과는 별개다. 앱 식별자·origin·프로필 경로를 업데이트마다 바꾸지 않아야 한다. Cloud·업적·오버레이 연동은 아직 구현하지 않았으며, WebView 프로필 전체를 Steam Cloud에 등록해서는 안 된다.

## 정식 출시까지 남은 작업

1. Windows 실기기에서 첫 설치, 오프라인 재실행, 모든 주요 액트의 재질·입력·저장 복원, 창 전환, 장시간 플레이, 여러 GPU와 화질 프리셋을 검증한다. Mac은 현재 호환 경로이며 Windows 출시 성능의 근거로 사용하지 않는다.
2. 출시 범위를 확정한다. ACT 16~17은 원안 일부 구현, ACT 19~35와 후반 선택·엔딩은 제작 전이다. 현재 패키지는 완성판으로 표기하지 않는다.
3. Steamworks App/Depot·실행 설정을 연결하고 비공개 테스트 브랜치에서 검증한다. 필요 기능에 따라 업적·Cloud·게임패드 지원을 별도로 구현한다.
4. 상점 이미지·예고편·설명·지원 언어·가격·콘텐츠 설문과 에셋 이용권·크레딧을 확정하고, 현재 Steamworks 출시 체크리스트와 심사 절차를 완료한다.

저장 기능 단위 테스트 통과는 전체 게임 완주나 실제 Steam 업데이트 후 저장 호환 검증을 의미하지 않는다.
