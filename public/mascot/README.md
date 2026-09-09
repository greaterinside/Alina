# Mascot assets

- `idle.png` — **real**, keyed from the founder's green-screen render
  (`Replace_the_background_with_a_1.mp4`, background removed and cropped
  via `chromakey.py` used during setup).

Still needed, same filenames:

- `thinking.png`
- `speaking.png`
- `happy.png`

`components/mascot/Mascot.tsx` requests `/mascot/{state}.png` and falls
back to a built-in illustrated SVG face for any state whose file is
missing, so the app works today — but the real illustrations should
replace the fallback for the actual "Jarvis" feel the founder described.

Note for whoever adds the remaining three: send them as actual file
attachments/uploads, not pasted inline into chat — pasted images aren't
saved anywhere Claude can read them from disk, so they can't be written
into this folder directly from a paste.
