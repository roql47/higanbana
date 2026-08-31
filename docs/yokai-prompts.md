# 요괴 레퍼런스 이미지 생성 프롬프트

목적: **Tripo image-to-model 입력용**. 일러스트가 아니라 3D 생성이 잘 되는 이미지가 기준이다.
(제작 검증 조건: **정면 단독 뷰** · 전신 A-포즈 · 균일 조명 · 무지 배경)

> **3뷰 시트 규칙은 폐기됐다 (2026-08-24, 사용자 지시).** 한 장에 정면/측면/후면을 넣으면
> 생성기가 그걸 **한 인물로 읽지 않는다** — 몸이 셋 붙은 메시나 팔이 겹친 결과가 나온다.
> `scripts/tripo/generate.ts` 의 기본 입력도 원래부터 `character-front.png`(정면 한 장)였다.
> 이제 문서와 실제 파이프라인이 같은 규칙을 쓴다.

## 공통 규칙 (모든 프롬프트에 이미 포함됨)

| 규칙 | 이유 |
|---|---|
| **정면 단독 뷰 한 장**, 세로 2:3 또는 3:4 | Tripo single-image 입력. 3뷰 시트·턴어라운드·분할 크롭 전부 금지(검증됨) |
| 정확히 정면 — 카메라를 똑바로 본다, 3/4 각도 금지 | 측면 정보를 생성기가 **추론**하게 두는 편이 시트를 주는 것보다 낫다 |
| A-포즈, 전신 머리~발끝, 잘림 없음 | 자동 리깅(biped) 성공 조건. 팔이 몸통에 붙으면 한 덩어리로 생성된다 |
| 플랫한 균일 스튜디오 조명, 그림자·안개·글로우 금지 | Tripo 는 이미지의 음영을 지오메트리/알베도로 오해한다 |
| 중간 회색 무지 배경 | 흰 옷(팔척귀신)이 배경에 묻지 않게 흰 배경 금지 |
| 반투명·유령 이펙트·파티클 금지 | 솔리드 지오메트리만 생성 가능 |
| 스타일: stylized semi-realistic (주인공과 동일 계열) | 월드 톤 통일. 공포는 조명·연출이 만든다 |
| 몸에 붙는 좁은 실루엣 의상 | 넓은 종/치마 실루엣은 자동 리깅이 다리를 못 찾는다 |

공통 네거티브 (지원하는 생성기에서):
```
multiple views, turnaround sheet, character sheet, side view, back view, three-quarter view,
two characters, multiple overlapping characters,
fog, mist, glow, transparency, ghost effect, particles, motion blur, dramatic lighting,
dark scene, cropped body, cut off feet, text, watermark, wide bell skirt, background scenery
```

---

## 1. 팔척귀신 (八尺様) — 메인 추격자 · H2 · 최우선

```
Full-body front view character reference of a terrifying Japanese ghost woman
"Hasshaku-sama", facing the camera straight on, standing A-pose,
entire body from head to toe inside the frame, arms held away from the torso.
Unnaturally tall and elongated proportions: very long arms, long neck, narrow shoulders.
She wears a plain white ankle-length summer dress with a narrow straight silhouette,
thin fabric hanging close to her legs, pale bare feet visible below the hem.
On her head a wide-brimmed traditional Japanese woven straw hat (ichimegasa);
the brim shadows her upper face — only a pale chin and a faint unsettling smile visible.
Long straight black hair falling from under the hat down her back.
Grayish-white dead skin. Subtly wrong anatomy, too-long fingers.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
one single character centered and symmetrical in the frame,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
high detail, 4k.
```

- 비율 2:3 세로. **다리 실루엣이 드레스 밖으로 읽혀야 한다** — 생성 결과에서 하반신이 원통이면 리깅 실패 확률이 높으니 재생성
- 갓(笠) 챙이 얼굴을 가리는 건 의도 (게임에서도 초칭을 위로 비춰야 입이 보인다)

## 2. 여우 요괴 (妖狐) — 신사 2차 추격자 · H3

