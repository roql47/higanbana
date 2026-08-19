# 요괴 레퍼런스 이미지 생성 프롬프트

목적: **Tripo image-to-model 입력용**. 일러스트가 아니라 3D 생성이 잘 되는 이미지가 기준이다.
(주인공 제작 검증 조건: 정면 전신 A-포즈 · 3뷰 시트 **한 장** · 균일 조명 · 무지 배경)

## 공통 규칙 (모든 프롬프트에 이미 포함됨)

| 규칙 | 이유 |
|---|---|
| 3뷰(정면/측면/후면) 시트 한 장, 가로 3:2 또는 16:9 | Tripo multiview 입력. 분할 크롭 여러 장 금지(검증됨) |
| A-포즈, 전신 머리~발끝, 잘림 없음 | 자동 리깅(biped) 성공 조건 |
| 플랫한 균일 스튜디오 조명, 그림자·안개·글로우 금지 | Tripo 는 이미지의 음영을 지오메트리/알베도로 오해한다 |
| 중간 회색 무지 배경 | 흰 옷(팔척귀신)이 배경에 묻지 않게 흰 배경 금지 |
| 반투명·유령 이펙트·파티클 금지 | 솔리드 지오메트리만 생성 가능 |
| 스타일: stylized semi-realistic (주인공과 동일 계열) | 월드 톤 통일. 공포는 조명·연출이 만든다 |
| 몸에 붙는 좁은 실루엣 의상 | 넓은 종/치마 실루엣은 자동 리깅이 다리를 못 찾는다 |

공통 네거티브 (지원하는 생성기에서):
```
fog, mist, glow, transparency, ghost effect, particles, motion blur, dramatic lighting,
dark scene, cropped body, cut off feet, multiple overlapping characters, text, watermark,
wide bell skirt, background scenery
```

---

## 1. 팔척귀신 (八尺様) — 메인 추격자 · H2 · 최우선

```
Character reference sheet of a terrifying Japanese ghost woman "Hasshaku-sama",
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
Unnaturally tall and elongated proportions: very long arms, long neck, narrow shoulders.
She wears a plain white ankle-length summer dress with a narrow straight silhouette,
thin fabric hanging close to her legs, pale bare feet visible below the hem.
On her head a wide-brimmed traditional Japanese woven straw hat (ichimegasa);
the brim shadows her upper face — only a pale chin and a faint unsettling smile visible.
Long straight black hair falling from under the hat down her back.
Grayish-white dead skin. Subtly wrong anatomy, too-long fingers.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

- 비율 3:2 가로. **다리 실루엣이 드레스 밖으로 읽혀야 한다** — 생성 결과에서 하반신이 원통이면 리깅 실패 확률이 높으니 재생성
- 갓(笠) 챙이 얼굴을 가리는 건 의도 (게임에서도 초칭을 위로 비춰야 입이 보인다)

## 2. 여우 요괴 (妖狐) — 신사 2차 추격자 · H3

```
Character reference sheet of a sinister Japanese fox spirit in human form,
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
Slender androgynous figure wearing a worn indigo-blue yukata with faded
geometric festival patterns, fabric wrapped close to the body, simple obi sash,
bare feet in wooden geta sandals.
Face fully covered by a white kitsune fox mask with red painted markings and
narrow slanted eye slits. Wild silver-gray hair spilling around the mask.
Slightly hunched predatory posture, long-nailed pale hands.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

## 3. 도로타보 (泥田坊) — 논 영역형 · H3 · 리깅 불필요

```
Character reference sheet of the Japanese yokai "Dorotabo", a mud creature
rising from a rice paddy, three views in one image (front view, side view, back view).
Upper half of a gaunt male figure emerging from a solid mound of dark wet mud —
the mound forms the base of the model like a sculpture pedestal.
Torso, head and raised arms made of thick sculpted dripping mud with a clay-like
solid surface. A single large round eye in the center of the face, hollow mouth
open in a wail, each hand with only three thick fingers.
Muddy earth tones, matte wet-clay texture.
Stylized semi-realistic Japanese game monster concept art, solid sculptural forms,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent across all three views, high detail, 4k.
```

- 반신 + 진흙 둔덕 받침 = 닫힌 지오메트리로 생성됨. 리깅 없이 코드로 상하 이동·흔들림
- "dripping" 이 액체 이펙트로 나오면 재생성 — **조각처럼 굳은 형태**여야 한다

## 4. 놋페라보 (のっぺらぼう) — H4 놀래킴 · 정적 모델

```
Character reference sheet of a Japanese faceless ghost "Noppera-bo",
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
An ordinary middle-aged village woman in a plain muted brown-gray kimono,
narrow silhouette, simple obi, hair in a modest low bun, sandals.
Her face is completely smooth blank skin — no eyes, no nose, no mouth,
like an egg. Otherwise entirely normal and mundane.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

- 무서움은 "평범함"에서 나온다 — 괴물처럼 생성되면 재생성. 정적 모델(리깅 불필요, 앉은 포즈는 게임에서 본 회전으로 처리 불가하므로 서 있는 걸 노점 뒤에 배치)

## 5. 초칭오바케 (提灯お化け) — H4 · 모델 아님, 텍스처 1장

```
A single large realistic human eye, wide open with a small iris, painted on
aged cream-colored washi paper with faint red veins around it,
flat texture, viewed straight on, even lighting, no perspective, square image.
```

- 게임 내 초칭 종이 텍스처(`light/chochin.ts` makePaperTexture)에 0.5초 오버레이할 스왑 텍스처. 3D 생성 안 함

---

## 생성 → Tripo 투입 체크리스트

1. 생성 결과 확인: □ 3뷰가 같은 인물인가 □ 발끝까지 나왔나 □ 배경이 무지인가 □ 하반신 실루엣이 읽히나(추격자류)
2. `docs/references/yokai-<이름>-sheet.png` 로 저장
3. 탐색 생성(텍스처 없음, ~20크레딧)으로 형태 먼저 확인:
   `npm run tripo:generate -- --image docs/references/yokai-hasshaku-sheet.png --name yokai-hasshaku-explore`
4. 형태 OK → detailed 확정(40) → 추격자류만 `tripo:rig -- --spec tripo`(25) → Mixamo 클립 리타겟
5. 팔척귀신은 리타겟 후 **엔진에서 2.4 m 스케일** (모델 자체는 표준 신장으로 생성·리깅하는 게 안전)
