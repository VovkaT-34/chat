package system

import (
	stdmath "math"
	"syscall/js"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"github.com/yohamta/donburi"
	"github.com/yohamta/donburi/features/math"
	"github.com/yohamta/donburi/features/transform"
	"github.com/yohamta/donburi/filter"

	"github.com/m110/airplanes/archetype"
	"github.com/m110/airplanes/component"
)

type Controls struct {
	query           *donburi.Query
	playerQuery     *donburi.Query
	leftTouch       ebiten.TouchID
	rightTouch      ebiten.TouchID
	leftActive      bool
	rightActive     bool
	remoteShotSeen  [5]int
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
		playerQuery: donburi.NewQuery(filter.Contains(component.Player)),
		leftTouch:   -1,
		rightTouch:  -1,
	}
}

// Invisible mobile joystick on either side.
// The left sensor stays at its previous position; the right sensor is lower.
func mobileJoystick(x, y int, centerX, centerY float64) (dx, dy float64, ok bool) {
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
	gameplayActive := false
	i.playerQuery.Each(w, func(entry *donburi.Entry) {
		player := component.Player.Get(entry)
		if player.Lives > 0 && !player.Respawning {
			gameplayActive = true
		}
	})
	js.Global().Call("__airplanes5SetGameplay", gameplayActive)

	activeTouchIDs := ebiten.AppendTouchIDs(nil)
	justPressedIDs := inpututil.AppendJustPressedTouchIDs(nil)

	if !i.leftActive {
		for _, id := range justPressedIDs {
			x, y := ebiten.TouchPosition(id)
			if _, _, ok := mobileJoystick(x, y, 90.0, 610.0); ok {
				i.leftTouch = id
				i.leftActive = true
				break
			}
		}
	}

	if !i.rightActive {
		for _, id := range justPressedIDs {
			if id == i.leftTouch {
				continue
			}
			x, y := ebiten.TouchPosition(id)
			if _, _, ok := mobileJoystick(x, y, 390.0, 700.0); ok {
				i.rightTouch = id
				i.rightActive = true
				break
			}
		}
	}

	if i.leftActive {
		found := false
		for _, id := range activeTouchIDs {
			if id == i.leftTouch {
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
		for _, id := range activeTouchIDs {
			if id == i.rightTouch {
				found = true
				break
			}
		}
		if !found {
			i.rightActive = false
			i.rightTouch = -1
		}
	}

	if js.Global().Call("__airplanes5IsMultiplayer").Bool() {
		localPlayer := js.Global().Call("__airplanes5LocalPlayer").Int()
		if localPlayer < 1 || localPlayer > 4 { localPlayer = 1 }
		i.query.Each(w, func(entry *donburi.Entry) {
			airplane := component.PlayerAirplane.Get(entry)
			in := component.Input.Get(entry)
			isLocal := airplane.PlayerNumber == localPlayer
			x := js.Global().Call("__airplanes5LocalX").Float()
			y := js.Global().Call("__airplanes5LocalY").Float()
			if !isLocal { x = js.Global().Call("__airplanes5RemoteX", airplane.PlayerNumber).Float(); y = js.Global().Call("__airplanes5RemoteY", airplane.PlayerNumber).Float() }
			if x != 0 || y != 0 {
				camera := archetype.MustFindCamera(w)
				cameraY := transform.Transform.Get(camera).LocalPosition.Y
				pos := transform.Transform.Get(entry).LocalPosition
				pos.X, pos.Y = x, cameraY+y
				transform.Transform.Get(entry).LocalPosition = pos
			}
			velocity := component.Velocity.Get(entry)
			velocity.Velocity = math.Vec2{}
			if isLocal {
				dx, dy := 0.0, 0.0
				if ebiten.IsKeyPressed(in.MoveUpKey) { dy = -1 }
				if ebiten.IsKeyPressed(in.MoveDownKey) { dy = 1 }
				if ebiten.IsKeyPressed(in.MoveLeftKey) { dx = -1 }
				if ebiten.IsKeyPressed(in.MoveRightKey) { dx = 1 }
				if i.leftActive { tx,ty:=ebiten.TouchPosition(i.leftTouch); if a,b,ok:=mobileJoystick(tx,ty,90,610); ok { dx,dy=a,b } } else if i.rightActive { tx,ty:=ebiten.TouchPosition(i.rightTouch); if a,b,ok:=mobileJoystick(tx,ty,390,700); ok { dx,dy=a,b } }
				js.Global().Call("__airplanes5SendControl", dx, dy)

				player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
				if !in.Disabled && !player.Respawning && player.Lives > 0 {
					player.ShootTimer.Update()
					if player.ShootTimer.IsReady() {
						position := transform.Transform.Get(entry).LocalPosition
						archetype.NewPlayerBullet(w, player, position)
						player.ShootTimer.Reset()
						js.Global().Call("__airplanes5SendShot")
						js.Global().Call("__airplanes5PlayShot")
					}
				}
			} else {
				seq := js.Global().Call("__airplanes5RemoteShot", airplane.PlayerNumber).Int()
				if seq > i.remoteShotSeen[airplane.PlayerNumber] {
					i.remoteShotSeen[airplane.PlayerNumber] = seq
					player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
					if !player.Respawning && player.Lives > 0 {
						position := transform.Transform.Get(entry).LocalPosition
						archetype.NewPlayerBullet(w, player, position)
					}
				}
			}
		})
		return
	}

	localPlayer := js.Global().Call("__airplanes5LocalPlayer").Int()
	if localPlayer < 1 || localPlayer > 4 {
		localPlayer = 1
	}

	i.query.Each(w, func(entry *donburi.Entry) {
		in := component.Input.Get(entry)
		velocity := component.Velocity.Get(entry)
		airplane := component.PlayerAirplane.Get(entry)
		isLocal := airplane.PlayerNumber == localPlayer
		remoteDX := js.Global().Call("__airplanes5RemoteDX", airplane.PlayerNumber).Float()
		remoteDY := js.Global().Call("__airplanes5RemoteDY", airplane.PlayerNumber).Float()

		velocity.Velocity = math.Vec2{X: 0, Y: -0.5}
		if isLocal {
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

			if i.leftActive {
				x, y := ebiten.TouchPosition(i.leftTouch)
				if dx, dy, ok := mobileJoystick(x, y, 90.0, 610.0); ok && !in.Disabled {
					velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
				}
			} else if i.rightActive {
				x, y := ebiten.TouchPosition(i.rightTouch)
				if dx, dy, ok := mobileJoystick(x, y, 390.0, 700.0); ok && !in.Disabled {
					velocity.Velocity = math.Vec2{X: dx * in.MoveSpeed, Y: dy * in.MoveSpeed}
				}
			}
		} else {
			velocity.Velocity = math.Vec2{X: remoteDX * in.MoveSpeed, Y: remoteDY * in.MoveSpeed}
		}

		if isLocal {
			serverX := js.Global().Call("__airplanes5LocalX").Float()
			serverY := js.Global().Call("__airplanes5LocalY").Float()
			if serverX != 0 || serverY != 0 {
				camera := archetype.MustFindCamera(w)
				cameraY := transform.Transform.Get(camera).LocalPosition.Y
				pos := transform.Transform.Get(entry).LocalPosition
				pos.X = serverX
				pos.Y = cameraY + serverY
			}
			dx, dy := 0.0, 0.0
			if in.MoveSpeed != 0 {
				dx = velocity.Velocity.X / in.MoveSpeed
				dy = velocity.Velocity.Y / in.MoveSpeed
			}
			js.Global().Call("__airplanes5SendControl", dx, dy)
		}

		if in.Disabled {
			return
		}

		player := archetype.MustFindPlayerByNumber(w, airplane.PlayerNumber)
		if player.Respawning || player.Lives <= 0 {
			return
		}
		if !isLocal {
			seq := js.Global().Call("__airplanes5RemoteShot", airplane.PlayerNumber).Int()
			if seq > i.remoteShotSeen[airplane.PlayerNumber] {
				i.remoteShotSeen[airplane.PlayerNumber] = seq
				position := transform.Transform.Get(entry).LocalPosition
				archetype.NewPlayerBullet(w, player, position)
			}
			return
		}

		player.ShootTimer.Update()

		// Continuous fire: the local player creates the bullet and publishes the shot
		// event so every other phone creates the same bullet for this player.
		if player.ShootTimer.IsReady() {
			position := transform.Transform.Get(entry).LocalPosition
			archetype.NewPlayerBullet(w, player, position)
			player.ShootTimer.Reset()
			js.Global().Call("__airplanes5SendShot")
			js.Global().Call("__airplanes5PlayShot")
		}
	})
}
