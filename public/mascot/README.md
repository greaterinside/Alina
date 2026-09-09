# Mascot assets

- `idle.png` — **real**, keyed from the founder's green-screen render
  (`Replace_the_background_with_a_1.mp4`, background removed and cropped
  via `chromakey.py` used during setup).

Still needed, same filenames:

- `thinking.png`
- `speaking.png`
- `happy.png`

`components/mascot/Mascot.tsx` renders `/mascot/{state}.png` for a state
whose file exists (tracked in that file's `AVAILABLE` manifest — a static
map, not a runtime file check, so there's no async loading flash), falls
back to the real `idle.png` for a state that isn't ready yet, and only
draws the built-in illustrated SVG face if no real art exists at all.

**When you add `thinking.png`, `speaking.png`, or `happy.png` here, also
flip that entry to `true` in `AVAILABLE` in `components/mascot/Mascot.tsx`**
— otherwise the new file sits unused and Mascot keeps showing `idle.png`
for that state.

Note for whoever adds the remaining three: send them as actual file
attachments/uploads, not pasted inline into chat — pasted images aren't
saved anywhere Claude can read them from disk, so they can't be written
into this folder directly from a paste.
