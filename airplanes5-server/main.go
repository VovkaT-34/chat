package main
import (
	"github.com/gorilla/websocket"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)


const maxPlayers = 2

// Public Supabase project settings; the publishable key is intentionally public.
// Access is granted only after Supabase Auth and the profiles table confirm an approved admin.
const supabaseURL = "https://sxkukrqjtgkxmzuzondm.supabase.co"
const supabasePublishableKey = "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N"

type authTicket struct {
	userID string
	expires time.Time
}
var ticketMu sync.Mutex
var tickets = map[string]authTicket{}
type attemptWindow struct { start time.Time; count int }
var attemptMu sync.Mutex
var authAttempts = map[string]attemptWindow{}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil { return r.RemoteAddr }
	return host
}
func allowTicketAttempt(ip string) bool {
	attemptMu.Lock()
	defer attemptMu.Unlock()
	now := time.Now()
	w := authAttempts[ip]
	if now.Sub(w.start) >= time.Minute { w = attemptWindow{start: now} }
	if w.count >= 20 { authAttempts[ip] = w; return false }
	w.count++
	authAttempts[ip] = w
	return true
}
func verifyApprovedUserToken(token string) (string, bool) {
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, supabaseURL+"/auth/v1/user", nil)
	if err != nil { return "", false }
	req.Header.Set("apikey", supabasePublishableKey)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil { return "", false }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return "", false }
	var user struct { ID string `json:"id"` }
	if json.NewDecoder(resp.Body).Decode(&user) != nil || user.ID == "" { return "", false }

	profileReq, err := http.NewRequest(
		http.MethodPost,
		supabaseURL+"/rest/v1/rpc/check_my_profile",
		strings.NewReader("{}"),
	)
	if err != nil { return "", false }
	profileReq.Header.Set("apikey", supabasePublishableKey)
	profileReq.Header.Set("Authorization", "Bearer "+token)
	profileReq.Header.Set("Content-Type", "application/json")
	profileReq.Header.Set("Accept", "application/json")
	profileResp, err := client.Do(profileReq)
	if err != nil { return "", false }
	defer profileResp.Body.Close()
	if profileResp.StatusCode != http.StatusOK { return "", false }
	var profiles []struct { Approved bool `json:"approved"` }
	if json.NewDecoder(profileResp.Body).Decode(&profiles) != nil || len(profiles) != 1 { return "", false }
	if !profiles[0].Approved { return user.ID, false }

	permissionReq, err := http.NewRequest(
		http.MethodPost,
		supabaseURL+"/rest/v1/rpc/has_app_access",
		strings.NewReader(`{"p_app_id":"airplanes5"}`),
	)
	if err != nil { return "", false }
	permissionReq.Header.Set("apikey", supabasePublishableKey)
	permissionReq.Header.Set("Authorization", "Bearer "+token)
	permissionReq.Header.Set("Content-Type", "application/json")
	permissionResp, err := client.Do(permissionReq)
	if err != nil { return "", false }
	defer permissionResp.Body.Close()
	if permissionResp.StatusCode != http.StatusOK { return user.ID, false }
	var hasAccess bool
	if json.NewDecoder(permissionResp.Body).Decode(&hasAccess) != nil || !hasAccess {
		return user.ID, false
	}
	return user.ID, true
}
func issueAuthTicket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodOptions { w.WriteHeader(http.StatusNoContent); return }
	if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
	if !allowTicketAttempt(clientIP(r)) { http.Error(w, "too many attempts", http.StatusTooManyRequests); return }
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
	userID, ok := verifyApprovedUserToken(strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")))
	if !ok { http.Error(w, "forbidden: approved users only", http.StatusForbidden); return }
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil { http.Error(w, "ticket error", http.StatusInternalServerError); return }
	ticket := hex.EncodeToString(buf)
	ticketMu.Lock()
	now := time.Now()
	for key, value := range tickets { if now.After(value.expires) { delete(tickets, key) } }
	tickets[ticket] = authTicket{userID: userID, expires: now.Add(30 * time.Second)}
	ticketMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"ticket": ticket})
}
func consumeAuthTicket(ticket string) bool {
	if len(ticket) != 64 { return false }
	ticketMu.Lock()
	defer ticketMu.Unlock()
	entry, ok := tickets[ticket]
	delete(tickets, ticket)
	return ok && time.Now().Before(entry.expires) && entry.userID != ""
}


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
}

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
	conn      *websocket.Conn
	player    int
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

