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

## 6. 로쿠로쿠비 (ろくろ首) — 사당 첫 보스 · ACT 6~7 · **모델 2개로 나눈다**

### 왜 둘로 나누는가

기획서 §9.1 은 「머리+몸통 Tripo 정적, **목 = 코드 튜브 스플라인**」이다. 그래서 셋을 지킨다.

1. **모델에 목이 있으면 안 된다.** 목은 실시간 `TubeGeometry` 스플라인이라(§9.5), 생성된
   목이 남아 있으면 튜브와 겹쳐 두 겹이 된다
2. **머리가 플레이어 눈앞 1 m 까지 온다.** 목이 대들보를 타고 내려오는 게 이 보스의 전부다 —
   전신 3뷰 시트에서 머리는 세로 100 px 남짓이고, 그 해상도로 뽑은 얼굴은 그 거리를 못 견딘다
3. **몸통은 제단 뒤에 고정**이라(§5.3.1) 뒷면·다리가 거의 안 보인다. 탐색 품질로 충분하다

### 6-A. 몸통 (`yokai-rokurokubi-body`) — 목 없음 · 正座 · 정적

```
Character reference sheet of a Japanese shrine maiden ghost, three views in one image
(front view, side view, back view), kneeling in formal seiza posture, hands resting
flat on her thighs, complete from shoulders down to folded knees and feet.
IMPORTANT: the figure has NO HEAD and NO NECK — the body ends in a clean flat
horizontal cut just above the collarbones, like a broken statue. Nothing above the shoulders.
She wears a traditional miko outfit: a faded off-white kosode top and dull vermilion
red hakama trousers, both aged and stained, fabric falling close to the body.
A thin plaited cord at the waist. Bare pale feet tucked under her.
Grayish dead skin on the hands. Still, patient, upright posture.
Stylized semi-realistic Japanese game character concept art, solid closed geometry,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent across all three views, high detail, 4k.
```

- **무녀로 잡은 이유** — ① 이 사당이 지키는 공물이 **붉은 방울**(神楽鈴)이라 무녀가 즉시 읽힌다
  ② 흰 + 바랜 주홍은 초칭·피안화·도리이의 팔레트와 같은 계열이다
  ③ 2부에서 **긴 목으로 금줄을 감아 봉인을 완성**하는데(§5.3.1), 그건 원래 무녀의 일이다
  마을 여자(낡은 기모노)로 가고 싶으면 2~3 번째 줄만 갈아 끼우면 된다
- 「NO HEAD and NO NECK」이 무시되고 머리가 달려 나오면 **재생성**한다. 잘라 붙이지 말 것 —
  목 밑동 단면이 지저분하면 튜브 접합부가 밤에도 눈에 띈다
- 正座 로 뽑는 이유: 리깅을 안 하므로 최종 포즈로 생성한다(도로타보와 같은 방식).
  제단 뒤에 그대로 앉혀 놓는다

### 6-B. 머리 (`yokai-rokurokubi-head`) — 클로즈업 · 튜브 접합용 목 밑동 포함

```
Character head reference sheet of a Japanese shrine maiden ghost, three views in one
image (front view, side view, back view), head and a short neck stump only, no torso.
The neck is cut off cleanly in a flat horizontal cross-section about 12 cm below the jaw —
the cut face is a plain flat disc, clean and closed, not torn or bloody.
A young woman's face, grayish-white bloodless skin, calm and expressionless,
eyes open wide and looking straight ahead, lips slightly parted.
Straight black hair parted in the middle, falling to just below the neck stump,
tied low with a plain white paper cord.
Filling the frame, sharp facial detail.
Stylized semi-realistic Japanese game character concept art, solid closed geometry,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent across all three views, high detail, 4k.
```

- **머리카락을 목 밑동보다 길게 만들지 않는다.** 목이 3 m 늘어나면 머리카락이 허공에 뜬 판이 된다.
  펄럭이는 긴 머리가 필요하면 튜브를 따라가는 코드 리본으로 따로 만든다
- **웃는 얼굴로 뽑지 않는다.** 이 보스의 무서움은 *무표정한 얼굴이 천장에서 내려오는 것*이다.
  표정 변화가 필요해지면 그때 텍스처 한 장을 더 만든다(유리의 얼굴 복원과 같은 방식)
- 단면이 「flat disc」여야 한다 — 찢긴 단면으로 나오면 튜브 반경을 맞출 기준이 사라진다

### 6-C. 조립 메모 (모델이 나온 뒤)

- **목 밑동 지름을 재서** `TubeGeometry` 반경으로 쓴다. 머리 쪽 단면과 몸통 쪽 단면의 지름이
  다르면 큰 쪽에 맞추고 작은 쪽을 살짝 키운다(튜브가 살 밖으로 나오는 것보다 낫다)
- 스플라인 제어점은 **대들보를 경유**한다 — 몸통 어깨 → 천장 대들보 → 플레이어.
  천장 4.2 m 는 그러라고 잡은 높이다(`world/higasato/hokora.ts`)
- 목에 **꺾이는 각도 한계**를 준다(§5.3.1 파훼 ②). 한계가 없으면 사각이 사라져 게임이 안 된다

---

---

## 생성 → Tripo 투입 체크리스트

1. 생성 결과 확인: □ 3뷰가 같은 인물인가 □ 발끝까지 나왔나 □ 배경이 무지인가 □ 하반신 실루엣이 읽히나(추격자류)
2. `docs/references/yokai-<이름>-sheet.png` 로 저장
3. 탐색 생성(텍스처 없음, ~20크레딧)으로 형태 먼저 확인:
   `npm run tripo:generate -- --image docs/references/yokai-hasshaku-sheet.png --name yokai-hasshaku-explore`
4. 형태 OK → detailed 확정(40) → 추격자류만 `tripo:rig -- --spec tripo`(25) → Mixamo 클립 리타겟
5. 팔척귀신은 리타겟 후 **엔진에서 2.4 m 스케일** (모델 자체는 표준 신장으로 생성·리깅하는 게 안전)
6. 로쿠로쿠비는 **리깅하지 않는다**. 몸통은 탐색 품질(20)로 충분하고, 머리만 detailed(40) 로 확정한다 —
   플레이어 눈앞까지 오는 건 머리뿐이다
