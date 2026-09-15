# Authored street lamps

Created through Blender MCP with `scripts/blender/build-ogimachi-lamp.py`. Source: `assets/authored/ogimachi/street-lamp.blend`; runtime: `public/models/ogimachi/street-lamp.glb` (423,520 bytes, 988 triangles, three material groups, two embedded concrete textures capped at 512px).

Two existing lamp poles now use tapered concrete shafts, mounting collars and fasteners, diagonal arm supports, bell shades, frosted lenses, cable covers and service covers. This is authored game dressing, not a measured replica. Shared geometry and materials; no additional realtime lights or shadow passes. Existing pole collision proxies remain. Procedural geometry is retained as failed-load fallback. Pole bases are embedded 2cm at the established support height.

Typecheck, preview build and three existing streetscape/support checks passed. Browser close-up of the first lamp confirms the shade, brace and collars render correctly. This view checks the upper fixture, not ground contact of both poles. Review route: `ogimachi.html?view=detail&prop=lamp`. Applies to detailed/walking/story world. No Tripo generation or Steam package rebuild.
