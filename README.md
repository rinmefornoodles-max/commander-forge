# The Commander Forge — Automatic Mana & Coach Update

This GitHub Pages build is ready to upload over the current website files.

## Added
- Lands and mana rocks expose their actual mana-production choices automatically.
- Dual lands display choices such as `U / B`; the floating pool stores the color actually chosen.
- Multi-mana sources such as `Add {G}{U}` add both mana together.
- Basic lands work even when their Oracle text omits the standard mana ability.
- Auto-pay mode is now the default and can tap suggested sources when a spell is dragged to the battlefield or stack.
- The selected-card panel provides a quick-action button for every available mana choice.
- Player panels show untapped mana-source choices separately from floating mana.
- The coach evaluates untapped lands and rocks instead of only looking at manually entered floating mana.
- Early land drops receive a strong tempo priority.
- From Untap, Upkeep, or Draw, the coach can recommend advancing to Main 1 and then playing a land.

## Upload
Keep your existing `.github/workflows` deployment file. Replace the root website files with the contents of the ZIP and commit to `main`.