```
Full-body front view character reference of a sinister Japanese fox spirit in
human form, facing the camera straight on, standing A-pose,
entire body from head to toe inside the frame, arms held away from the torso.
Slender androgynous figure wearing a worn indigo-blue yukata with faded
geometric festival patterns, fabric wrapped close to the body, simple obi sash,
bare feet in wooden geta sandals.
Face fully covered by a white kitsune fox mask with red painted markings and
narrow slanted eye slits. Wild silver-gray hair spilling around the mask.
Slightly hunched predatory posture, long-nailed pale hands.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
one single character centered and symmetrical in the frame,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
high detail, 4k.
```

- 가면이 정면을 똑바로 봐야 한다. 고개를 기울인 결과는 재생성 — 마스크의 좌우 대칭이 무너지면 생성물의 얼굴이 뭉개진다

## 3. 도로타보 (泥田坊) — 논 영역형 · H3 · 리깅 불필요

```
Full-body front view reference of the Japanese yokai "Dorotabo", a mud creature
rising from a rice paddy, facing the camera straight on, entire figure inside the frame.
Upper half of a gaunt male figure emerging from a solid mound of dark wet mud —
the mound forms the base of the model like a sculpture pedestal.
Torso, head and raised arms made of thick sculpted dripping mud with a clay-like
solid surface, arms raised and held clear of the torso.
A single large round eye in the center of the face, hollow mouth
open in a wail, each hand with only three thick fingers.
Muddy earth tones, matte wet-clay texture.
Stylized semi-realistic Japanese game monster concept art, solid sculptural forms,
one single creature centered and symmetrical in the frame,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
high detail, 4k.
```

- 반신 + 진흙 둔덕 받침 = 닫힌 지오메트리로 생성됨. 리깅 없이 코드로 상하 이동·흔들림
- "dripping" 이 액체 이펙트로 나오면 재생성 — **조각처럼 굳은 형태**여야 한다
- 이 녀석만 A-포즈가 아니다(팔을 들고 우는 자세가 실루엣이다). 대신 **팔이 몸통에서 떨어져** 있어야 한다

## 4. 놋페라보 (のっぺらぼう) — H4 놀래킴 · 정적 모델

```
Full-body front view character reference of a Japanese faceless ghost "Noppera-bo",
facing the camera straight on, standing A-pose,
entire body from head to toe inside the frame, arms held away from the torso.
An ordinary middle-aged village woman in a plain muted brown-gray kimono,
narrow silhouette, simple obi, hair in a modest low bun, sandals.
Her face is completely smooth blank skin — no eyes, no nose, no mouth,
like an egg. Otherwise entirely normal and mundane.
Stylized semi-realistic Japanese game character concept art, clean silhouette,
one single character centered and symmetrical in the frame,
flat even studio lighting, no cast shadows, plain solid mid-gray background,
high detail, 4k.
```

- 무서움은 "평범함"에서 나온다 — 괴물처럼 생성되면 재생성. 정적 모델(리깅 불필요, 앉은 포즈는 게임에서 본 회전으로 처리 불가하므로 서 있는 걸 노점 뒤에 배치)

## 5. 초칭오바케 (提灯お化け) — H4 · 모델 아님, 텍스처 1장

```
A single large realistic human eye, wide open with a small iris, painted on
aged cream-colored washi paper with faint red veins around it,
flat texture, viewed straight on, even lighting, no perspective, square image.
```

- 게임 내 초칭 종이 텍스처(`light/chochin.ts` makePaperTexture)에 0.5초 오버레이할 스왑 텍스처. 3D 생성 안 함

## 6. 로쿠로쿠비 (ろくろ首) — 사당 첫 보스 · ✅ **모델 도착·리깅 완료** (2026-08-22)

> 아래 6-A/6-B 프롬프트(몸통·머리 분리 + 코드 튜브 목)는 **폐기**됐다. 사용자가 완성 모델을
> 직접 가져왔다 — Tripo 정적, **목이 이미 길게 뽑힌 단일 메시**(29k tris · 0.98 m · 리깅 없음).
> 목이 지오메트리로 존재하므로 튜브 스플라인 대신 **목에 본 체인을 심었다**.

