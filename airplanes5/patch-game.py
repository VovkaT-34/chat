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

s = s.replace(
"""\tif gameData.Paused {
\t\treturn
\t}
""",
"""\tif gameData.Paused {
\t\treturn
\t}
\tif js.Global().Call("__airplanes5IsMultiplayer").Bool() && js.Global().Call("__airplanes5GameStarted").Bool() {
\t\tg.systems[0].Update(g.world)
\t\treturn
\t}
""",
1,
)

p.write_text(s)

# Mobile player selection: touch coordinates choose the airplane actually tapped.
# The original game has two players and four airplane choices.
p = Path('/tmp/airplanes/system/playerselect.go')
s = p.read_text()

start = s.index("\tvar isTouch bool")
end = s.index("\n\tfor number, settings := range archetype.Players", start)

new_touch = """\tjs.Global().Call("__airplanes5SelectionScreen", true)
	localPlayer := js.Global().Call("__airplanes5LocalPlayer").Int()
\\tif localPlayer < 1 || localPlayer > 4 {
\\t\\tlocalPlayer = 1
\\t}

\\t// Mirror every other room member into this local selection screen.
\\tfor playerNumber := 1; playerNumber <= 4; playerNumber++ {
\\t\\tif playerNumber == localPlayer {
\\t\\t\\tcontinue
\\t\\t}
\\t\\tremoteIndex := js.Global().Call("__airplanes5RemoteSelection", playerNumber).Int()
\\t\\tremoteReady := js.Global().Call("__airplanes5RemoteReady", playerNumber).Bool()
\\t\\tfor index, entry := range playerSelects {
\\t\\t\\tps := component.PlayerSelect.Get(entry)
\\t\\t\\tif ps.Selected && ps.PlayerNumber == playerNumber && index != remoteIndex && !ps.Ready {
\\t\\t\\t\\tps.Unselect()
\\t\\t\\t}
\\t\\t}
\\t\\tif remoteIndex < 0 || remoteIndex >= len(playerSelects) {
\\t\\t\\tcontinue
\\t\\t}
\\t\\ttarget := playerSelects[remoteIndex]
\\t\\ttargetPS := component.PlayerSelect.Get(target)
\\t\\tif targetPS.Selected && targetPS.PlayerNumber != playerNumber && !targetPS.Ready {
\\t\\t\\tcontinue
\\t\\t}
\\t\\tif !targetPS.Selected {
\\t\\t\\ttargetPS.Select(playerNumber)
\\t\\t}
\\t\\tif remoteReady && targetPS.Selected && targetPS.PlayerNumber == playerNumber && !targetPS.Ready {
\\t\\t\\ttargetPS.LockIn()
\\t\\t}
\\t}
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
if playerSelect.Selected && playerSelect.PlayerNumber != localPlayer {\n\t\t\tcontinue\n\t\t}\n\t\tif playerSelect.Selected && playerSelect.PlayerNumber == localPlayer {\n\t\t\tplayerSelect.Unselect()\n\t\t\tjs.Global().Call("__airplanes5SendSelection", -1, false)\n\t\t\tcontinue\n\t\t}\n\t\tfor _, otherEntry := range playerSelects {\n\t\t\tother := component.PlayerSelect.Get(otherEntry)\n\t\t\tif other.Selected && other.PlayerNumber == localPlayer && !other.Ready {\n\t\t\t\tother.Unselect()\n\t\t\t}\n\t\t}\n\n\t\tplayerSelect.Select(localPlayer)
\t\tjs.Global().Call("__airplanes5SendSelection", targetIndex, false)
\t}
"""
new_touch = new_touch.replace("\\t", "\t").replace("\\n", "\n")
s = s[:start] + new_touch + s[end:]

s = s.replace('if inpututil.IsKeyJustPressed(settings.Inputs.Shoot) || isTouch {', 'if inpututil.IsKeyJustPressed(settings.Inputs.Shoot) {', 1)

if '"syscall/js"' not in s:
    s = s.replace('import (\n\t"fmt"', 'import (\n\t"fmt"\n\t"syscall/js"', 1)

marker = '\tfor _, entry := range playerSelects {\n\t\tplayerSelect := component.PlayerSelect.Get(entry)\n\t\tcrosshair := hierarchy.MustGetChildren(entry)[0]'
publish = '''''' + marker
if marker not in s:
    raise SystemExit("render marker not found")
s = s.replace(marker, publish, 1)
s = s.replace(
    'if playersReady > 0 && playersReady == len(chosenPlayers) {',
    'if len(chosenPlayers) > 0 && js.Global().Call("__airplanes5CanStart").Bool() {',
    1,
)
s = s.replace('''if len(chosenPlayers) > 0 && js.Global().Call("__airplanes5CanStart").Bool() {
		s.chosenPlayers = chosenPlayers
		s.started = true
		for _, entry := range playerSelects {
			ps := component.PlayerSelect.Get(entry)
			if ps.Selected && ps.Ready {
				velocity := component.Velocity.Get(entry)
				velocity.Velocity.Y = -0.5
			}
		}
	}''', '''if len(chosenPlayers) > 0 && js.Global().Call("__airplanes5CanStart").Bool() {
		s.chosenPlayers = chosenPlayers
		s.started = true
		s.startCallback(s.chosenPlayers)
		return
	}''', 1)

s = re.sub(r'(")Player\\b', r'\1Игрок', s)

p.write_text(s)



# Keep the upstream renderer intact. Multiplayer synchronizes player state
# through controls.go; it does not replace the game's sprites with a second canvas.
