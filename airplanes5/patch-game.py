from pathlib import Path

p = Path('/tmp/airplanes/scene/game.go')
s = p.read_text()
old = "\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {\n\t\tgameData.Paused = !gameData.Paused\n\t}\n"
new = old + """
\tjustPressed := inpututil.AppendJustPressedTouchIDs(nil)
\tfor _, id := range justPressed {
\t\tx, y := ebiten.TouchPosition(id)
\t\t// The pause button is the full-width strip at the bottom of the 480x800 game.
\t\tif x >= 0 && x < 480 && y >= 700 && y < 800 {
\t\t\tgameData.Paused = !gameData.Paused
\t\t\tbreak
\t\t}
\t}
"""
p.write_text(s.replace(old, new, 1))
