# 인물 레퍼런스 이미지 생성 프롬프트 — 미오 · 어린 미오 · 사요

목적: **GPT Image 2 → Tripo image-to-model 입력용.** 일러스트가 아니라 3D 생성이 잘 되는 이미지가 기준이다.
3D 생성 조건과 화풍 모두 [yokai-prompts.md](yokai-prompts.md)를 따른다 —
**요괴 시트와 같은 반실사 컨셉아트**로 통일한다(초판이 사진으로 나온 원인은 2절).

작성일: 2026-08-20 · 수정: 2026-08-20 (요괴와 같은 반실사로 통일) · 대상: [PLAN-STORY.md](../PLAN-STORY.md) ACT 1~35

---

## 0. 이 세 인물은 **한 세션에서** 뽑아야 한다

미오와 어린 미오는 **같은 사람**이고(10년 차), 사요는 그 언니다. 따로 뽑으면 남남이 된다.
같은 대화에서 연달아 생성하고, 얼굴 묘사 문구를 **글자 그대로 복사**해 쓴다:

세 프롬프트 모두 **같은 얼굴 한 줄**을 쓴다. 이 줄을 글자 그대로 복사하면 세 인물이 한 가족이 된다:

```
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes,
straight black hair with a blunt fringe.
```

| 인물 | 이 줄에 더하는 것 |
|---|---|
| 미오 | `in a chin-length bob, one side tucked behind her ear` |
| 어린 미오 | `in a short bob to the jaw, neatly combed` |
| 사요 | `and a calmer steadier gaze` · `gathered at the back with a bright red ribbon` |

> 해부학적 묘사(`almond eyes`, `small nose` 같은 초상 사진 어휘)를 쓰면 생성기가 **사진**으로 간다.
> 위 줄은 같은 얼굴을 **컨셉아트 어휘**로 규정한 것이다 — 2절이 그 이유다.

---

## 1. 스토리보드가 요구하는 **시각 단서** (바꾸면 안 되는 것)

이 셋은 미술 취향이 아니라 **후반부의 증거물**이다. 색이 틀리면 단서가 성립하지 않는다.

| 단서 | 인물 | 어디서 회수되는가 |
|---|---|---|
| **푸른 원피스** | 어린 미오 | ACT 9 벽장의 크레용 그림("푸른 원피스를 입은 아이") → 플레이어가 가족사진과 대조 · ACT 16-12 **붉은 방울에서 "푸른 옷의 실밥"이 발견되어 미오가 지목된다** |
| **붉은 리본** | 사요 | 같은 크레용 그림("붉은 리본을 한 아이") — 두 아이가 손을 잡고 있다 |
| **손목의 작은 방울 장식** | 어린 미오 **만** | ACT 16-1 사요가 매어준다 → ACT 31 사요가 마지막에 돌려준다 → ACT 33·34 미오가 계속 지닌다 |
| **방울이 **없는** 손목** | 16세 미오 | 아직 돌려받기 전이다. 있으면 ACT 31 이 무너진다 |

**팔레트**: 세 인물을 **남색 + 흰색**으로 묶고, **붉은색은 사요의 리본과 방울 끈에만** 둔다.
이 게임에서 붉은색은 피안화의 색이다 — 사요에게만 붉은색이 있는 것이 곧 복선이다.

---

## 2. 화풍 — **요괴 시트와 같은 반실사로 통일** (2026-08-20 재수정)

요괴 4종은 전부 아래 마무리 문장으로 만들어졌고, 결과가 **stylized semi-realistic 게임 컨셉아트**다.
사람 인물도 같은 화풍으로 간다 — 한 게임 안에서 사람만 다른 그림체면 그때부터 어긋난다.

