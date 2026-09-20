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
new_touch = new_touch.replace("\\t", "\t")
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
s = s.replace(
    'if playersReady > 0 && playersReady == len(chosenPlayers) {',
    'if playersReady > 0 && playersReady == len(chosenPlayers) && js.Global().Call("__airplanes5CanStart").Bool() {',
    1,
)
p.write_text(s)

# Airplanes 5 multiplayer: player 1 is authoritative for enemy damage.
p = Path('/tmp/airplanes/system/collision.go')
s = p.read_text()
if '"syscall/js"' not in s:
    s = s.replace('import (\n\t"fmt"', 'import (\n\t"fmt"\n\t"syscall/js"', 1)
s = s.replace('''component.CollisionLayerAirEnemies: func(w donburi.World, entry *donburi.Entry, other *donburi.Entry) {
\t\t\tcomponent.Destroy(entry)
\t\t\tcomponent.Health.Get(other).Damage()
\t\t},''','''component.CollisionLayerAirEnemies: func(w donburi.World, entry *donburi.Entry, other *donburi.Entry) {
\t\t\tif !js.Global().Call("__airplanes5IsAuthority").Bool() {
\t\t\t\treturn
\t\t\t}
\t\t\tcomponent.Destroy(entry)
\t\t\tcomponent.Health.Get(other).Damage()
\t\t\tjs.Global().Call("__airplanes5SendEnemyHit", other.Entity().Id())
\t\t},''',1)
s = s.replace('''component.CollisionLayerGroundEnemies: func(w donburi.World, entry *donburi.Entry, other *donburi.Entry) {
\t\t\tcomponent.Destroy(entry)
\t\t\tcomponent.Health.Get(other).Damage()
\t\t},''','''component.CollisionLayerGroundEnemies: func(w donburi.World, entry *donburi.Entry, other *donburi.Entry) {
\t\t\tif !js.Global().Call("__airplanes5IsAuthority").Bool() {
\t\t\t\treturn
\t\t\t}
\t\t\tcomponent.Destroy(entry)
\t\t\tcomponent.Health.Get(other).Damage()
\t\t\tjs.Global().Call("__airplanes5SendEnemyHit", other.Entity().Id())
\t\t},''',1)
s = s.replace(
'''\tfor _, entry := range entries {
\t\tif !entry.Valid() {
\t\t\tcontinue
\t\t}

\t\tcollider := component.Collider.Get(entry)''',
'''\tfor _, entry := range entries {
\t\tif !entry.Valid() {
\t\t\tcontinue
\t\t}

\t\tif !js.Global().Call("__airplanes5IsAuthority").Bool() && entry.HasComponent(component.Health) {
\t\t\thitID := js.Global().Call("__airplanes5PeekEnemyHit").Int()
\t\t\tif hitID >= 0 && uint64(entry.Entity().Id()) == uint64(hitID) {
\t\t\t\tcomponent.Health.Get(entry).Damage()
\t\t\t\tjs.Global().Call("__airplanes5AckEnemyHit", hitID)
\t\t\t}
\t\t}

\t\tcollider := component.Collider.Get(entry)''',
1,
)
p.write_text(s)

# Airplanes 5 multiplayer: the upstream game defines two players. Extend it to four
# so each room member gets a real player entity and a stable spawn/input mapping.
p = Path('/tmp/airplanes/archetype/player.go')
s = p.read_text()
if 'ebiten.KeyI' not in s:
    s = s.replace('''	2: {
		Inputs: PlayerInputs{
			Up:    ebiten.KeyUp,
			Right: ebiten.KeyRight,
			Down:  ebiten.KeyDown,
			Left:  ebiten.KeyLeft,
			Shoot: ebiten.KeyEnter,
		},
	},
}''', '''	2: {
		Inputs: PlayerInputs{
			Up:    ebiten.KeyUp,
			Right: ebiten.KeyRight,
			Down:  ebiten.KeyDown,
			Left:  ebiten.KeyLeft,
			Shoot: ebiten.KeyEnter,
		},
	},
	3: {
		Inputs: PlayerInputs{
			Up:    ebiten.KeyI,
			Right: ebiten.KeyL,
			Down:  ebiten.KeyK,
			Left:  ebiten.KeyJ,
			Shoot: ebiten.KeyNumpad0,
		},
	},
	4: {
		Inputs: PlayerInputs{
			Up:    ebiten.KeyT,
			Right: ebiten.KeyH,
			Down:  ebiten.KeyG,
			Left:  ebiten.KeyF,
			Shoot: ebiten.KeyNumpad1,
		},
	},
}''',1)
s = s.replace('''	case 2:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.75,
			Y: cameraPos.Y + float64(game.Settings.ScreenHeight)*0.9,
		}
	default:''', '''	case 2:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.5,
			Y: cameraPos.Y + float64(game.Settings.ScreenHeight)*0.9,
		}
	case 3:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.75,
			Y: cameraPos.Y + float64(game.Settings.ScreenHeight)*0.9,
		}
	case 4:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.9,
			Y: cameraPos.Y + float64(game.Settings.ScreenHeight)*0.9,
		}
	default:''',1)
s = s.replace('''	case 1:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.25,''','''	case 1:
		return math.Vec2{
			X: float64(game.Settings.ScreenWidth) * 0.1,''',1)
p.write_text(s)
