# Sheltered village noticeboards

Created through Blender MCP on 2026-09-11 using `scripts/blender/build-ogimachi-noticeboard.py`. Source: `assets/authored/ogimachi/noticeboard.blend`; runtime: `public/models/ogimachi/noticeboard.glb` (664,768 bytes, 1,404 triangles, two material groups, two embedded wood images).

Two procedural signboards are replaced on successful load. Cedar posts, post shoes, framed backing, lower ledge and pitched roof cap provide depth. Lower vertices conform to ground support; widths follow existing noticeboard markers. Existing collision proxies remain. Wood materials and a 512×320 Japanese notice texture are shared; geometry is per placement for ground fitting. The notice is authored game dressing, not transcription of an original Ogimachi sign. No Tripo generation was needed.

Typecheck, preview build and three existing streetscape/support checks pass. Browser close-up of the first board confirms visible wood, readable heading and posts reaching the earth surface. Review route: `ogimachi.html?view=detail&prop=noticeboard`. Applied to detailed/walking/story world, not simplified massing preview. No Steam package rebuilt.