```
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

### 그런데 왜 초판은 **사진**으로 나왔나

같은 마무리 문장을 썼는데 요괴는 컨셉아트가 되고 사람은 사진이 됐다. 이유는 하나다 —

> **기존 요괴 넷은 전부 얼굴이 없거나 가려져 있다.**
> 놋페라보 = 민얼굴 · 팔척귀신 = 갓 그늘 · 여우 요괴 = 가면 · 도로타보 = 외눈 진흙.
> 생성기가 **사람 얼굴을 그릴 일이 한 번도 없었다.**

미오·사요는 얼굴이 있어야 하는데, 거기에 초판이 이렇게 썼다:

```
Round soft face, large dark brown almond eyes with slightly downturned outer corners, small nose
```

`almond eyes` · `small nose` 는 **인물 사진을 묘사하는 어휘**다. 이 문장이 들어가는 순간
생성기는 초상 사진 쪽으로 간다. 마무리의 `high detail, 4k` 가 그걸 더 밀어준다.

### 고침 — 얼굴을 **설계**로 쓴다

해부학이 아니라 **캐릭터 디자인 용어**로 적고, 얼굴 문장 안에 화풍을 한 번 더 박는다.

| 쓰지 않는다 (사진 어휘) | 쓴다 (컨셉아트 어휘) |
|---|---|
| `large almond eyes with downturned outer corners` | `stylized dark eyes with a quiet downturned shape` |
| `small nose`, `soft round face` | `simplified facial features` |
| `realistic skin` | `matte painted skin` |
| 얼굴을 3~4줄에 걸쳐 묘사 | **한 줄로 끝낸다** — 나머지는 의상·실루엣에 쓴다 |

세 프롬프트의 얼굴 줄은 전부 아래 한 줄로 통일한다(사요만 `and a calmer steadier gaze` 를 더한다):

```
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes,
straight black hair with a blunt fringe.
```

## 3. 공통 규칙 (모든 프롬프트에 이미 포함됨)

| 규칙 | 이유 |
|---|---|
| 3뷰 시트 **한 장**으로 생성하되, Tripo 에는 **잘라서 여러 장**으로 넣는다 | 한 장으로 뽑아야 세 뷰가 같은 인물이 된다. 그러나 `multiview_to_model` 은 **뷰마다 파일이 따로**여야 한다 — 시트를 통째로 넣으면 도상 셋이 나란히 선 물체가 나온다(20크레딧 날림) |
| **얼굴은 두상 시트를 따로 뽑는다** | 아래 "해상도" 절. 전신 시트만으로는 얼굴이 132px 밖에 안 된다 |
| A-포즈, 머리~발끝 전신, 잘림 없음 | 자동 리깅(biped) 성공 조건 |
| 플랫한 균일 조명, 드리운 그림자 금지 | Tripo 는 이미지의 음영을 지오메트리로 오해한다 |
| **중간 회색 무지 배경** | 요괴 시트와 같은 배경. 흰 카라·흰 양말이 배경에 묻지 않는다 |
| **치마는 다리에 붙게, 밑단 아래로 다리가 읽히게** | 넓은 종 실루엣은 자동 리깅이 다리를 못 찾는다. **이 셋의 최대 리스크** |
| 젖음·비·유령 효과 금지 | 솔리드 지오메트리만 생성된다. 비는 엔진 재질로 |

### 해상도 — **얼굴이 뭉개지는 진짜 원인** (2026-08-21 측정)

미오 1차본의 얼굴이 뭉개진 원인은 폴리곤도 텍스처도 API 파라미터도 아니었다. **입력 해상도다.**

```
char-mio-16-sheet.png   1024x1024,  정면 도상 키 994px,  머리 116x132px  (머리:키 = 1:7.6)
```

사람 머리는 키의 1/7.6 이다. **1024 높이 프레임에 전신을 세우면 머리는 자동으로 132px 로 결정된다** —
크롭으로도 확대로도 못 바꾼다. 확대는 없던 정보를 만들지 않는다. Tripo 는 132px 에서
눈꺼풀·콧방울·입술을 **지어내야** 하고, 그 지어낸 결과가 울퉁불퉁한 볼과 20대로 보이는 얼굴이다.

셀 화풍인 기존 주인공은 얼굴이 130x147px 로 **더 작은데도** 멀쩡하다. 셀 화풍의 눈은
경계가 뚜렷한 도형이라 평평하게 재현하면 정답이기 때문이다. **반실사는 음영에서 입체를
역산해야 해서 저해상도에 훨씬 약하다** — 화풍을 반실사로 정한 순간 해상도가 병목이 된다.

#### Tripo 공식 권장: **2048x2048 이상** ([공식 튜토리얼](https://www.tripo3d.ai/tutorials/tripo-ai-image-to-3d-tips))

> "It is recommended to use images with a resolution above 2048x2048 pixels as input sources."
> "sufficient resolution ensures the algorithm captures subtle contour changes" — **얼굴을 명시해서** 언급한다.

**1차본은 1024 로 넣었다. 권장치의 절반이다.** 이것이 1차 원인이다.

| 프레임 | 얼굴 픽셀 | 배수 |
|---|---:|---:|
| 1024 전신 (1차본) | 116 x 132 | 1x |
| **2048 전신** (공식 권장 하한) | 약 232 x 264 | **4x** |
| **4096 전신** | 약 464 x 528 | **16x** |
| 2048 폭 두상 3면 시트 | 약 900 x 1200 | **70x** |

**먼저 할 것은 시트를 2048 이상으로 다시 뽑는 것이다.** 이게 공식이 말하는 해법이고,
프레임을 바꾸지 않으므로 몸의 품질도 같이 올라간다.

두상을 따로 뽑아 접합하는 방법은 **배수가 더 크지만 공식 문서에 근거가 없다** — Blender 접합
비용과 화풍 불일치 위험이 붙는다. 2048~4096 전신으로 먼저 시도하고, 그래도 얼굴이 부족할 때
꺼내는 카드로 둔다.

> 확대(업스케일)로는 안 된다. 1024 생성물을 4096 으로 늘려도 정보량은 그대로다.
> **생성 단계에서부터** 2048 이상으로 뽑아야 한다.

---

## 4. 아마미야 미오 (雨宮 澪) · 16세 — 주인공

> 소극적이고 죄책감을 쉽게 느낀다. 표정은 **울 것 같지 않고 그냥 지쳐 있어야** 한다 —
> 비장하면 ACT 22 의 각성이 죽는다.

**스토리보드에서 나온 설계 근거** (취향이 아니라 대사·지문에서 뽑은 것):

| 근거 | 디자인 |
|---|---|
| ACT 2 기사가 **"학생."** 이라 부른다 | 한눈에 학생으로 보여야 한다 → **여름 교복** |
| 피안제 = 추분(9월), 산속 밤 | **반팔 하복 + 걸친 카디건**. 낮에 출발해 밤에 도착했다 |
| ACT 2 "사람을 찾으러 가요" — 혼자 산속 폐촌으로 | 여행 채비가 아니라 **학교 가는 차림 그대로 와 버렸다** |
| ACT 2 게임플레이에 **손전등** | 가방끈에 매단 손전등. 산에 맞지 않는 유일한 준비물 |
| ACT 2 "사진을 가방에 넣고" · 사요 얼굴이 훼손된 사진 | 낡은 **숄더백** (학교 가방 아님 — 사진이 든 개인 가방) |
| ACT 6 로쿠로쿠비가 "손목과 가방을 노린다" | 손목과 가방이 실루엣에서 **읽혀야** 한다 |
| 소극적·죄책감 | **소매가 손등을 덮는 큰 카디건** — 손을 감추는 사람으로 읽힌다 |
| 산길에 로퍼 | 준비 없이 왔다는 게 **신발 하나로** 드러난다 |
| ACT 31 에서야 방울을 받는다 | **손목이 비어 있어야 한다** |

```
Character reference sheet of a quiet 16-year-old Japanese schoolgirl,
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
She has travelled alone to a mountain village straight from school, tired and withdrawn,
shoulders slightly drawn in, mouth closed, not smiling.
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes,
straight black hair in a chin-length bob with a blunt fringe, one side tucked behind her ear.
She wears a short-sleeved white summer sailor blouse with a navy collar and two thin white
stripes, a small dark red neckerchief, and a navy knee-length pleated skirt hanging straight
and close to her legs; bare legs clearly visible below the hem, white ankle socks and brown
leather school loafers that do not suit a mountain path.
Over it an oversized navy knit cardigan, unbuttoned, sleeves long enough to cover her hands.
A worn brown leather shoulder bag on a long strap crossing her chest, a small metal
flashlight clipped to the strap. Her wrists are bare, no bracelet of any kind.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

