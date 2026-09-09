# Mascot assets

Drop the 4 exported expression frames here with these exact filenames:

- `idle.png`
- `thinking.png`
- `speaking.png`
- `happy.png`

`components/mascot/Mascot.tsx` requests `/mascot/{state}.png` and falls back
to a built-in illustrated SVG face automatically if a file is missing, so
the app works before these are added — but the real illustrations should
replace the fallback for the actual "Jarvis" feel the founder described.
