package system

import (
	stdmath "math"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/yohamta/donburi"
	"github.com/yohamta/donburi/features/math"
	"github.com/yohamta/donburi/features/transform"
	"github.com/yohamta/donburi/filter"

	"github.com/m110/airplanes/archetype"
	"github.com/m110/airplanes/component"
)

type Controls struct {
	query          *donburi.Query
	joystickTouch  ebiten.TouchID
	joystickActive bool
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
		joystickTouch: -1,
	}
}

// Fixed mobile joystick, positioned in the lower-left like common mobile games.
// The finger may leave the circle after activation; the same touch keeps controlling it.
func mobileJoystick(x, y int) (dx, dy float64, ok bool) {
	const centerX = 90.0
	const centerY = 610.0
	const activationRadius = 120.0
	const maxRadius = 90.0
	const deadZone = 12.0

	xd := float64(x) - centerX
	yd := float64(y) - centerY
	distance := stdmath.Hypot(xd, yd)
	if distance > activationRadius {
		return 0, 0, false
	}
	if distance <= deadZone {
		return 0, 0, true
	}
	if distance > maxRadius {
		scale := maxRadius / distance
		xd *= scale
		yd *= scale
		distance = maxRadius
	}
	strength := (distance - deadZone) / (maxRadius - deadZone)
	return (xd / distance) * strength, (yd / distance) * strength, true
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

		// Capture the first finger that starts on the fixed joystick.
		if !i.joystickActive {
			for _, id := range touchIDs {
				x, y := ebiten.TouchPosition(id)
				if _, _, ok := mobileJoystick(x, y); ok {
					i.joystickTouch = id
					i.joystickActive = true
					break
				}
			}
		}

		// Keep following that exact finger until it is released.
		if i.joystickActive {
			found := false
			for _, id := range touchIDs {
				if id == i.joystickTouch {
					touchX, touchY = ebiten.TouchPosition(id)
					found = true
					break
				}
			}
			if found {
				if dx, dy, ok := mobileJoystick(touchX, touchY); ok && !in.Disabled {
					joystickTouch = true
					velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
				}
			} else {
				i.joystickActive = false
				i.joystickTouch = -1
			}
		}

		if len(touchIDs) > 0 {
			touch = true
		}
		pauseTouch = touch && touchX >= 150 && touchX < 330 && touchY >= 720

		if in.Disabled {
			return
		}

		airplane := component.PlayerAirplane.Get(entry)
		player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
		player.ShootTimer.Update()

		// The movement joystick and pause area must not trigger shooting.
		if (ebiten.IsKeyPressed(in.ShootKey) || (touch && !joystickTouch && !pauseTouch)) && player.ShootTimer.IsReady() {
			position := transform.Transform.Get(entry).LocalPosition
			archetype.NewPlayerBullet(w, player, position)
			player.ShootTimer.Reset()
		}
	})
}