---

### 4-1. 2차 생성 (2026-08-21)

1차본(`char-mio-16-sheet.png`)으로 **몸은 잘 나왔다** — 세일러복·주름치마·가방·로퍼·손가락 전부 살아 있다.
얼굴만 뭉갰고, 원인은 위 "해상도" 절대로 **입력이 1024 였던 것**이다.

**순서대로 간다:**

1. **전신 3면 시트를 2048~4096 으로 재생성** ← 공식 권장. 이것부터 한다
2. 전신 **우측면** 1장 추가 (아래 B) — 슬롯 4가 비어 가방 쪽을 추측 중이다
3. 1·2로도 얼굴이 부족하면 그때 **두상 시트**(아래 A) + Blender 접합

> **생성 시 1차 시트를 참조 이미지로 반드시 첨부한다.** 같은 인물·같은 화풍이어야 한다.
> 특히 3번까지 갈 경우 두 모델을 접합하므로 화풍이 어긋나면 못 쓴다.

**1차본의 실제 디자인** (프롬프트 문안과 다르게 나온 부분이 있으니 이쪽을 기준으로 한다):
긴소매 남색 세일러 상의(흰 줄 두 줄) · 남색 스카프를 가슴에서 매듭 · 남색 무릎길이 주름치마 ·
흰 발목양말 · 갈색 로퍼 · **가방끈은 오른쪽 어깨, 가방은 왼쪽 엉덩이** · 턱선 단발에 일자 앞머리 · 손목 비어 있음.
(문서 4절의 반팔 하복 + 카디건 + 붉은 스카프 + 손전등은 반영되지 않았다.)