type Room struct {
	mu sync.Mutex
	clients map[int]*Client
	players map[int]*Player
	sessions map[string]int
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
		r = &Room{clients: map[int]*Client{}, players: map[int]*Player{}, sessions: map[string]int{}, enemies: map[uint64]*Enemy{}, bullets: map[uint64]*Bullet{}, phase: "lobby", wave: 1}
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

func (r *Room) add(c *websocket.Conn, session string) (int, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	id := 0
	var oldClient *Client
	if session != "" {
		if existing, ok := r.sessions[session]; ok {
			id = existing
			oldClient = r.clients[existing]
		}
	}
	if id == 0 {
		for candidate := 1; candidate <= maxPlayers; candidate++ {
			if _, ok := r.clients[candidate]; ok {
				continue
			}
			id = candidate
			break
		}
	}
	if id == 0 {
		return 0, false
	}

	client := &Client{
		conn: c,
		player: id,
		send: make(chan []byte, 2),
		done: make(chan struct{}),
	}
	if session != "" {
		r.sessions[session] = id
	}
	// A reconnect with the same session replaces the old socket in the same
	// player slot. The old handler must not be allowed to remove the new one.
	r.clients[id] = client
	if _, exists := r.players[id]; !exists {
		r.players[id] = &Player{ID: id, Selection: -1, Health: 3, Alive: true}
	}

	if oldClient != nil && oldClient != client {
		oldClient.closeWriter()
		_ = oldClient.conn.Close()
	}
	return id, true
}

func (r *Room) remove(id int, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Only the currently registered connection may remove this player.
	if current, ok := r.clients[id]; !ok || current != client {
		return
	}
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

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize: 1024,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool { return true },
}

func wsAccept(w http.ResponseWriter, req *http.Request) (*websocket.Conn, error) {
	return wsUpgrader.Upgrade(w, req, nil)
}

func (c *Client) writer() {
	for {
		select {
		case <-c.done:
			return
		case payload := <-c.send:
			if err := c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		}
	}
}

func (c *Client) closeWriter() {
	c.closeOnce.Do(func() { close(c.done) })
}

func writeControl(c *Client, opcode int, p []byte) error {
	select {
	case <-c.done:
		return fmt.Errorf("client closed")
	default:
	}
	return c.conn.WriteControl(opcode, p, time.Now().Add(2*time.Second))
}

func writeText(c *Client, p []byte) error {
	select {
	case <-c.done:
		return fmt.Errorf("client closed")
	default:
	}
	// Snapshots are state, not events: retain only the newest pending snapshot.
	select {
	case c.send <- p:
		return nil
	default:
	}
	select {
	case <-c.send:
	default:
	}
	select {
	case c.send <- p:
		return nil
	case <-c.done:
		return fmt.Errorf("client closed")
	default:
		return nil
	}
}
func handleWS(w http.ResponseWriter, req *http.Request) {
	if !allowTicketAttempt(clientIP(req)) {
		http.Error(w, "too many attempts", http.StatusTooManyRequests)
		return
	}
	code := req.URL.Query().Get("room")
	session := req.URL.Query().Get("session")
	ticket := req.URL.Query().Get("ticket")
	if len(code) < 4 || len(code) > 8 {
		http.Error(w, "invalid room", http.StatusBadRequest)
		return
	}
	// Tickets are random, short-lived, and single-use; raw Supabase tokens never enter the WS URL.
	if !consumeAuthTicket(ticket) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	conn, err := wsAccept(w, req)
	if err != nil {
		return
	}
	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(45 * time.Second))
	})

	room := getRoom(code)
	id, ok := room.add(conn, session)
	if !ok {
		_ = conn.Close()
		return
	}

	type welcome struct {
		Type string `json:"type"`
		Player int `json:"player"`
	}
	welcomeBytes, _ := json.Marshal(welcome{Type: "welcome", Player: id})
	client := room.clients[id]
	go client.writer()
	_ = writeText(client, welcomeBytes)

	defer func() {
		room.remove(id, client)
		client.closeWriter()
		_ = conn.Close()
	}()

	for {
		op, payload, err := conn.ReadMessage()
		if err != nil {
			return
		}
		if op != websocket.TextMessage {
			continue
		}
		var msg ClientMessage
		if json.Unmarshal(payload, &msg) == nil {
			room.update(msg, id)
		}
	}
}
func main() {
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	http.HandleFunc("/ws", handleWS)
	http.HandleFunc("/auth-ticket", issueAuthTicket)

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
				snapshot := r.step()
				// The simulation remains at 20 Hz, but network snapshots are sent at 10 Hz.
				// Clients predict/interpolate between snapshots, cutting outbound traffic
				// roughly in half without slowing the authoritative simulation.
				if snapshot.Tick%2 != 0 {
					continue
				}
				data, _ := json.Marshal(snapshot)
				r.mu.Lock()
				clients := make([]*Client, 0, len(r.clients))
				for _, c := range r.clients {
					clients = append(clients, c)
				}
				r.mu.Unlock()
				for _, c := range clients {
					_ = writeText(c, data)
				}
				if snapshot.Tick%400 == 0 {
					for _, c := range clients {
						_ = writeControl(c, websocket.PingMessage, nil)
					}
				}
			}
		}
	}()

	log.Printf("Airplanes 5 multiplayer server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
