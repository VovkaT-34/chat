package main
import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

const maxPlayers = 4

type Input struct {
	Seq uint64  `json:"seq"`
	DX  float64 `json:"dx"`
	DY  float64 `json:"dy"`
	Shoot bool    `json:"shoot"`
}

type Player struct {
	ID        int     `json:"id"`
	Selection int     `json:"selection"`
	Ready     bool    `json:"ready"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	DX        float64 `json:"dx"`
	DY        float64 `json:"dy"`
	Health    int     `json:"health"`
	Alive     bool    `json:"alive"`
	Score     int     `json:"score"`
	Seq       uint64  `json:"seq"`
	FireSeq   uint64  `json:"fireSeq"`
	processedFireSeq uint64

type Enemy struct {
	ID uint64 `json:"id"`
	Type string `json:"type"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	VX float64 `json:"vx"`
	VY float64 `json:"vy"`
	Health int `json:"health"`
	Alive bool `json:"alive"`
}

type Bullet struct {
	ID uint64 `json:"id"`
	Owner int `json:"owner"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	VX float64 `json:"vx"`
	VY float64 `json:"vy"`
	Alive bool `json:"alive"`
}

type ClientMessage struct {
	Type      string `json:"type"`
	Selection int    `json:"selection,omitempty"`
	Ready     bool   `json:"ready,omitempty"`
	Paused    bool   `json:"paused,omitempty"`
	Input     *Input `json:"input,omitempty"`
}

type Snapshot struct {
	Type string `json:"type"`
	Tick uint64 `json:"tick"`
	Phase string `json:"phase"`
	Wave int `json:"wave"`
	Players []Player `json:"players"`
	Enemies []Enemy `json:"enemies"`
	Bullets []Bullet `json:"bullets"`
Paused bool `json:"paused"`
}

type Client struct {
	conn   net.Conn
	rw     *bufio.ReadWriter
	player int
	mu     sync.Mutex
}

type Room struct {
	mu sync.Mutex
	clients map[int]*Client
	players map[int]*Player
	enemies map[uint64]*Enemy
	bullets map[uint64]*Bullet
	nextEnemyID uint64
	nextBulletID uint64
	tick uint64
	phase string
	wave int
	spawnTimer int
paused bool
}

var roomsMu sync.Mutex
var rooms = map[string]*Room{}

func getRoom(code string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	r := rooms[code]
	if r == nil {
		r = &Room{clients: map[int]*Client{}, players: map[int]*Player{}, enemies: map[uint64]*Enemy{}, bullets: map[uint64]*Bullet{}, phase: "lobby", wave: 1}
		rooms[code] = r
	}
	return r
}

func clamp(v float64) float64 {
	if v < -1 {
		return -1
	}
	if v > 1 {
		return 1
	}
	return v
}

func allReady(p map[int]*Player) bool {
	if len(p) == 0 {
		return false
	}
	for _, x := range p {
		if x.Selection < 0 || !x.Ready {
			return false
		}
	}
	return true
}

func (r *Room) add(c net.Conn, rw *bufio.ReadWriter) (int, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id := 1; id <= maxPlayers; id++ {
		if _, ok := r.clients[id]; ok {
			continue
		}
		r.clients[id] = &Client{conn: c, rw: rw, player: id}
		r.players[id] = &Player{ID: id, Selection: -1, Health: 3, Alive: true}
		return id, true
	}
	return 0, false
}

func (r *Room) remove(id int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, id)
	delete(r.players, id)
	if len(r.clients) == 0 {
		r.phase = "lobby"
		r.enemies = map[uint64]*Enemy{}
		r.bullets = map[uint64]*Bullet{}
		r.wave = 1
		r.spawnTimer = 0
		r.paused = false
	}
}

func (r *Room) update(m ClientMessage, id int) {
	r.mu.Lock()
	defer r.mu.Unlock()

	p := r.players[id]
	if p == nil {
		return
	}

	switch m.Type {
	case "selection":
		if m.Selection < 0 || m.Selection >= 4 || p.Ready {
			return
		}
		for oid, o := range r.players {
			if oid != id && o.Selection == m.Selection {
				return
			}
		}
		p.Selection = m.Selection
		// Keep the authoritative spawn aligned with the original Airplanes playfield.
		spawnX := []float64{80, 240, 400, 560}[m.Selection]
		p.X = spawnX
		p.Y = 620

	case "ready":
		if p.Selection >= 0 {
			p.Ready = m.Ready
		}

	case "pause":
		if r.phase == "game" {
			r.paused = m.Paused
		}
	case "input":
		if m.Input != nil {
			p.DX = clamp(m.Input.DX)
			p.DY = clamp(m.Input.DY)
			p.Seq = m.Input.Seq
			if m.Input.Shoot {
				p.FireSeq++
			}
		}
	}

	if allReady(r.players) {
		if r.phase != "game" {
			r.paused = false
			for _, p := range r.players {
				p.Health = 3
				p.Alive = true
				if p.Y == 0 { p.Y = 620 }
			}
		}
		r.phase = "game"
	}
}

func (r *Room) step() Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tick++
	if r.phase != "game" || r.paused { return r.makeSnapshotLocked() }

	for _, p := range r.players {
		if !p.Alive { continue }
		p.X += p.DX * 5
		p.Y += p.DY * 5
		if p.X < 20 { p.X = 20 }; if p.X > 780 { p.X = 780 }
		if p.Y < 40 { p.Y = 40 }; if p.Y > 720 { p.Y = 720 }
	}
	r.spawnTimer++
	if r.spawnTimer >= 30 {
		r.spawnTimer = 0
		r.nextEnemyID++
		slot := int(r.nextEnemyID % 8)
		r.enemies[r.nextEnemyID] = &Enemy{ID:r.nextEnemyID,Type:"airplane",X:80+float64(slot)*90,Y:-30,VY:2.2,Health:1,Alive:true}
	}
	for id,e := range r.enemies {
		if !e.Alive { delete(r.enemies,id); continue }
		e.X += e.VX; e.Y += e.VY
		if e.Y > 780 { delete(r.enemies,id) }
	}
	for id,b := range r.bullets {
		b.X += b.VX; b.Y += b.VY
		if b.Y < -40 || b.Y > 800 || b.X < -40 || b.X > 840 { delete(r.bullets,id); continue }
		for eid,e := range r.enemies {
			if distance2(b.X,b.Y,e.X,e.Y) <= 28*28 {
				delete(r.bullets,id); e.Health--
				if e.Health <= 0 {
					delete(r.enemies,eid)
					if p:=r.players[b.Owner]; p!=nil { p.Score++ }
				}
				break
			}
		}
	}
	for _,p := range r.players {
		if p.FireSeq > p.processedFireSeq && p.Alive {
			for p.processedFireSeq < p.FireSeq {
				r.nextBulletID++
				r.bullets[r.nextBulletID]=&Bullet{ID:r.nextBulletID,Owner:p.ID,X:p.X,Y:p.Y-24,VY:-9,Alive:true}
				p.processedFireSeq++
			}
		}
		for id,e := range r.enemies {
			if distance2(p.X,p.Y,e.X,e.Y) <= 32*32 {
				delete(r.enemies,id); p.Health--
				if p.Health<=0 { p.Alive=false }
				break
			}
		}
	}
	return r.makeSnapshotLocked()
}

func distance2(ax,ay,bx,by float64) float64 {
	dx,dy:=ax-bx,ay-by
	return dx*dx+dy*dy
}

func (r *Room) makeSnapshotLocked() Snapshot {
	players:=make([]Player,0,len(r.players))
	for _,p:=range r.players { players=append(players,*p) }
	enemies:=make([]Enemy,0,len(r.enemies))
	for _,e:=range r.enemies { enemies=append(enemies,*e) }
	bullets:=make([]Bullet,0,len(r.bullets))
	for _,b:=range r.bullets { bullets=append(bullets,*b) }
	return Snapshot{Type:"snapshot",Tick:r.tick,Phase:r.phase,Wave:r.wave,Players:players,Enemies:enemies,Bullets:bullets,Paused:r.paused}
}

func wsAccept(w http.ResponseWriter, req *http.Request) (net.Conn, *bufio.ReadWriter, error) {
	if req.Header.Get("Connection") == "" || req.Header.Get("Upgrade") == "" {
		return nil, nil, fmt.Errorf("not websocket")
	}

	key := req.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, nil, fmt.Errorf("missing key")
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("hijack unsupported")
	}

	c, rw, err := hj.Hijack()
	if err != nil {
		return nil, nil, err
	}

	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	response := fmt.Sprintf(
		"HTTP/1.1 101 Switching Protocols\r\n"+
			"Upgrade: websocket\r\n"+
			"Connection: Upgrade\r\n"+
			"Sec-WebSocket-Accept: %s\r\n"+
			"\r\n",
		base64.StdEncoding.EncodeToString(sum[:]),
	)

	if _, err = rw.WriteString(response); err != nil {
		_ = c.Close()
		return nil, nil, err
	}
	if err = rw.Flush(); err != nil {
		_ = c.Close()
		return nil, nil, err
	}
	return c, rw, nil
}

func readFrame(r *bufio.Reader) (byte, []byte, error) {
	b1, err := r.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	b2, err := r.ReadByte()
	if err != nil {
		return 0, nil, err
	}

	op := b1 & 15
	masked := b2 & 128
	n := int64(b2 & 127)

	if n == 126 {
		var x uint16
		if err := binary.Read(r, binary.BigEndian, &x); err != nil {
			return 0, nil, err
		}
		n = int64(x)
	} else if n == 127 {
		var x uint64
		if err := binary.Read(r, binary.BigEndian, &x); err != nil {
			return 0, nil, err
		}
		if x > 1<<24 {
			return 0, nil, fmt.Errorf("frame too large")
		}
		n = int64(x)
	}

	if n < 0 || n > 1<<24 {
		return 0, nil, fmt.Errorf("bad frame")
	}

	var mask [4]byte
	if masked != 0 {
		if _, err := io.ReadFull(r, mask[:]); err != nil {
			return 0, nil, err
		}
	}

	p := make([]byte, n)
	if _, err := io.ReadFull(r, p); err != nil {
		return 0, nil, err
	}

	if masked != 0 {
		for i := range p {
			p[i] ^= mask[i%4]
		}
	}

	return op, p, nil
}

func writeText(c *Client, p []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	n := len(p)
	if n > 65535 {
		return fmt.Errorf("message too large")
	}

	h := []byte{129}
	if n < 126 {
		h = append(h, byte(n))
	} else {
		h = append(h, 126, byte(n>>8), byte(n))
	}

	if _, err := c.rw.Write(append(h, p...)); err != nil {
		return err
	}
	return c.rw.Flush()
}

func handleWS(w http.ResponseWriter, req *http.Request) {
	code := req.URL.Query().Get("room")
	if len(code) < 4 || len(code) > 8 {
		http.Error(w, "invalid room", http.StatusBadRequest)
		return
	}

	conn, rw, err := wsAccept(w, req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	room := getRoom(code)
	id, ok := room.add(conn, rw)
	if !ok {
		_ = conn.Close()
		return
	}

	type welcome struct {
		Type   string `json:"type"`
		Player int    `json:"player"`
	}
	welcomeBytes, _ := json.Marshal(welcome{Type: "welcome", Player: id})
	client := room.clients[id]
	_ = writeText(client, welcomeBytes)

	defer func() {
		room.remove(id)
		_ = conn.Close()
	}()

	for {
		op, payload, err := readFrame(rw.Reader)
		if err != nil {
			return
		}
		switch op {
		case 8:
			return
		case 9:
			_ = writeText(client, payload)
		case 1:
			var msg ClientMessage
			if json.Unmarshal(payload, &msg) == nil {
				room.update(msg, id)
			}
		}
	}
}

func main() {
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	http.HandleFunc("/ws", handleWS)

	port := os.Getenv("PORT")
	if port == "" {
		port = "10000"
	}

	go func() {
		ticker := time.NewTicker(50 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			roomsMu.Lock()
			rs := make([]*Room, 0, len(rooms))
			for _, r := range rooms {
				rs = append(rs, r)
			}
			roomsMu.Unlock()

			for _, r := range rs {
				data, _ := json.Marshal(r.step())
				r.mu.Lock()
				clients := make([]*Client, 0, len(r.clients))
				for _, c := range r.clients {
					clients = append(clients, c)
				}
				r.mu.Unlock()
				for _, c := range clients {
					_ = writeText(c, data)
				}
			}
		}
	}()

	log.Printf("Airplanes 5 multiplayer server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