| 파일 | 내용 |
|---|---|
| `assets/tripo/yokai-rokurokubi/source.glb` | 원본 (Downloads 에서 보존) |
| `assets/tripo/yokai-rokurokubi/rigged.glb` | 리깅본 — Root/Spine/Chest + **Neck_00..31** + Head + **Hair_L/R** + L/R Arm, 39본 |
| `public/models/yokai-rokurokubi.glb` | 게임용 1.05 MB (webp 1024 + meshopt) · 39본 스킨 보존 확인 |
| `scripts/blender/rig-rokurokubi.py` | 재현 스크립트 — 본 히트가 아니라 **절차적 웨이트**인 이유가 헤더에 |

**엔진에서 목·얼굴을 뱀처럼 (사용자 지시)** — 구동 계약은 리깅 스크립트 헤더에 있다. 요지:
목 32 마디를 **위상차 사인**(Neck_i = A·sin(t·ω − i·φ))으로 굽히고 — 위상 지연이 곧 뱀이다 —
Head 는 마지막에 플레이어 **lookAt** 으로 복원한다(몸이 굽어도 얼굴은 나를 본다).
늘어나기는 스케일이 아니라 마디별 +Y **translate**(텍스처가 균등하게 늘어난다). 급수축·급신장·
감쇠 오버슛은 쓰지 않는다. 긴 머리 4,305 정점은 목 체인에서 분리한 Hair_L/R이 별도 위상으로 움직인다.

## 7. 나츠메 유리 (夏目ユリ) — 폐교 얼굴 없는 학생 · ✅ **모델 도착·적용 완료** (2026-08-25)

> 사용자가 아래 프롬프트로 뽑아 Tripo 로 만든 모델을 가져왔다. **놋페라보 돌려쓰기 졸업.**
> Tripo 정적 단일 메시(뼈·애니 없음) — 유리는 §5.3.2 상 **애니메이션이 없는 캐릭터**라
> 리깅하지 않았다. 팔도 몸에서 약 25° 만 벌어져 있어 그대로 세워도 마네킹으로 안 읽힌다.

| 파일 | 내용 |
|---|---|
| `assets/tripo/yokai-yuri/source.glb` | 원본 9.6 MB · 94k tris · 4096 basecolor + 2048 rm + 1024 normal |
| `public/models/yokai-yuri.glb` | 게임용 **1.13 MB** (`optimize-glb --tex 1024`, webp + meshopt) |
| `main.ts` | `new Yuri({ url: '/models/yokai-yuri.glb', height: 1.30 })` — 키 1.62 → **1.30** |

**인게임 검증 (프로덕션 빌드)**
- 정면이 **+Z** — `yuri.ts` 의 `rotation.y = atan2(dirx, dirz)` 규약과 맞는다(회전 보정 불필요)
- 바닥 접지·피아노/책상 대비 축척 정상. 얼굴은 완전한 무면(無面)으로 나왔다
- **키를 내려도 §5.3.2 전제가 유지된다**: 책상 두 대(0.78 m)를 사이에 두고 4.7 m 에서
  `frozen = true` — 눈높이 레이가 책상을 넘어 그녀의 머리(1.14 m)에 닿는다.
  카메라 뒤로 보내면 `frozen = false` 로 0.6 초에 0.91 m 접근. 양방향 확인
- ⚠️ QA 함정: `yuri.update` 는 `if (!cine && !fpOn)` 안에 있다. **대사가 떠 있으면 AI 가 멈춘다** —
  포인터 락 없이 텔레포트하면 교내 방송 대사가 걸린 채로 남아 「유리가 안 움직인다」로 오진하게 된다.
  AI 만 보려면 `__dbg.yuri.update(dt, __dbg.controller.position, __dbg.camera, __dbg.controller.body)` 를 직접 부른다

아래는 이 모델을 뽑은 프롬프트다(재생성·후속 요괴용으로 보존).

