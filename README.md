# 히간바나 (彼岸花)

사람 없는 여름밤 마츠리. 초칭 하나를 들고 신사로 — 그림자복도(影廊)류 3인칭 공포 게임.
기획: [PLAN-HORROR.md](PLAN-HORROR.md) (게임) · [PLAN.md](PLAN.md) (엔진·캐릭터, v0.8)

> 3D_motion v0.8(초원 섬 3인칭 캐릭터)에서 이어진다. 초원 버전은 `?scene=sandbox` 로 그대로 남아 있다.

## 실행
```bash
npm install
npm run dev      # http://localhost:5173
                 # ?scene=sandbox 초원 섬(v0.8) · ?scene=playground 테스트 지형
                 # ?quality=low|medium|high|ultra · ?debug 통계/패널
npm run typecheck
npm run build    # dist/ (정적 배포: Vercel/Netlify/GitHub Pages 어디든)
npm run preview  # dist/ 미리보기 http://localhost:4173
```

## 에셋 파이프라인 (Tripo)
```bash
npm run tripo:balance
npm run tripo:generate -- --image docs/references/character-front.png --name final --quality detailed --face-limit 60000
npm run tripo:rig -- --task <gen task_id> --name final --spec tripo
npm run tripo:animate -- --task <rig task_id> --name final --anims idle,walk,run,jump,fall,turn
npm run build:character           # → public/models/character.glb (애니 병합 + WebP + meshopt)
node scripts/tripo/generate.ts --prompt "a stylized oak tree" --name prop-tree-oak --face-limit 12000
node scripts/build-props.ts       # → public/models/props/*.glb
```

## 사운드 파이프라인
```bash
npm run audio:fetch               # scripts/audio/sources.ts → public/audio/**.mp3 + manifest.json + CREDITS.md (ffmpeg 필요)
npm run audio:fetch -- --report   # 키별 상태 (⏳ = FREESOUND_API_KEY 있어야 받는 소리)
npm run audio:fetch -- --only foot/gravel --force   # 한 키만 다시
npm run audio:fetch -- --sync     # sources.ts 의 gain 만 manifest 에 반영 (볼륨 튜닝)
npm run audio:search -- "taiko hit" --max-dur 3     # Freesound 검색 (.env 에 FREESOUND_API_KEY=… — https://freesound.org/apiv2/apply)
```
소스 우선순위는 키마다 Freesound → Kenney/OpenGameArt/Wikimedia Commons 순. 키가 없으면 Freesound 는 건너뛰고 다음 소스를 쓰며, 샘플이 없는 소리는 게임이 프로시저럴 합성으로 폴백한다.

## 조작
- 캔버스 클릭 → 포인터락(마우스 시점). 드래그 → 오빗. `Esc` 해제
- `W A S D` 이동(기본 걷기) · `Shift` 달리기 · **`Q` 초칭 밝기(끔·약·강)** · 휠 줌
- `R` 리셋 · `M` 음소거 · `F` 전체화면 · `H` 튜닝 패널(dev/?debug)
- `?scene=sandbox` 에서는 v0.8 조작 그대로 (Shift 걷기 · Space 점프 · 좌클릭/J 공격 · Tab 인벤토리 · E 줍기)

## 구조
```
src/core       renderer, postfx(N8AO/Bloom/ACES/Vignette/SMAA), physics(Rapier), input, settings, tweaks
src/world/village  ground(마을 지형·논 격자·참배로), paddy(논 수면+줄 심은 벼), torii(명신형 파라메트릭·센본토리이), mist(밤안개)
src/light      chochin(왼손 초칭 — 유일한 그림자 광원, 3단 밝기 = 감지 배율)
src/world      nightSky(밤하늘·별·달·PMREM), sky/terrain/water/grass/props/playground(초원 sandbox 용)
src/character  controller(KinematicCharacterController), model(GLB 로더), animator(상태머신·발 접지), placeholder(캡슐 폴백)
src/audio      sfx(효과음 — 샘플 우선·프로시저럴 폴백), bank(샘플 뱅크·루프), matsuri(마츠리바야시 = 요괴 근접도), ambience(구역별 실녹음 앰비언스)
public/audio   샘플 mp3 + manifest.json + CREDITS.md (scripts/audio 파이프라인이 생성 — 직접 편집하지 않는다)
src/items      items(정의), inventory(상태·저장), inventoryUI(Tab 오버레이)
src/character  + equipment(손/칼집 부착), combat(공격·판정)   src/world/dummies(허수아비)  src/ui/popups(데미지 숫자)
src/camera     thirdPerson(스프링암, 충돌, FOV)
docs/          기획·캐릭터 스펙·레퍼런스
scripts/tripo  Tripo API 파이프라인 (npm run tripo:*), build-character.ts (npm run build:character), build-props.ts (소품 최적화)
scripts/audio  sources.ts(사운드 소스 목록·라이선스) + fetch.ts(다운로드·ffmpeg 가공·manifest/CREDITS 생성)
```
