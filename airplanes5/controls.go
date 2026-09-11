package system

import (
	"math"

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

// mobileJoystick maps a virtual joystick on the right side to the game's 480x800 coordinates.
// The direction is proportional to the finger's displacement from the joystick center.
func mobileJoystick(x, y int) (dx, dy float64, ok bool) {
	const centerX = 390.0
	const centerY = 600.0
	const radius = 90.0

	xd := float64(x) - centerX
	yd := float64(y) - centerY
	distance := math.Hypot(xd, yd)
	if distance > radius || distance < 8 {
		return 0, 0, false
	}
	return xd / radius, yd / radius, true
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
		joystickTouch := false
		pauseTouch := false
		var touchX, touchY int
		touchIDs := ebiten.AppendTouchIDs(nil)
		if len(touchIDs) > 0 {
			touch = true
			touchX, touchY = ebiten.TouchPosition(touchIDs[0])
			if dx, dy, ok := mobileJoystick(touchX, touchY); ok && !in.Disabled {
				joystickTouch = true
				velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
			}
			pauseTouch = touchX >= 150 && touchX < 330 && touchY >= 720
		}

		if in.Disabled {
			return
		}

		airplane := component.PlayerAirplane.Get(entry)
		player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
		player.ShootTimer.Update()

		// Touching the mobile joystick or pause button must not fire the weapon.
		if (ebiten.IsKeyPressed(in.ShootKey) || (touch && !joystickTouch && !pauseTouch)) && player.ShootTimer.IsReady() {
			position := transform.Transform.Get(entry).LocalPosition
			archetype.NewPlayerBullet(w, player, position)
			player.ShootTimer.Reset()
		}
	})
}
