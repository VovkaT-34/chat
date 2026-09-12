from pathlib import Path

p = Path('/tmp/airplanes/scene/game.go')
s = p.read_text()
old = "\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {\n\t\tgameData.Paused = !gameData.Paused\n\t}\n"
new = old + """
\tjustPressed := inpututil.AppendJustPressedTouchIDs(nil)
\tfor _, id := range justPressed {
\t\tx, y := ebiten.TouchPosition(id)
\t\tif x >= 0 && x < 480 && y >= 720 && y < 800 {
\t\t\tgameData.Paused = !gameData.Paused
\t\t\tbreak
\t\t}
\t}
"""
if old not in s:
    raise SystemExit('pause insertion point not found')
p.write_text(s.replace(old, new, 1))
