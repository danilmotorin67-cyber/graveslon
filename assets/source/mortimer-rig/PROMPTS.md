# Mortimer rig — imagegen source preparation

26.10.2026. Reference: `assets/source/mortimer_idle.png`.
Generated using the imagegen image editor with `transparent_background: true`.
The first outputs are retained in `drafts/`; cleanup outputs are `core.png`
and `limbs.png`. All four PNGs are registered in `assets/sources.json`.
Runtime atlases are byte-for-byte copies. Parts are clipped and articulated
in SVG; no generated source pixels are repainted by the build tools.

## Initial core atlas

Prepare a production 2D skeletal animation texture atlas from the referenced Mortimer character. This is an IMAGE EDIT of that exact character: preserve his mature gothic painterly highly detailed style, skull face identity, green eyes, battered top hat with burgundy scarf, ragged black/brown Victorian coat with purple lining, antique gold buttons, long dark trousers and buckled boots. Cool blue light from viewer left, subtle green/gold from right. No redesign, no cartoon simplification.
Create ONE wide transparent PNG atlas, 1536x1024, with a STRICT 3-column by 2-row evenly sized grid of INVISIBLE cells, six completely separate cutout parts. Each part entirely inside its cell with at least 24px clear transparent margins, no overlap across cells. NO text, labels, cell borders, ground, background, shadows outside the parts, extra items, or whole assembled person. Paint previously hidden areas cleanly for animation joints.
Cell layout reading order:
TOP LEFT: complete head WITH top hat, hat brim, scarf around hat and neck stump, no torso or shoulders. Exact original face looking slightly toward viewer right. Full uncut hat.
TOP MIDDLE: complete torso from extended neck bones and raised coat collar to belt/hips, including vest, purple cravat, buttons and coat lapels. NO head, NO arms, NO hands, NO long coat tails. Include hidden painted shoulder connection areas and neck.
TOP RIGHT: pelvis and BOTH long trouser legs and BOTH boots as a single stationary lower-body layer, no long coat panels, no arms, no objects. Preserve the original adult long-legged proportions; two anatomically separate legs, two boots, stable wide stance, soles on a common horizontal ground plane. Pants begin at waist, paint the normally hidden upper thighs.
BOTTOM LEFT: viewer-left long ragged coat tail as a separate cloth layer, burgundy inner lining and dark outer edge, hangs vertically from hip attachment to near ankle. Only cloth, no body parts.
BOTTOM MIDDLE: viewer-right long ragged coat tail, corresponding side, fully separate cloth layer, near ankle length. Only cloth.
BOTTOM RIGHT: entire original rusty grave-digger shovel, wooden shaft and rusty metal spade, no hand. Straight upright vertical local axis, handle top, pointed spade bottom, completely uncut. Keep it thin and long.
Every cutout must have real alpha transparency and generous empty space around it. Keep professional game illustration detail and consistent material lighting across all six parts.

## Initial arms atlas

Prepare a production 2D skeletal animation ARMS AND LANTERN texture atlas from the referenced exact Mortimer. Preserve his detailed painterly adult gothic style, skeletal ivory hands, ragged dark Victorian sleeves with purple lining, blue edge light from left and subtle green/gold from right. This is image editing of the reference, not a new character.
ONE wide transparent PNG atlas 1536x1024, STRICT 4-column by 2-row INVISIBLE uniform cells, eight completely separate isolated parts. NO text, labels, visible grid, ground, background, whole person, extra limbs, or overlap between cells. Each part must stay completely inside its cell with 24px transparent margins. All limb pieces in straight neutral LOCAL orientation: joint at TOP, limb points DOWN. Paint hidden round overlapping joint regions so no holes appear when articulating.
TOP ROW left to right:
1 viewer-left UPPER ARM sleeve from shoulder attachment to elbow only, ragged dark cloth with purple cuff lining; NO forearm/hand/prop.
2 viewer-left FOREARM sleeve from elbow to wrist only, with exposed wrist bones, NO hand, no shovel. Both ends extended for overlap.
3 viewer-left skeletal HAND for holding an upright thin shovel handle: curled fingers and thumb, empty grip, NO shaft, wrist attachment at top and fingers pointing down. Exactly one hand.
4 alternate viewer-left skeletal HAND touching/pinching the brim of a hat, wrist at top, curved index finger and thumb, no hat and no sleeve. Same size and lighting as hand 3.
BOTTOM ROW left to right:
1 viewer-right UPPER ARM sleeve, shoulder to elbow only, no forearm/hand, consistent torn cloth.
2 viewer-right FOREARM sleeve elbow to wrist only, with wrist bones, NO hand, NO lantern, extended joint overlaps.
3 viewer-right skeletal HAND grasping the top ring of a lantern, wrist at top, curled fingers below, no actual ring or lantern. Exactly one hand.
4 the complete ornate original green lantern, including its carrying ring at top, rusty brass cage, pointed finials and dark glass chamber. NO hand or arm. Keep the glass chamber dark and EMPTY with a subtle green tint, because its green fire will be animated separately at runtime. Full uncut ring and bottom. Same recognizable lantern design as the reference.
Real alpha transparency everywhere outside the eight cutouts. High detail, correct bony finger anatomy, original material style and coherent lighting.

## Core cleanup

Clean up this existing six-part Mortimer rig atlas for production. Preserve the EXACT six illustrations, proportions, positions, scale, palette, 1536x1024 canvas and 3x2 arrangement. Remove ALL diffuse blue/green/brown ambient background haze between and around the parts. Outside the actual hard silhouette of each cutout, alpha must be completely transparent, including every gutter and cell border. Keep blue and green rim light only painted ON the actual costume edges, not floating outside them. No backdrop, no ground, no extra parts, no text. Do not recompose or redesign the character. Keep both legs and both boots together as already drawn. This is only alpha-edge/background cleanup of the supplied atlas.

## Arms cleanup

Edit this eight-part Mortimer arms atlas while preserving its 1536x1024 canvas, exact 4x2 grid, original illustration style and the positions/scales of every part. Two production fixes only: (1) In the BOTTOM ROW THIRD CELL remove the entire metal ring and its dangling brass ornament from beneath the skeletal hand. Preserve and reconstruct the bony fingers so this is an isolated empty gripping hand, including complete wrist, palm, curled fingers and thumb. Do not erase fingers. No prop of any kind in this hand. Leave the full lantern in bottom-right cell intact with its own ring. (2) Remove ALL diffuse colored haze/background outside the hard physical outlines of ALL eight parts. Each cell's empty margins and all gutters must be fully transparent alpha. Keep the painted rim light on material edges, no ambient clouds. Each cutout must be fully contained in its own cell without touching the neighboring part, with about 15px fully transparent padding at cell borders. NO text, labels, border lines, new parts, extra hands, background, ground or whole character. Keep the dark glass inside the lantern empty; no fire.
