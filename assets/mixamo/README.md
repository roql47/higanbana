# Mixamo 애니메이션 파이프라인 (검증 완료 2026-08-18)

우리 캐릭터를 Mixamo 에 **업로드하지 않아도** 됩니다. 기본 캐릭터로 모션만 받으면
`scripts/mixamo/retarget.py` 가 우리 리그(mixamorig 본 이름)로 리타게팅합니다.
(실제 Mixamo FBX 로 검증: 547프레임 삼바 → 자세·비율 정상)

## 1. 다운로드 설정
| 항목 | 값 |
|---|---|
| Format | FBX Binary(.fbx) |
| Skin | **Without Skin** |
| Frames per Second | 30 |
| Keyframe Reduction | none |
| In Place | 있으면 체크 |

## 2. 받을 목록 (파일명 그대로 두면 자동 매핑)
| 클립 | 검색어 | 매핑 키워드 |
|---|---|---|
| idle | `Sword And Shield Idle` | idle |
| walk | `Sword And Shield Walk` | walk |
| run | `Sword And Shield Run` | run |
| jump | `Jump` | jump |
| fall | `Falling Idle` | falling |
| slash1 | `Standing Melee Attack Horizontal` | horizontal |
| slash2 | `Standing Melee Attack Backhand` | backhand |
| slash3 | `Standing Melee Attack Downward` / `Great Sword Slash` | downward |

## 3. 변환 (파일을 `assets/mixamo/in/` 에 넣은 뒤)
```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/mixamo/retarget.py -- assets/mixamo/in assets/mixamo/out/character_mixamo.glb
node scripts/optimize-glb.ts --in assets/mixamo/out/character_mixamo.glb --out public/models/character.glb
```
그 다음 `src/character/config.ts` 의 클립 이름과 `items.ts` 공격 설정을 새 클립에 맞추면 끝.
