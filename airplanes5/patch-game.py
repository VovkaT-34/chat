from pathlib import Path

p = Path('/tmp/airplanes/scene/game.go')
s = p.read_text()
old = "\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {\n\t\tgameData.Paused = !gameData.Paused\n\t}\n"
new = old + """
\tjustPressed := inpututil.AppendJustPressedTouchIDs(nil)
\tfor _, id := range justPressed {
\t\tx, y := ebiten.TouchPosition(id)
\t\t// The pause button is the full-width strip at the very bottom.
\t\t// Use the lower 10% of the 480x800 game area so the sensor is
\t\t// aligned with the visible button rather than the middle of the screen.
\t\tif x >= 0 && x < 480 && y >= 720 && y < 800 {
\t\t\tgameData.Paused = !gameData.Paused
\t\t\tbreak
\t\t}
\t}
"""
if old not in s:
    raise SystemExit('pause insertion point not found')
p.write_text(s.replace(old, new, 1))