```
Stylized 3D game character asset reference, front view, one character centered,
standing A-pose with arms held clear of the torso,
full figure from head to shoes inside the frame.
A schoolchild character from Japanese folklore — a noppera-bo, a faceless spirit.
A small, slight figure of about 130 cm in model scale, narrow shoulders,
narrow frame; the school uniform hangs loose and looks a size too big on her,
the collar sitting loose and the sleeves falling past the hands.
Fully clothed in an ordinary rural Japanese school uniform: a dark navy
sailor-collar top with plain white trim, a pleated navy skirt reaching below the
knee, plain white socks slumped down, and white indoor school shoes (uwabaki)
with a faded blue toe cap. The uniform is faded and dusty but completely ordinary.
The face is a smooth featureless surface — no eyes, no eyebrows, no nose,
no mouth — as this folklore creature is always depicted.
The head keeps a normal rounded shape, with a short blunt fringe cut straight and
even across the forehead, high above where the brows would be, leaving the blank
face fully exposed.
Black hair worn in two low side pigtails, perfectly even and mirror-symmetrical:
both pigtails are the same length and thickness, hang the same way, and are tied
near their ends with matching faded red cords.
The hair itself is dull and uncombed, but the style is neat and identical on the
left and the right.
Muted grayish color palette. Stylized semi-realistic Japanese game concept art,
non-photorealistic, clean readable silhouette,
one single character centered in the frame, standing straight and facing forward,
flat even studio lighting, no cast shadows, plain solid mid-gray background.
```

네거티브 (공통 네거티브를 이걸로 **대체**한다 — 아래 「필터 회피」 참고):
```
multiple views, turnaround sheet, character sheet, side view, back view, three-quarter view,
two characters, text, watermark, background scenery,
fog, glow, transparency, particles, dramatic lighting, dark scene,
cropped body, cut off feet, adult, teenager, tall figure, kimono, yukata,
eyes, mouth, nose, facial features, smiling,
chubby, plump, round soft face, cute mascot, doll, chibi, oversized head,
asymmetrical hair, uneven pigtails, one pigtail undone, one side loose,
different hair on each side, single pigtail, ponytail, braid, side-swept hair,
long loose hair, hair covering the face,
flared bell skirt, well-fitted uniform, photorealistic, realistic skin texture
```

### ⚠️ 아동 안전 필터 회피 (2026-08-24 실측 — 첫 프롬프트가 NSFW 로 거부됨)

거부된 조합은 **나이 표기 + 신체 묘사**였다. 옷을 다 입은 교복 캐릭터인데도 걸린다:

| 걸린 표현 | 바꾼 표현 | 이유 |
|---|---|---|
| `eight-year-old girl` | `a schoolchild character from Japanese folklore — a noppera-bo` | 나이 숫자와 성별을 함께 쓰지 않는다. 민속 캐릭터로 프레이밍 |
| `thin bare arms and legs, pale grayish skin` | `Muted grayish color palette` | **`bare`·`skin` 을 아예 쓰지 않는다.** 색은 팔레트로만 말한다 |
| `skirt hanging close and narrow against her legs` | `skirt reaching below the knee` | 옷이 몸에 닿는 방식을 묘사하지 않는다. 길이만 말한다 |
| `white ankle socks` | `plain white socks` | 발목·무릎 같은 신체 부위 이름을 지운다 |
| `slightly grubby and damp-looking` | `faded and dusty but neat` | `damp` 는 단독으로도 반응하는 단어다 |
| (없음) | `Fully clothed`, `non-photorealistic` | 명시가 통과율을 올린다 |
| `4k`, `high detail` | 삭제 | 사실적 렌더를 유도해 필터 문턱을 낮춘다 |

- **네거티브도 스캔하는 생성기가 있다.** 옛 네거티브의 `blood, gore, rotting torn clothes,
  sharp teeth, claws` 를 전부 뺐다 — 포지티브가 깨끗해도 이쪽에서 걸린다
- 그래도 막히면 **`Small build, roughly 130 cm tall...` 줄을 통째로 지운다.** 교복·머리·빈 얼굴만
  남겨도 생성기는 학생 실루엣을 만든다
- 그래도 막히면 **팔척귀신과 같은 수법**: 표준 신장(중학생 실루엣)으로 생성하고 **엔진에서
  `height: 1.30` 로 줄인다**(체크리스트 5번과 같은 패턴). 머리-몸 비율이 아이답지 않게 되지만,
  어두운 복도에서 12 m 밖 실루엣으로 읽히는 캐릭터라 실사용에서는 차이가 작다

### 이 캐릭터만의 판단

