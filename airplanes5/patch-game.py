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

# Mobile player selection: the original game has two players and four airplane
# choices (factions). A touch on one airplane selects it for player 1, then
# another airplane can be selected for player 2. Tapping a selected airplane
# locks that player in, matching the original keyboard flow.
p = Path('/tmp/airplanes/system/playerselect.go')
s = p.read_text()

touch_pattern = re.compile(
    r'\tvar isTouch bool\n'
    r'\ttouchIDs := inpututil\.AppendJustPressedTouchIDs\(nil\)\n'
    r'\tif len\(touchIDs\) > 0 \{\n'
    r'\t\tisTouch = true\n'
    r'\t\}\n\n'
    r'\tfor number, settings := range archetype\.Players \{\n'
    r'\t\tif inpututil\.IsKeyJustPressed\(settings\.Inputs\.Shoot\) \|\| isTouch \{\n'
    r'\t\t\tif entry, ok := selected\[number\]; ok \{\n'
    r'\t\t\t\tcomponent\.PlayerSelect\.Get\(entry\)\.LockIn\(\)\n'
    r'\t\t\t\} else \{\n'
    r'\t\t\t\tfor _, entry := range playerSelects \{\n'
    r'\t\t\t\t\tplayerSelect := component\.PlayerSelect\.Get\(entry\)\n'
    r'\t\t\t\t\tif !playerSelect\.Selected \{\n'
    r'\t\t\t\t\t\tplayerSelect\.Select\(number\)\n'
    r'\t\t\t\t\t\tbreak\n'
    r'\t\t\t\t\t\}\n'
    r'\t\t\t\t\}\n'
    r'\t\t\t\}\n'
    r'\t\t\}\n'
    r'\t\}\n'
)

touch_replacement = '''\ttouchIDs := inpututil.AppendJustPressedTouchIDs(nil)

\tfor number, settings := range archetype.Players {
\t\tif inpututil.IsKeyJustPressed(settings.Inputs.Shoot) {
\t\t\tif entry, ok := selected[number]; ok {
\t\t\t\tcomponent.PlayerSelect.Get(entry).LockIn()
\t\t\t} else {
\t\t\t\tfor _, entry := range playerSelects {
\t\t\t\t\tplayerSelect := component.PlayerSelect.Get(entry)
\t\t\t\t\tif !playerSelect.Selected {
\t\t\t\t\t\tplayerSelect.Select(number)
\t\t\t\t\t\tbreak
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}

\tfor _, touchID := range touchIDs {
\t\tx, y := ebiten.TouchPosition(touchID)
\t\tvar target *donburi.Entry
\t\tbestDistance := 64.0
\t\tfor _, entry := range playerSelects {
\t\t\tpos := transform.WorldPosition(entry)
\t\t\tdx := float64(x) - pos.X
\t\t\tdy := float64(y) - pos.Y
\t\t\tdistance := dx*dx + dy*dy
\t\t\tif distance <= bestDistance*bestDistance {
\t\t\t\tbestDistance = distance
\t\t\t\ttarget = entry
\t\t\t}
\t\t}
\t\tif target == nil {
\t\t\tcontinue
\t\t}

\t\tplayerSelect := component.PlayerSelect.Get(target)
\t\tif playerSelect.Selected {
\t\t\tif !playerSelect.Ready {
\t\t\t\tplayerSelect.LockIn()
\t\t\t}
\t\t\tcontinue
\t\t}

\t\tplayerNumber := 0
\t\tif _, ok := selected[1]; !ok {
\t\t\tplayerNumber = 1
\t\t} else if _, ok := selected[2]; !ok {
\t\t\tplayerNumber = 2
\t\t}
\t\tif playerNumber != 0 {
\t\t\tplayerSelect.Select(playerNumber)
\t\t\tselected[playerNumber] = target
\t\t}
\t}
'''

s, count = touch_pattern.subn(touch_replacement, s, count=1)
if count != 1:
    raise SystemExit('Original mobile player-selection block not found')
p.write_text(s)
