# Street prop distance visibility

Six authored prop types use distance culling. Re-entry distances: pots 65m, bins/hydrant 85m, benches 100m, noticeboards 120m, lamps 220m. Visible objects remain until 15m beyond these distances to avoid boundary toggling. Only visual roots are changed; collision proxies remain. Visibility changes request a shadow-map update in preview, walking and story rendering. Models remain loaded in memory.

Automated tests cover re-entry, the dead band, transformed parents, untouched collision markers, and greater visibility range for tall lamps. Browser review starts at the distant aerial view, then switches to pot, bench, noticeboard and lamp close-ups. All six categories are visible in those close-up scenes, including bins beside the bench and the hydrant beside the noticeboard. No failure to reappear was observed. This does not measure FPS or validate continuous boundary crossing in walking mode; the boundary behavior was tested programmatically.
