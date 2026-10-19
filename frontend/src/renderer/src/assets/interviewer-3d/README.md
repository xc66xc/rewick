# Current character: user-provided Meshy GLB

Desktop 1.7.0 uses `meshy-interviewer.glb`, copied unchanged from `Meshy_AI_一个友善专业的_All_Animations.glb` supplied by the user on 2026-10-18. Bundled locally; no runtime dependency on Downloads.

- SHA256: `f52c28f7ff424b9faf1ad23e26f110b76a2e74a86d9a94eee804c891dbbbee01`
- Size: 9,805,028 bytes; one mesh/skin; 85,184 triangles.
- Contains Running and Walking clips. Neither is played: no AnimationMixer is created. Skinned meshes are explicitly restored to their bind pose before framing.
- Local outer-group motion only: 4.8-second breathing cycle (vertical scale ±0.2%, displacement ±0.1% of height), 9-second yaw ±0.018 radians and 7-second roll ±0.004 radians. This moves the whole figure, not independent head/facial animation.
- Updates at approximately 24 FPS during active interview states; hidden, reduced-motion, ready, paused, completed and error states reset and stop the loop. Unmount cancels scheduling and releases resources.
- No facial morph targets. No lip sync or blinking claimed. Original hand/pocket pose and texture imperfections are retained.
- Created in Meshy's Free workspace under CC BY 4.0 (attribution: Meshy, https://www.meshy.ai/). Preserve the user's source/license records for distribution.
- Local Three.js RoomEnvironment lighting; no remote model, texture or HDRI requests.

The previous VRM sample and generated office background remain in source for reference but are not imported or emitted by the current renderer build. Their original attribution follows.

---

# 3D validation character

VRM1_Constraint_Twist_Sample v1.0.1, (c) 2022 pixiv Inc.
Source: https://github.com/vrm-c/vrm-specification/tree/master/samples/VRM1_Constraint_Twist_Sample
License: VRM Public License 1.0, https://vrm.dev/licenses/1.0/

The embedded VRM metadata permits everyone to use the avatar, corporate commercial use,
redistribution, modification and redistribution of modifications. Credit is not required.
Antisocial or hate usage is prohibited. Preserve the embedded license metadata.
This is a licensed sample for validating the local renderer, not a custom Rewick character.

SHA256: 12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2
The office.png background was generated for this application.
