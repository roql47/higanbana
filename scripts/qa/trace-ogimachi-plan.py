"""Extract colored footprint centres from the official 2560 x 1811 location map.
Input is an analysis-only local image; the original map is not bundled in the game.
Usage: python trace-ogimachi-plan.py /tmp/ogimachi-official-plan.jpg
Requires Pillow and numpy. Pixel boxes are cartographic envelopes, not surveyed walls.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

source = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
assert source.shape[:2] == (1811, 2560)
footprints = []
for color, mask, minimum in [
    ('red', (source[:, :, 0]-source[:, :, 1] > 35) & (source[:, :, 0]-source[:, :, 2] > 18), 45),
    ('blue', (source[:, :, 2]-source[:, :, 0] > 35) & (source[:, :, 1]-source[:, :, 0] > 12), 20),
]:
    ys, xs = np.where(mask)
    remaining = set(zip(xs.tolist(), ys.tolist()))
    components = []
    while remaining:
        queue = [remaining.pop()]
        pixels = []
        while queue:
            x, y = queue.pop()
            pixels.append((x, y))
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
                p = (x+dx, y+dy)
                if p in remaining:
                    remaining.remove(p)
                    queue.append(p)
        if len(pixels) >= minimum:
            a = np.asarray(pixels)
            center, size = a.mean(axis=0), a.max(axis=0)-a.min(axis=0)+1
            components.append({'color': color, 'u': round(float(center[0]), 2), 'v': round(float(center[1]), 2),
                               'du': int(size[0]), 'dv': int(size[1]), 'pixels': len(pixels)})
    footprints.extend(sorted(components, key=lambda p: (p['u'], p['v'])))
out = Path(__file__).resolve().parents[2] / 'src/world/ogimachi/referenceTrace.ts'
out.write_text('/** Derived coloured footprint centres from the official Ogimachi location map.\n'
               ' * Source: World Heritage Center, 2024/05, 建造物位置含む, 2560×1811.\n'
               ' * Regenerate with scripts/qa/trace-ogimachi-plan.py; do not scatter or grid these centres. */\n'
               'export const REFERENCE_FOOTPRINTS = '+json.dumps(footprints, indent=2)+' as const;\n')
print(json.dumps({'red': sum(p['color']=='red' for p in footprints), 'blue': sum(p['color']=='blue' for p in footprints), 'output': str(out)}))