#### A. 얼굴용 — 두상 3면 시트 · **가로로 긴 비율(1536x1024 등)**

```
Character head reference sheet of a quiet 16-year-old Japanese schoolgirl,
three views of the HEAD ONLY in one wide image, evenly spaced in a row:
front view, left profile view, and back-of-head view.
Framing: head and shoulders only, cropped just below the collarbone. The head fills the
frame vertically in every view — no full body, no wasted space above or below the head.
All three views at identical head size, identical eye level and identical camera height.
Straight black hair in a chin-length bob with a blunt fringe, one side tucked behind her ear.
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes.
Tired and withdrawn, mouth closed, not smiling, looking straight ahead.
She wears a navy sailor blouse with a navy collar and two thin white stripes; the collar and
the knot of a navy neckerchief are visible at the bottom edge of each view.
Stylized semi-realistic Japanese game character concept art, flat even studio lighting,
no cast shadows, no rim light, plain solid mid-gray background,
consistent character across all three views.
```

- **`identical head size, identical eye level`** 이 핵심이다. 뷰마다 머리 크기나 눈높이가 다르면 multiview 재구성이 뒤틀린다
- **카라와 스카프 매듭이 하단에 보여야** 몸과 접합할 때 목 라인이 맞는다
- 세 두상을 **한 장에** 담으므로 머리 하나당 약 460x600px — 1차본의 **18배**다.
  뷰마다 1024 를 따로 쓸 수 있으면 51배지만, 따로 생성하면 세 뷰가 다른 사람이 될 위험이 있다

