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
end = s.index("\n\tfor number, settings := range archetype.Players", start)

new_touch = """\tlocalPlayer := js.Global().Call("__airplanes5LocalPlayer").Int()
\tif localPlayer < 1 || localPlayer > 2 {
\t\tlocalPlayer = 1
\t}
\tremotePlayer := 3 - localPlayer
\tremoteIndex := js.Global().Call("__airplanes5RemoteSelection").Int()
\tremoteReady := js.Global().Call("__airplanes5RemoteReady").Bool()

\tif remoteIndex >= 0 && remoteIndex < len(playerSelects) {
\t\tfor index, entry := range playerSelects {
\t\t\tps := component.PlayerSelect.Get(entry)
\t\t\tif ps.Selected && ps.PlayerNumber == remotePlayer && index != remoteIndex && !ps.Ready {
\t\t\t\tps.Unselect()
\t\t\t}
\t\t}
\t\ttarget := playerSelects[remoteIndex]
\t\ttargetPS := component.PlayerSelect.Get(target)
\t\tif !targetPS.Selected {
\t\t\ttargetPS.Select(remotePlayer)
\t\t}
\t\tif targetPS.Selected && targetPS.PlayerNumber == remotePlayer && remoteReady && !targetPS.Ready {
\t\t\ttargetPS.LockIn()
\t\t}
\t}

\ttouchIDs := inpututil.AppendJustPressedTouchIDs(nil)
\tfor _, touchID := range touchIDs {
\t\tx, y := ebiten.TouchPosition(touchID)
\t\ttargetIndex := -1
\t\tbestDistance := 44.0 * 44.0

\t\tfor i, entry := range playerSelects {
\t\t\tposition := transform.WorldPosition(entry)
\t\t\tdx := float64(x) - position.X
\t\t\tdy := float64(y) - position.Y
\t\t\tdistance := dx*dx + dy*dy
\t\t\tif distance <= bestDistance {
\t\t\t\tbestDistance = distance
\t\t\t\ttargetIndex = i
\t\t\t}
\t\t}

\t\tif targetIndex < 0 {
\t\t\tcontinue
\t\t}

\t\tentry := playerSelects[targetIndex]
\t\tplayerSelect := component.PlayerSelect.Get(entry)
\t\tif playerSelect.Selected && playerSelect.PlayerNumber == localPlayer {
\t\t\tif !playerSelect.Ready {
\t\t\t\tplayerSelect.LockIn()
\t\t\t}
\t\t\tjs.Global().Call("__airplanes5SendSelection", targetIndex, playerSelect.Ready)
\t\t\tcontinue
\t\t}
\t\tif playerSelect.Selected {
\t\t\tcontinue
\t\t}

\t\tplayerSelect.Select(localPlayer)
\t\tjs.Global().Call("__airplanes5SendSelection", targetIndex, false)
\t}
"""
s = s[:start] + new_touch + s[end:]

s = s.replace('if inpututil.IsKeyJustPressed(settings.Inputs.Shoot) || isTouch {', 'if inpututil.IsKeyJustPressed(settings.Inputs.Shoot) {', 1)

if '"syscall/js"' not in s:
    s = s.replace('import (\n\t"fmt"', 'import (\n\t"fmt"\n\t"syscall/js"', 1)

marker = '\tfor _, entry := range playerSelects {\n\t\tplayerSelect := component.PlayerSelect.Get(entry)\n\t\tcrosshair := hierarchy.MustGetChildren(entry)[0]'
publish = '''\tfor index, entry := range playerSelects {
\t\tps := component.PlayerSelect.Get(entry)
\t\tif ps.Selected && ps.PlayerNumber == localPlayer {
\t\t\tjs.Global().Call("__airplanes5SendSelection", index, ps.Ready)
\t\t\tbreak
\t\t}
\t}

''' + marker
if marker not in s:
    raise SystemExit("render marker not found")
s = s.replace(marker, publish, 1)
p.write_text(s)
