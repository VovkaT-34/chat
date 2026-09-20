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
	Shoot     bool    `json:"shoot"`
	Seq       uint64  `json:"seq"`
	FireSeq   uint64  `json:"fireSeq"`
}

type ClientMessage struct {
	Type      string `json:"type"`
	Selection int    `json:"selection,omitempty"`
	Ready     bool   `json:"ready,omitempty"`
	Input     *Input `json:"input,omitempty"`
}

type Snapshot struct {
	Type    string   `json:"type"`
	Tick    uint64   `json:"tick"`
	Phase   string   `json:"phase"`
	Players []Player `json:"players"`
}

type Client struct {
	conn   net.Conn
	rw     *bufio.ReadWriter
	player int
	mu     sync.Mutex
}

type Room struct {
	mu      sync.Mutex
	clients map[int]*Client
	players map[int]*Player
	tick    uint64
	phase   string
}

var roomsMu sync.Mutex
var rooms = map[string]*Room{}

func getRoom(code string) *Room {
	roomsMu.Lock()
	defer roomsMu.Unlock()
	r := rooms[code]
	if r == nil {
		r = &Room{clients: map[int]*Client{}, players: map[int]*Player{}, phase: "lobby"}
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
		r.players[id] = &Player{ID: id, Selection: -1}
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

	case "ready":
		if p.Selection >= 0 {
			p.Ready = m.Ready
		}

	case "input":
		if m.Input != nil {
			p.DX = clamp(m.Input.DX)
			p.DY = clamp(m.Input.DY)
			p.Seq = m.Input.Seq
			if m.Input.Shoot {
				p.FireSeq = m.Input.Seq
			}
			p.Shoot = false
		}
	}

	if allReady(r.players) {
		r.phase = "game"
	}
}

func (r *Room) snapshot() Snapshot {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.tick++
	out := make([]Player, 0, len(r.players))
	for _, p := range r.players {
		if r.phase == "game" {
			p.X += p.DX * 5
			p.Y += p.DY * 5
		}
		out = append(out, *p)
	}
	return Snapshot{Type: "snapshot", Tick: r.tick, Phase: r.phase, Players: out}
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
				data, _ := json.Marshal(r.snapshot())
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
