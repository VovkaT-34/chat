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
	query           *donburi.Query
	leftTouch       ebiten.TouchID
	rightTouch      ebiten.TouchID
	leftActive      bool
	rightActive     bool
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
		leftTouch:  -1,
		rightTouch: -1,
	}
}

// Invisible mobile joystick on either side.
// The sensors remain active, but no joystick is drawn on screen.
func mobileJoystick(x, y int, centerX float64) (dx, dy float64, ok bool) {
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

		pauseTouch := false
		var touchX, touchY int
		touchIDs := ebiten.AppendTouchIDs(nil)

		if len(touchIDs) > 0 {
			// Pause button occupies the full-width bottom strip of the 480x1040 game.
			for _, id := range touchIDs {
				x, y := ebiten.TouchPosition(id)
				if x >= 0 && x < 480 && y >= 960 && y < 1040 {
					pauseTouch = true
					break
				}
			}
		}

		// Keep the existing left-side touch control and add an identical right-side control.
		// Either hand can control the airplane. If both are touching, the left control has priority.
		if !i.leftActive {
			for _, id := range touchIDs {
				x, y := ebiten.TouchPosition(id)
				if _, _, ok := mobileJoystick(x, y, 90.0); ok {
					i.leftTouch = id
					i.leftActive = true
					break
				}
			}
		}

		if !i.rightActive {
			for _, id := range touchIDs {
				if id == i.leftTouch {
					continue
				}
				x, y := ebiten.TouchPosition(id)
				if _, _, ok := mobileJoystick(x, y, 380.0); ok {
					i.rightTouch = id
					i.rightActive = true
					break
				}
			}
		}

		if i.leftActive {
			found := false
			for _, id := range touchIDs {
				if id == i.leftTouch {
					touchX, touchY = ebiten.TouchPosition(id)
					found = true
					break
				}
			}
			if !found {
				i.leftActive = false
				i.leftTouch = -1
			}
		}

		if i.rightActive {
			found := false
			for _, id := range touchIDs {
				if id == i.rightTouch {
					x, y := ebiten.TouchPosition(id)
					if !i.leftActive {
						touchX, touchY = x, y
					}
					found = true
					break
				}
			}
			if !found {
				i.rightActive = false
				i.rightTouch = -1
			}
		}

		if i.leftActive {
			for _, id := range touchIDs {
				if id == i.leftTouch {
					touchX, touchY = ebiten.TouchPosition(id)
					break
				}
			}
			if dx, dy, ok := mobileJoystick(touchX, touchY, 90.0); ok && !in.Disabled {
				velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
			}
		} else if i.rightActive {
			for _, id := range touchIDs {
				if id == i.rightTouch {
					touchX, touchY = ebiten.TouchPosition(id)
					break
				}
			}
			if dx, dy, ok := mobileJoystick(touchX, touchY, 380.0); ok && !in.Disabled {
				velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
			}
		}

		if in.Disabled {
			return
		}

		airplane := component.PlayerAirplane.Get(entry)
		player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
		player.ShootTimer.Update()

		// Continuous fire: the airplane shoots automatically whenever the game is running.
		if !pauseTouch && player.ShootTimer.IsReady() {
			position := transform.Transform.Get(entry).LocalPosition
			archetype.NewPlayerBullet(w, player, position)
			player.ShootTimer.Reset()
		}
	})
}
