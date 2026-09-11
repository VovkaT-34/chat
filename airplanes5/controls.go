package system

import (
	"github.com/hajimehoshi/ebiten/v2"
	"github.com/yohamta/donburi"
	"github.com/yohamta/donburi/features/math"
	"github.com/yohamta/donburi/features/transform"
	"github.com/yohamta/donburi/filter"

	"github.com/m110/airplanes/archetype"
	"github.com/m110/airplanes/component"
)

type Controls struct {
	query *donburi.Query
}

func NewControls() *Controls {
	return &Controls{
		query: donburi.NewQuery(
			filter.Contains(
				transform.Transform,
				component.Input,
				component.Velocity,
				component.Sprite,
				component.PlayerAirplane,
			),
		),
	}
}

// mobileDirection maps the fixed mobile buttons to the game's 480x800 coordinates.
func mobileDirection(x, y int) (dx, dy float64, ok bool) {
	if y < 600 {
		return 0, 0, false
	}
	switch {
	case x >= 140 && x < 340 && y >= 600 && y < 700:
		return 0, -1, true
	case x < 140 && y >= 600 && y < 700:
		return -1, 0, true
	case x >= 340 && y >= 600 && y < 700:
		return 1, 0, true
	case x >= 140 && x < 340 && y >= 700:
		return 0, 1, true
	default:
		return 0, 0, false
	}
}

func (i *Controls) Update(w donburi.World) {
	i.query.Each(w, func(entry *donburi.Entry) {
		in := component.Input.Get(entry)
		velocity := component.Velocity.Get(entry)

		velocity.Velocity = math.Vec2{X: 0, Y: -0.5}
		if ebiten.IsKeyPressed(in.MoveUpKey) {
			velocity.Velocity.Y = -in.MoveSpeed
		} else if ebiten.IsKeyPressed(in.MoveDownKey) {
			velocity.Velocity.Y = in.MoveSpeed
		}
		if ebiten.IsKeyPressed(in.MoveRightKey) {
			velocity.Velocity.X = in.MoveSpeed
		}
		if ebiten.IsKeyPressed(in.MoveLeftKey) {
			velocity.Velocity.X = -in.MoveSpeed
		}

		touch := false
		var touchX, touchY int
		touchIDs := ebiten.AppendTouchIDs(nil)
		if len(touchIDs) > 0 {
			touch = true
			touchX, touchY = ebiten.TouchPosition(touchIDs[0])
			if dx, dy, ok := mobileDirection(touchX, touchY); ok && !in.Disabled {
				velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
			}
		}

		if in.Disabled {
			return
		}

		airplane := component.PlayerAirplane.Get(entry)
		player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
		player.ShootTimer.Update()

		// Touching the mobile pause button must not fire the weapon.
		pauseTouch := touch && touchX >= 150 && touchX < 330 && touchY >= 520 && touchY < 600
		if (ebiten.IsKeyPressed(in.ShootKey) || (touch && !pauseTouch)) && player.ShootTimer.IsReady() {
			position := transform.Transform.Get(entry).LocalPosition
			archetype.NewPlayerBullet(w, player, position)
			player.ShootTimer.Reset()
		}
	})
}
