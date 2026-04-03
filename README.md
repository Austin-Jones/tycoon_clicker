# Bureaucracy Tycoon

Playable Phaser 3 idle game with a portrait-first Android-style UI, built around one main scene and a small game-state module.

## File structure

- `src/main.js` sets up the Phaser game config and boots the main scene.
- `src/scenes/MainScene.js` contains the mobile layout, scrolling dashboard, touch interactions, card components, and scene loop.
- `src/game/GameState.js` owns simulation state, upgrade purchases, progression, and save/load behavior.
- `src/game/constants.js` holds economy constants, upgrade definitions, and flavor messages.
- `src/ui/theme.js` defines the palette, typography fallbacks, spacing, and shared visual tokens.
- `src/ui/icons.js` draws the small office-themed icons with Phaser graphics.
- `src/ui/format.js` holds number and save-status formatting helpers.

## Economy tuning

The fastest place to tune the game is `src/game/constants.js`.

- `ECONOMY` contains the main balancing constants like starting rates, queue size, save interval, and the approval-layer bonus.
- `UPGRADE_DEFINITIONS` contains each upgrade's base cost and exponential cost scaling.

The derived formulas live in `src/game/GameState.js` inside `getStats()`:

- queue capacity = base capacity + inbox upgrades
- arrival rate = base arrival + marketing upgrades, then multiplied by approval layers
- auto-process rate = clerk upgrades, then multiplied by approval layers
- money per form = base payout + better ink upgrades
- money multiplier = compliance upgrades, then multiplied by approval layers

If you want the early game faster, lower the base costs for `betterInk`, `juniorClerk`, or `marketingCampaign`.
If you want the mid-game to snowball harder, increase `approvalLayerBonus` or reduce the `approvalLayer` cost scale slightly.

## Theme and layout iteration

The main visual knobs live in `src/ui/theme.js`.

- `THEME.colors` controls the navy background, cream paper cards, stamp-red accents, brass highlights, and secondary blue-gray tones.
- `THEME.spacing` controls mobile card padding, edge margins, gaps, and rounded-corner radius.
- `MainScene.layout()` in `src/scenes/MainScene.js` is the main portrait layout pass. That is where card widths, section order, and mobile spacing are positioned.