- **아이여야 한다.** 「彼ヶ里小学校」 3학년 교실이고, 현관 신발장 이름표가 뜯긴 칸의 주인이다.
  코드의 `height: 1.62` 는 놋페라보를 돌려쓰며 따라온 값이다 — 실물이 오면 **1.30** 으로 내린다
  (`main.ts` 의 `new Yuri({ url, height })`). 내리고 나면 LOS 레이가 머리(`height*0.88` = 1.14 m)를
  겨누므로 **책상(0.78 m)이 시선을 막는지 인게임 재확인**이 필요하다 — §5.3.2 는 「책상 뒤에 숨는 것은
  유리에게 통하지 않는다」가 전제다
- **上履き(실내화)를 신는다.** 바깥신은 신발장에 그대로다 — 이름표가 뜯긴 그 칸에. 폐교를 십 년째
  실내화로 걷고 있다는 뜻이고, 플레이어가 현관에서 본 빈칸과 복도에서 만난 그녀가 여기서 이어진다
- **머리는 좌우 대칭 양갈래다** (사용자 결정 2026-08-24). 처음엔 「한쪽만 풀린」으로 갔다가
  **비대칭 결과가 계속 마음에 들지 않아 되돌렸다.** 프롬프트에서 `strongly asymmetrical`·
  `one side unravelled` 계열을 전부 빼고 `mirror-symmetrical` 을 명시 + 네거티브로 잠갔다.
  붉은 끈은 준비실 크레용 그림의 「붉은 리본 여자아이」와 같은 것이다.
  2부 성불의 빗질은 「풀린 쪽을 다시 묶는다」가 아니라 **「엉킨 머리를 빗어 내린다」** 가 된다 —
  머리 «모양»은 그대로고 «상태»(uncombed → combed)만 바뀌므로, 얼굴 복원과 같은 프레임에서
  재질/텍스처 교체로 처리하는 편이 오히려 깔끔하다
- **체형은 「몸」이 아니라 「헐렁한 교복」으로 쓴다.** 마른 걸 말하려고 신체를 묘사하면 필터가 걸린다
  (아래 표). 소매가 손을 덮고 깃이 뜨고 양말이 흘러내린 쪽이 «야위었다»를 더 잘 보여주기도 한다 —
  십 년 동안 자라지 않은 아이가 십 년 전 교복을 그대로 입고 있다는 뜻이 되기 때문이다
- **얼굴은 완전히 매끈한 면으로.** 2부 성불이 **텍스처 스왑으로 얼굴을 되돌린다**. 코·눈두덩 볼륨을
  지오메트리로 만들면 스왑이 어색해진다 — 앞면이 하나의 연속면이고 UV 가 깨끗해야 한다
- **무서움은 평범함에서 온다**(§4 놋페라보와 같은 원칙). 괴물처럼 나오면 재생성. 피·상처·찢긴 옷 금지
- **A-포즈로 생성한다**(문서 공통 규칙). 그녀는 애니메이션이 없지만, 게임에서는 팔을 내리고 서 있어야
  하므로 리깅 후 **한 번만 포즈를 굳혀** 정적 GLB 로 낸다. 2부의 머리 빗기·고개 움직임에도 뼈가 쓰인다

### 7-B. 2부 얼굴 복원 텍스처 (모델 아님, 텍스처 1장)

```
A gentle eight-year-old girl's face painted flat and symmetrical, front view,
centered: calm dark eyes looking straight ahead, thin soft eyebrows, small nose,
closed lips with a faint quiet smile, plain pale skin tone,
flat even lighting, no shading, no perspective, no hair, square image.
```

- 얼굴 스왑용이라 **모델 UV 에 맞춰 다시 얹어야 한다** — 생성물은 채색 기준일 뿐, 최종은 Blender 에서
  얼굴 영역에 투영해 굽는다. 「빗질이 끝나는 순간 얼굴이 돌아온다」가 ACT 9 의 마지막 장면이다

---

## 8. 우물의 여자 (井戸の女) — 공동우물 보스 · **오키쿠(お菊) 도상** (2026-08-28 개정)

> 도상 레퍼런스를 **『반초 사라야시키(番町皿屋敷)』의 오키쿠**로 잡는다. 우물에 던져진 하녀의
> 망령 — 일본 괴담에서 **우물 유령의 원형**이고, 밤마다 접시를 아홉까지 세고 열 번째에서 비명을
> 지른다. 우리 캐릭터의 「물속에서 일어나 얼굴을 확인하고 실망한다」와 실루엣이 정확히 겹친다.
>
> ⚠️ **이 캐릭터는 자세가 곧 정체다.** 품에 보이지 않는 아이를 안고 있고, 2부 성불의 마지막 동작이
> **그 자세를 푸는 것**이다("처음으로 보이지 않는 아이를 안은 자세를 풀고 두 팔을 내린다").
> 안은 자세를 이미지에 넣으면 지오메트리로 굳어 그 장면이 통째로 불가능해진다.
> **A-포즈로 생성 → 리깅 → 안은 자세는 엔진에서 뼈로 만든다.**

