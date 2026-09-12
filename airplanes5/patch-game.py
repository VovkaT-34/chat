from pathlib import Path

p = Path('/tmp/airplanes/scene/game.go')
s = p.read_text()
s = s.replace('import (\n\t"time"', 'import (\n\t"time"\n\t"syscall/js"', 1)
old = "\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {\n\t\tgameData.Paused = !gameData.Paused\n\t}\n\tif gameData.Paused {\n\t\treturn\n\t}\n"
new = """\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
\t\tgameData.Paused = !gameData.Paused
\t}
\tif js.Global().Get("__airplanes5PauseRequest").Truthy() {
\t\tgameData.Paused = !gameData.Paused
\t\tjs.Global().Set("__airplanes5PauseRequest", false)
\t}
\tjs.Global().Call("__airplanes5SetPaused", gameData.Paused)
\tif gameData.Paused {
\t\treturn
\t}
"""
if old not in s:
    raise SystemExit('pause handler insertion point not found')
p.write_text(s.replace(old, new, 1))
