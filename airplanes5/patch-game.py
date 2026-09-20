from pathlib import Path
import re

p = Path('/tmp/airplanes/scene/game.go')
s = p.read_text()

if '"syscall/js"' not in s:
    s = s.replace('import (\n\t"time"', 'import (\n\t"time"\n\t"syscall/js"', 1)

pattern = re.compile(
    r'func \(g \*Game\) Update\(\) \{\n'
    r'\tgameData := component\.MustFindGame\(g\.world\)\n'
    r'.*?'
    r'\tif gameData\.Paused \{\n\t\treturn\n\t\}\n',
    re.DOTALL,
)

replacement = '''func (g *Game) Update() {
\tgameData := component.MustFindGame(g.world)
\tif inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
\t\tgameData.Paused = !gameData.Paused
\t\tjs.Global().Call("__airplanes5SetPaused", gameData.Paused)
\t}
\tpauseRequest := js.Global().Get("__airplanes5PauseRequest")
\tif !pauseRequest.IsUndefined() && !pauseRequest.IsNull() {
\t\tgameData.Paused = pauseRequest.Bool()
\t\tjs.Global().Set("__airplanes5PauseRequest", js.Null())
\t\tjs.Global().Call("__airplanes5SetPaused", gameData.Paused)
\t}
\tif gameData.Paused {
\t\treturn
\t}
'''

s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('Update pause block not found')

p.write_text(s)

# Mobile player selection: touch coordinates choose the airplane actually tapped.
# The original game has two players and four airplane choices.
p = Path('/tmp/airplanes/system/playerselect.go')
s = p.read_text()

start = s.index("\tvar isTouch bool")
end = s.index("\n\t\tif inpututil.IsKeyJustPressed(settings.Inputs.Left)", start)

new_touch = (
    "\ttouchIDs := inpututil.AppendJustPressedTouchIDs(nil)\n"
    "\n"
    "\tfor _, touchID := range touchIDs {\n"
    "\t\tx, y := ebiten.TouchPosition(touchID)\n"
    "\t\ttargetIndex := -1\n"
    "\t\tbestDistance := 32.0 * 32.0\n"
    "\n"
    "\t\tfor i, entry := range playerSelects {\n"
    "\t\t\tpos := transform.WorldPosition(entry)\n"
    "\t\t\tdx := float64(x) - pos.X\n"
    "\t\t\tdy := float64(y) - pos.Y\n"
    "\t\t\tdistance := dx*dx + dy*dy\n"
    "\t\t\tif distance <= bestDistance {\n"
    "\t\t\t\tbestDistance = distance\n"
    "\t\t\t\ttargetIndex = i\n"
    "\t\t\t}\n"
    "\t\t}\n"
    "\n"
    "\t\tif targetIndex < 0 {\n"
    "\t\t\tcontinue\n"
    "\t\t}\n"
    "\n"
    "\t\tentry := playerSelects[targetIndex]\n"
    "\t\tplayerSelect := component.PlayerSelect.Get(entry)\n"
    "\t\tif playerSelect.Selected {\n"
    "\t\t\tif !playerSelect.Ready {\n"
    "\t\t\t\tplayerSelect.LockIn()\n"
    "\t\t\t}\n"
    "\t\t\tcontinue\n"
    "\t\t}\n"
    "\n"
    "\t\tplayerNumber := 0\n"
    "\t\tif _, ok := selected[1]; !ok {\n"
    "\t\t\tplayerNumber = 1\n"
    "\t\t} else if _, ok := selected[2]; !ok {\n"
    "\t\t\tplayerNumber = 2\n"
    "\t\t}\n"
    "\t\tif playerNumber != 0 {\n"
    "\t\t\tplayerSelect.Select(playerNumber)\n"
    "\t\t\tselected[playerNumber] = entry\n"
    "\t\t}\n"
    "\t}\n"
    "\n"
    "\tfor number, settings := range archetype.Players {\n"
    "\t\tif inpututil.IsKeyJustPressed(settings.Inputs.Shoot) {\n"
    "\t\t\tif entry, ok := selected[number]; ok {\n"
    "\t\t\t\tcomponent.PlayerSelect.Get(entry).LockIn()\n"
    "\t\t\t} else {\n"
    "\t\t\t\tfor _, entry := range playerSelects {\n"
    "\t\t\t\t\tplayerSelect := component.PlayerSelect.Get(entry)\n"
    "\t\t\t\t\tif !playerSelect.Selected {\n"
    "\t\t\t\t\t\tplayerSelect.Select(number)\n"
    "\t\t\t\t\t\tbreak\n"
    "\t\t\t\t\t}\n"
    "\t\t\t\t}\n"
    "\t\t\t}\n"
    "\t\t}\n"
    "\t}\n"
)
s = s[:start] + new_touch + s[end:]
p.write_text(s)
