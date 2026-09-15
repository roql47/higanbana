# Parallel street prop loading

ACT1 frontage now requests the six authored prop types and street materials concurrently instead of awaiting each prop in sequence. Placement still waits for the batch and retains deterministic order. A missing/failed prop returns null so only that type uses the existing procedural fallback. Required street material failures still propagate.

Tests verify all loaders start before the slow first loader completes, result order is stable, and both rejected requests and synchronous failures preserve successful models. Typecheck, preview build and five targeted checks pass. No measured loading-time percentage, FPS increase or RAM reduction is claimed. Concurrent decoding may temporarily overlap allocations; this change removes serial request waiting and does not change model sizes or steady-state memory. No asset generation or Steam package rebuild.
