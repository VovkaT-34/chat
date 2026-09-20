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
# The original game has two players and four airplane
# choices (factions). A touch on one airplane selects it for player 1, then
# another airplane can be selected for player 2. Tapping a selected airplane
# locks that player in, matching the original keyboard flow.
p = Path('/tmp/airplanes/system/playerselect.go')
s = p.read_text()

touch_pattern = re.compile(
    r'\\tvar isTouch bool\\n'
    r'\\ttouchIDs := inpututil\\.AppendJustPressedTouchIDs\\(nil\\)\\n'
    r'\\tif len\\(touchIDs\\) > 0 \\{\\n'
    r'\\t\\tisTouch = true\\n'
    r'\\t\\}\\n\\n'
    r'\\tfor number, settings := range archetype\\.Players \\{.*?'
    r'\\n\\t\\}\\n\\n'
    r'\\t\\/\\/ TODO Cancel just the last action',
    re.DOTALL,
)

touch_replacement = '''\\ttouchIDs := inpututil.AppendJustPressedTouchIDs(nil)

\\tfor number, settings := range archetype.Players {
\\t\\tif inpututil.IsKeyJustPressed(settings.Inputs.Shoot) {
\\t\\t\\tif entry, ok := selected[number]; ok {
\\t\\t\\t\\tcomponent.PlayerSelect.Get(entry).LockIn()
\\t\\t\\t} else {
\\t\\t\\t\\tfor _, entry := range playerSelects {
\\t\\t\\t\\t\\tplayerSelect := component.PlayerSelect.Get(entry)
\\t\\t\\t\\t\\tif !playerSelect.Selected {
\\t\\t\\t\\t\\t\\tplayerSelect.Select(number)
\\t\\t\\t\\t\\t\\tbreak
\\t\\t\\t\\t\\t}
\\t\\t\\t\\t}
\\t\\t\\t}
\\t\\t}

\\t\\tif inpututil.IsKeyJustPressed(settings.Inputs.Left) {
'''
s, count = touch_pattern.subn(touch_replacement, s, count=1)
if count != 1:
    raise SystemExit('Original mobile player-selection block not found')
p.write_text(s)