```
Stylized 3D game character asset reference, front view, one character centered,
standing A-pose with both arms held clear of the torso, hands open and empty,
full figure from head to feet inside the frame, both bare feet flat on the ground.
Okiku, the woman's ghost from the Japanese ghost story "Bancho Sarayashiki" —
a maidservant of an Edo-period samurai household who was thrown down a well.
A slender adult woman with narrow shoulders, a long neck and an upright posture,
standing straight and facing forward.
Fully clothed in a plain unbleached white burial kimono of coarse undyed hemp
cloth, without pattern or ornament, with a narrow straight silhouette hanging
vertically from shoulder to hem, a simple flat cloth sash at the waist, narrow
sleeves ending at the wrists so the hands and forearms stay clear of the fabric,
and a hem ending at the ankles with pale bare feet visible below it.
The lower half of the kimono is stained a deep grey-green tone, far darker than
the upper half, with a hard horizontal line where the two tones meet, as if the
cloth below had soaked up well water and hung heavy. This tone difference is
painted flatly into the fabric itself, not a shadow and not a reflection.
A small white triangular cloth band tied flat across her forehead.
Very long straight black hair in thick heavy ropelike strands falling past the
waist, parted evenly at the centre so the entire face stays uncovered and
clearly visible.
A gaunt hollow-cheeked face with a still, sorrowful, resigned expression,
eyes open and looking straight ahead, lips slightly parted as if counting under
her breath.
Long thin arms and long slender fingers.
Muted desaturated colour palette, greyish complexion.
Stylized semi-realistic Japanese game concept art, non-photorealistic,
clean readable silhouette, one single character centered in the frame,
flat even studio lighting, no cast shadows, plain solid mid-gray background.
```

네거티브:
```
legless ghost, no legs, missing legs, lower body fading away, tapering wisp,
floating in the air, feet off the ground, hovering, transparent lower body,
plates, dishes, porcelain, holding a plate, stack of plates, broken shards,
well, well curb, wooden bucket, rope, willow tree,
multiple views, turnaround sheet, character sheet, side view, back view, three-quarter view,
two characters, multiple overlapping characters, text, watermark, background scenery,
water, water surface, ripples, splashes, standing in water, dripping water,
arms crossed, arms folded, cradling, holding a bundle, holding a baby, hands together,
hands on chest, clasped hands, hands raised, drooping wrists,
wide bell skirt, flared kimono, layered furisode, long trailing sleeves, wide obi bow,
elaborate pattern, embroidery, formal kimono,
hair covering the face, hair over the eyes, hidden face, cloth over the face,
fog, mist, glow, transparency, ghost effect, particles, motion blur, dramatic lighting, dark scene,
kabuki makeup, theatrical stage, ukiyo-e print, woodblock texture,
cropped body, cut off feet, blood, wounds, torn clothes, sharp teeth, claws,
child, young girl, chibi, doll, photorealistic, realistic skin texture
```

### 오키쿠 도상에서 특별히 막아야 하는 것

- **다리 없는 유령(足のない幽霊).** 마루야마 오쿄 이후 일본 유령의 표준 도상이라 「Japanese ghost」
  「yurei」를 쓰는 순간 **하반신이 안개로 사라진 그림**이 나온다. 3D 로는 재앙이다 — 리깅이 다리를
  못 찾고, 찾아도 발이 없어 접지가 성립하지 않는다. 포지티브에 「양발이 바닥에 붙어 있다」,
  네거티브에 `legless ghost, floating in the air, feet off the ground` 를 넣어 양쪽에서 잠갔다
