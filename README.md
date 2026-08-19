# 3D_motion

브라우저에서 오픈월드 스타일로 움직이는 고품질 3D 캐릭터 1명. 기획: [PLAN.md](PLAN.md)

## 실행
```bash
npm install
npm run dev      # http://localhost:5173  (?scene=playground 테스트 지형, ?quality=low|medium|high, ?debug 통계/패널)
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

## 조작
- 캔버스 클릭 → 포인터락(마우스 시점). 드래그 → 오빗. `Esc` 해제
- `W A S D` 이동 · `Shift` 걷기 · `Space` 점프 · 휠 줌 · **좌클릭/J 공격 · Tab 인벤토리 · E 줍기** · `R` 리셋 · `M` 음소거 · `F` 전체화면 · `H` 튜닝 패널(dev/?debug)
- 터치 기기: 왼쪽 가상 조이스틱, 오른쪽 드래그 시점, 점프/걷기 버튼

## 구조
```
src/core       renderer, postfx(N8AO/Bloom/ACES/Vignette/SMAA), physics(Rapier), input, settings, tweaks
src/world      sky, terrain(섬 하이트맵+heightfield), water, grass(인스턴스 풀), props(Tripo 소품 스캐터·콜라이더·밀기), playground(테스트 지형, ?scene=playground)
src/character  controller(KinematicCharacterController), model(GLB 로더), animator(상태머신·발 접지), placeholder(캡슐 폴백)
src/audio      sfx(프로시저럴 발소리/점프/착지/휘두름/타격)
src/items      items(정의), inventory(상태·저장), inventoryUI(Tab 오버레이)
src/character  + equipment(손/칼집 부착), combat(공격·판정)   src/world/dummies(허수아비)  src/ui/popups(데미지 숫자)
src/camera     thirdPerson(스프링암, 충돌, FOV)
docs/          기획·캐릭터 스펙·레퍼런스
scripts/tripo  Tripo API 파이프라인 (npm run tripo:*), build-character.ts (npm run build:character), build-props.ts (소품 최적화)
```