#### B. 몸용 — 전신 **우측면** 1장 · 1024x1024

`multiview` 슬롯은 `[정면, 좌측, 후면, 우측]` 인데 지금 **네 번째가 비어 있어** Tripo 가 좌측을
뒤집어 추측하고 있다. 가방을 한쪽에만 메고 있으므로 이 추측이 틀린다.

```
Full-body character reference of a quiet 16-year-old Japanese schoolgirl, a SINGLE view:
her RIGHT side seen in strict profile from her right, standing A-pose,
full body from head to toe, nothing cropped.
Long-sleeved navy sailor blouse with a navy collar and two thin white stripes, a navy
neckerchief knotted at the chest, a navy knee-length pleated skirt hanging straight and
close to her legs, bare legs clearly visible below the hem, white ankle socks,
brown leather school loafers.
The brown leather bag strap passes over her RIGHT shoulder and crosses down her back;
the bag itself hangs on her far left hip and is only partly visible behind her body.
Straight black chin-length bob with a blunt fringe. Her wrists are bare.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
same body scale and same eye level as the existing three-view sheet.
```

#### 투입

```bash
# A 시트를 정면/좌측/후면 3장으로 자른 뒤 (배율 변경 금지 — 확대는 정보를 만들지 않는다)
npm run tripo:generate -- --front docs/references/char-mio-16-head-front.png \
  --side docs/references/char-mio-16-head-side.png --back docs/references/char-mio-16-head-back.png \
  --name mio-head --model P1-20260311 --texture true --pbr true --quality detailed --face-limit 20000

# B 를 더해 몸을 4면으로 다시 (기존 3장 + 우측면)
npm run tripo:generate -- --front docs/references/char-mio-16-front.png \
  --side docs/references/char-mio-16-side.png --back docs/references/char-mio-16-back.png \
  --right docs/references/char-mio-16-right.png \
  --name mio-body-4v --model P1-20260311 --texture true --pbr true --quality detailed --face-limit 20000
```

**`face_limit` 상한은 P 시리즈가 20000 이다**(API 검증 확인). 그 이상 넣으면 거절된다.
v3.1 은 상한이 없지만 140만 폴리곤에서도 **눈 형상이 아예 안 나왔다** — 폴리곤이 아니라 토폴로지 문제다.

---

## 5. 어린 미오 · 6세 — 회상·환영 (ACT 14 · 16 · 25-1)

> **푸른 원피스가 이 게임의 물증이다.** 채도 낮은 남빛(indigo)으로 — 사요의 유카타와 같은 계열이어야 한다.
> 겁먹은 표정으로 뽑으면 ACT 25-1 의 "그럼 내가 잘못한 거야?" 가 안 살아난다.

| 근거 | 디자인 |
|---|---|
| ACT 16-2 축제 밤, 사요를 기다리다 혼자 걸어간다 | **축제에 온 아이 차림** — 새 원피스, 머리를 빗겨 준 티 |
| ACT 9 크레용 그림 "푸른 원피스" · ACT 16-12 "푸른 옷의 실밥" | **남빛 원피스**. 이 색이 미오를 지목하는 증거다 |
| ACT 16-1 사요가 손목에 매어 준다 | **왼손목 붉은 끈 + 작은 방울** |
| ACT 6 어린 미오가 방울을 **집는다** | 손이 실루엣에서 보여야 한다 |