- **접시.** 사라야시키를 언급하면 생성기가 접시를 손에 쥐여 주거나 발치에 쌓는다. Tripo 는 그걸
  **손과 융합해** 굽고, 그러면 성불 장면의 「빈 손을 내려다본다」가 불가능해진다.
  접시는 네거티브로 빼고, 필요하면 **별도 소품**으로 뽑아 손 본에 붙인다(아래 8-C)
- **우키요에 스타일.** 호쿠사이 「百物語 さらやしき」가 워낙 유명해서 `ukiyo-e`·목판화 질감이 섞여
  들어온다. 평면 판화 톤은 Tripo 가 알베도로 구워 버린다 → 네거티브
- **드리운 손목(幽霊手).** 유령 도상의 「손목을 늘어뜨린 손」은 A-포즈를 깨고 손가락이 뭉친다 →
  `drooping wrists` 네거티브 + 포지티브의 「손을 펴고 비운다」

### 이 캐릭터만의 판단

- **안은 자세는 절대 이미지에 넣지 않는다** (위 주의). 팔을 몸에서 떼고 **손바닥을 비운 채로**
  생성해야 ① 자동 리깅이 팔을 찾고 ② 성불에서 팔을 내릴 수 있다. 「비어 있는 두 손」이 이 캐릭터의
  진실(품에 아무것도 없다)이기도 하므로 A-포즈가 설정과도 어긋나지 않는다
- **「젖음」을 천이 아니라 색으로 말한다.** `wet`·`damp`·`clinging` 을 옷과 몸에 함께 쓰면 두 번 진다:
  성인 여성 캐릭터에서 안전 필터를 건드리고(§7 필터 회피 표와 같은 이유), Tripo 는 젖은 반사·음영을
  **지오메트리로 오해한다**. 그래서 「아래쪽이 더 어둡고 그 경계가 딱 떨어진다」는 **평평한 톤 차이**로만
  기술했다. 흰 카타비라라서 이 이중 톤이 남색 기모노보다 훨씬 세게 읽힌다 — 도상을 바꾼 이득 하나
- **기모노는 좁고 곧게, 소매는 손목에서 끝난다.** 후리소데·긴 소매는 팔과 몸통을 천으로 이어 붙여
  리깅이 한 덩어리로 읽는다. 하녀의 소박한 코소데 실루엣이 마침 이 조건과 맞는다
- **얼굴은 반드시 보여야 한다.** 그녀는 잡을 때마다 **얼굴을 확인하고** 「너는 아니야」라고 하고,
  2부에서는 **처음으로 평온한 표정**을 짓는다. 가운데 가르마 + `hair covering the face` 네거티브로 잠갔다
- **표정은 분노가 아니라 체념이다.** 오키쿠는 원한보다 **세다 만 사람**이다 — 입을 살짝 벌린
  「세는 중」의 얼굴이 우리 쪽 「우리 애 못 봤니?」와 정확히 같은 표정이다. 성난 원귀로 나오면 재생성
- **시니쇼조쿠의 좌임(左前)은 프롬프트에 넣지 않는다.** 죽은 자의 옷은 산 사람과 여밈이 반대인데,
  생성기가 거의 지키지 못하면서 깃 모양만 뭉갠다. 필요하면 **텍스처 단계에서 깃 방향만 뒤집는다**
- **잘린 손가락은 선택.** 원전에서 아오야마가 오키쿠의 손가락을 자른다. 넣으려면 피 없이
  `the middle finger of the left hand is shorter than the others` 한 줄로만 — `severed`·`cut off` 는
  네거티브의 상처 계열과 충돌해 통째로 거부될 수 있다. 12 m 아래 어둠에서 읽히지 않는 디테일이라
  **기본은 넣지 않는다**
- **키는 성인 표준으로 생성한다.** 현재 자리표시자는 머리끝 약 1.55 m 라 큰 재스케일은 없을 전망이지만,
  도착 후 석실(수면~천장 4 m)에서 실측할 것

### 파이프라인

1. 생성물은 `docs/references/yokai-wellwoman-front.png` 로 저장 (체크리스트 1번 항목 전부 확인 —
   특히 **발이 있는가 · 바닥에 닿았는가**)
2. 탐색 생성으로 형태 먼저 (~20크레딧)
   `npm run tripo:generate -- --image docs/references/yokai-wellwoman-front.png --name yokai-wellwoman-explore`
