# Mascot assets

All four states are real now:

- `idle.png` — keyed from the founder's green-screen render
  (`Replace_the_background_with_a_1.mp4`, background removed via
  `chromakey.py`).
- `thinking.png`, `speaking.png`, `happy.png` — from the three
  Nero-background-removed PDFs sent later. Two already had a real alpha
  channel (extracted with `pdfimages -all` + `PIL.Image.merge`); the
  thinking pose was on a flat white background and needed a proper key
  (`whitekey.py` — flood-fills from the corners so only the connected
  background is cut, then also sweeps small fully-enclosed near-white
  blobs like the gap between her hands and chin, while leaving tiny ones
  like eye-catchlights alone). All four cropped to a matching square
  framing (`trim_square.py`) and downsized + `pngquant`'d for web weight.

`components/mascot/Mascot.tsx` renders `/mascot/{state}.png` for a state
whose file exists (tracked in that file's `AVAILABLE` manifest — a static
map, not a runtime file check, so there's no async loading flash). If a
future state's file is ever removed, it falls back to `idle.png` rather
than breaking, and only draws the built-in SVG face if no real art exists
at all.

**If you replace one of these with fresh art, keep the crop/negative-space
proportions consistent with the others** — Mascot renders them all in the
same square box via `object-contain`, so a differently-framed file will
look smaller or off-center next to the rest.
