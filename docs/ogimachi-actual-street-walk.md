# Actual terrain street traversal

`tests/actualVillageWalk.test.mjs` loads the real survey JSON, default story scope selection and DEM float grid. It reuses SurveyWorld height/ground methods with the production pad and rice-field setup, the legacy earth mesh builder, streetscape collision markers, mapped building collision boxes, Rapier and CharacterController.

The main-street route from (-62.214, -46.22) to (-75, -95), approximately 50m, passes in both directions without jump input. Every simulation step checks for a ground hit and rejects sinking beyond tolerance. This extends the earlier synthetic-slope tests to actual local terrain and obstacles.

No runtime fix was needed for this route. This is automated simulation, not a manual browser walking or FPS test. It covers the selected center-street segment inside the earth patch, not every village street, doorway, custom mesh collision or boundary.
