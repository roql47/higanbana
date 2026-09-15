# Walk relocation follow-up

Preview relocation now updates the player facing and camera pivot together. The onsen shortcut aims at the actual mapped doorway; village reset aims north from the starting position. Button, R-key and out-of-bounds recovery share the same reset path. Input, queued jump, accumulated simulation time and residual movement feedback are cleared. The well mode retains its own reset logic.

Validation: eight relocation/camera/onsen tests, typecheck and Ogimachi build passed. Browser inspection of the onsen shortcut confirmed Mio facing the door immediately. The subsequent R-key browser inspection timed out, so manual verification of that action remains open. No new models or Steam package were produced in this change.