```
Character reference sheet of a 6-year-old Japanese girl at a summer festival,
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
The same character as an older schoolgirl with a black bob, clearly the same person at a
younger age. Calm curious expression, lips slightly parted, not frightened.
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes,
straight black hair in a short bob to the jaw with a blunt fringe, neatly combed as if
someone older brushed it for her.
Slim child proportions with clearly readable arms and legs, natural head-to-body ratio for
a young child, not chibi and not a doll.
She wears a sleeveless indigo-blue cotton dress with a plain white collar and small white
trim, clearly her good dress, the skirt narrow and hanging close to her legs, ending above
the knee; bare legs and knees clearly visible, short white socks, simple brown sandals.
On her left wrist a thin red cord with one small round brass bell — the only red on her.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

- **`not a chibi and not a doll`** — 아이 비율을 요청하면 생성기가 2등신으로 만들고, 그러면 자동 리깅이 실패한다
- 방울은 **왼손목**. 16세 미오에게는 없다 — 두 시트를 나란히 놓고 확인
- 원피스가 하늘색으로 나오면 재생성. **남빛(indigo)** 이어야 사요와 묶인다

---

## 6. 아마미야 사요 (雨宮 紗世) · 실종 당시 12세 — 언니

> 10년 전 모습 그대로다. 현재 장면(ACT 19~)에서도 이 모델을 쓴다 —
> **16세 미오보다 어려 보이는 언니**라는 어긋남이 이 인물의 전부다.
> 축제 밤에 실종됐으므로 **여름 유카타 차림 그대로** 10년을 있었다.
> 침착하게 뽑되 강해 보이면 안 된다. 무서웠던 아이다(ACT 30).

| 근거 | 디자인 |
|---|---|
| ACT 16-1 피안제 준비 중 실종 | **여름 유카타 차림 그대로** 10년을 있었다 |
| ACT 9 크레용 그림 "붉은 리본" | **뒤통수의 붉은 리본** — 후면 뷰에 반드시 |
| ACT 16-1 "언니 거는?" / **"우리는 자매니까 하나면 돼"** | **사요의 손목은 비어 있다.** 이 공백이 그 대사다 |
| ACT 16-4 참사 중 폐교를 가로지른다 · ACT 20 달린다 | 달릴 수 있는 **정강이 길이** 유카타 |
| ACT 19 미오(16세)보다 어려 보이는 언니 | 12세 비율. 이 어긋남이 이 인물의 전부다 |

```
Character reference sheet of a 12-year-old Japanese girl at a summer festival,
three views in one image (front view, side view, back view), standing A-pose,
full body from head to toe.
The older sister of a younger girl with the same face, with a slightly narrower chin.
Composed expression, mouth closed.
Simplified stylized facial features, matte painted skin, quiet dark downturned eyes and a
calmer steadier gaze, straight black hair with a blunt fringe gathered at the back and tied
with a bright red ribbon clearly visible from behind.
She wears a dark navy cotton summer yukata with a small pale pattern, the fabric wrapped
narrow and close to the body, short straight sleeves, hem ending at mid-calf so both shins
are clearly visible, tied with a simple bright red obi sash; bare shins, white tabi socks,
plain wooden geta sandals.
Her wrists are completely bare — she gave her only bell to her little sister.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
consistent character across all three views, high detail, 4k.
```

- 유카타 밑단은 **정강이 중간**까지만 — 발목까지 내려오면 리깅이 다리를 못 찾는다
- 붉은 리본은 **뒤통수**다. 후면 뷰에 반드시 보여야 한다 (ACT 9 그림의 단서)
- 창백함·피안화 줄기는 **넣지 않는다** — 10년 전 살아 있던 ACT 16 에도 같은 모델을 쓴다. 현재 장면의 냉기는 엔진 재질로
- **손목이 비어 있는 것이 대사다** (ACT 16-1 "우리는 자매니까 하나면 돼"). ACT 31 에서 방울을 돌려줄 때만 프랍으로 붙인다

---

## 7. 생성 후 체크리스트

1. □ **요괴 시트(`yokai-kitsune-sheet.png`)와 같은 그림체인가** — 사진처럼 나왔으면 즉시 재생성(이미지 생성은 크레딧 0)
2. □ 3뷰가 같은 인물인가 □ 발끝까지 나왔나 □ 배경이 무지인가
3. □ **치마·유카타 밑단 아래로 다리가 읽히나** (가장 자주 실패하는 항목)
4. □ 미오 손목이 비어 있나 · 어린 미오 왼손목에 방울이 있나 · 사요 뒤통수에 붉은 리본이 있나
5. □ 세 시트를 나란히 놓았을 때 **한 가족으로 보이나**
6. 아래 이름으로 저장 — **나이를 파일명에 박는다**(미오가 둘이라 안 그러면 어느 쪽인지 알 수 없다)

| 인물 | 파일 |
|---|---|
| **미오 · 16세** (10년 후, 주인공 — 게임 내내 조작하는 인물) | `docs/references/char-mio-16-sheet.png` |
| 어린 미오 · 6세 (프롤로그·회상·환영) | `docs/references/char-mio-06-sheet.png` |
| 사요 (실종 당시) | `docs/references/char-sayo-sheet.png` |

## 8. Tripo 투입 순서

```bash
# ① 탐색 — 형태만 확인 (텍스처 없음, 20크레딧)
npm run tripo:generate -- --image docs/references/char-mio-sheet.png --name mio-explore --texture false