3. 형태 OK → detailed 확정 → **리깅 필요**(성불의 팔 내리기·접근 이동) → `tripo:rig -- --spec tripo`
4. ⚠️ **리깅 전에 정면을 +X 로 돌린다.** Tripo 프리셋 애니는 정면 +X 가정이라 +Z 모델을 그대로
   리깅하면 다리만 옆으로 달린다(사요에서 55크레딧을 버린 건). `scripts/dev/rotate-glb.ts` 로 굽고
   `scripts/dev/axis.ts` 로 `bind 발가락 방향 = +X` 확인
5. 로드 쪽: `wellWoman.ts` 의 `figure.rotation.y = atan2(dx, dz)` 는 **+Z 규약**이다 —
   모델을 +X 로 구웠으면 로드 시 `yawOffset = -Math.PI/2`(프로젝트 규약)를 함께 넣는다
6. 자리표시자 교체는 `figure` 그룹만 갈아 끼우면 된다 — `riseK` 로 y 를 올리고 내리는 코드,
   파문, 물소리는 모델과 무관하게 그대로 돈다

### 8-B. 2부 평온한 표정 (모델 아님, 얼굴 텍스처 1장)

```
A calm middle-aged woman's face painted flat and symmetrical, front view, centered:
quiet dark eyes looking gently downward, relaxed brows, closed lips with a faint
peaceful smile, plain pale complexion, flat even lighting, no shading,
no perspective, no hair, square image.
```

- 유리 7-B 와 같은 처리다. 「많이 기다렸니?」의 그 한 컷을 위해서만 쓰이므로 모델을 새로 뽑지 않는다.
  본체 얼굴 UV 가 깨끗해야 스왑이 자연스럽다 — 생성 결과에서 눈·코가 지오메트리로 깊게 파이면 재생성

### 8-C. 접시 (선택 소품, text-to-model)

```
A single old Japanese porcelain plate, isolated 3D game prop. One shallow round
white-glazed dish about one unit across, thin rim, simple faded blue underglaze
border, fine crazing and chips on the edge, dull aged surface. One plate only.
No stack, no pile, no shards, no food, no table, no cloth, no text, no floor,
no background. Low-poly stylized realism, PBR.
```

- 오키쿠 도상을 인게임에서 쓰고 싶을 때만. **본체와 분리해서 뽑고 손 본에 붙인다** —
  이미지에 함께 넣으면 손과 융합되어 성불의 「빈 손」이 사라진다
- ⚠️ 스토리 정합: 우리 우물의 단서 3종은 **환자복·손톱자국·목마**(아이 하루)다. 접시를 월드에
  실물로 놓으면 사라야시키가 **또 하나의 사연**으로 읽혀 하루의 단서와 경쟁한다.
  접시는 도상(실루엣) 참조로만 쓰고 월드에는 놓지 않는 편을 권한다

---

## 생성 → Tripo 투입 체크리스트

1. 생성 결과 확인: □ **한 명만** 나왔나(측·후면 컷이 섞이지 않았나) □ 정확히 정면인가(3/4 각도 아님)
   □ 발끝까지 나왔나 □ 팔이 몸통에서 떨어져 있나 □ 배경이 무지인가 □ 하반신 실루엣이 읽히나(추격자류)
2. `docs/references/yokai-<이름>-front.png` 로 저장 (**`-sheet` 는 옛 규칙**. 남아 있는 시트 파일들은
   3뷰 시절의 것이라 새로 쓰지 않는다)
3. 탐색 생성(텍스처 없음, ~20크레딧)으로 형태 먼저 확인:
   `npm run tripo:generate -- --image docs/references/yokai-hasshaku-front.png --name yokai-hasshaku-explore`
4. 형태 OK → detailed 확정(40) → 추격자류만 `tripo:rig -- --spec tripo`(25) → Mixamo 클립 리타겟
5. 팔척귀신은 리타겟 후 **엔진에서 2.4 m 스케일** (모델 자체는 표준 신장으로 생성·리깅하는 게 안전)
6. 로쿠로쿠비는 범용 자동 리깅을 쓰지 않고 `rig-rokurokubi.py`의 **절차 리깅**을 쓴다. 목 32본과
   머리카락 2본을 분리해야 플레이어 눈앞에서 목살과 머리카락이 한 덩어리로 늘어나지 않는다