# ② 확정 (40크레딧)
npm run tripo:generate -- --image docs/references/char-mio-sheet.png --name mio --texture true --pbr true --quality detailed

# ③ 리깅 — spec 은 반드시 tripo (25크레딧)
npm run tripo:rig -- --task <task_id> --name mio --spec tripo

# ④ 리타게팅 — 미오·사요는 9클립, 나머지는 3클립 (클립당 10크레딧)
#    --task 는 ③의 **rig task_id** 다 (②의 생성 task_id 가 아니다)
npm run tripo:animate -- --task <rig_task_id> --name mio \
  --anims idle,walk,run,jump,fall,turn,jump_down,look_around,standing_relax

# ⑤ 웹 에셋 빌드 → public/models/*.glb (텍스처 2K WebP · meshopt)
npm run build:character
```

> **`--spec mixamo` 는 쓰지 않는다.** 주인공 제작 때 "mixamo 스켈레톤 리타겟 미지원" 으로 25크레딧을 날렸다
> ([character-spec.md](character-spec.md) 기록). `tripo` 스펙이 41본으로 나오고 그걸 쓴다.

**예상 비용**: 미오 165 · 사요 165 · 어린 미오 95(3클립) + 탐색 60 ≈ **485크레딧**

## 9. 알려진 리스크

| 리스크 | 대응 |
|---|---|
| **6세 비율 리깅 실패** — biped 프리셋은 성인 비율을 가정한다 | `rig-check` 가 0크레딧이니 **탐색 단계에서 먼저 확인**. 실패하면 ① 프롬프트에서 다리를 더 길게(`9-year-old proportions`) ② 그래도 안 되면 정적 모델 + 코드 애니메이션(환영 NPC 라 대부분 서 있거나 페이드다) |
| **주름치마·유카타가 다리를 삼킴** | 위 체크리스트 3번. 재생성이 리깅 실패보다 싸다(이미지 생성은 크레딧 0) |
| 미오 재생성으로 기존 애니 9클립을 다시 사야 함 | 이미 반영(165). 기존 `character.glb` 는 `?scene=village` 구 맵용으로 남겨둔다 |
| 세 인물이 안 닮음 | 0절 — 같은 세션, 얼굴 문구 복사. 안 되면 미오 시트를 참조 이미지로 물려 생성 |
| **또 사진처럼 나온다** | 얼굴 줄을 더 줄인다 — `Simplified stylized facial features, matte painted skin` 만 남기고 눈·머리 묘사를 의상 문단으로 옮긴다. 그래도 안 되면 마무리에서 `high detail, 4k` 를 빼고 `painted concept art illustration` 로 교체 |
| 알베도에 음영이 구워져 온다 | 반실사 시트는 그림자가 텍스처에 박힌다 — 기존 요괴와 동일하게 생성 후 `model.gradeAlbedo()` 로 눌러 쓴다 |
