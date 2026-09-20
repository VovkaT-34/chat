package main
import ("encoding/json";"log";"net/http";"os";"sync";"time";"github.com/gorilla/websocket")
const maxPlayers=4
type Input struct { Seq uint64 `json:"seq"`; DX float64 `json:"dx"`; DY float64 `json:"dy"`; Shoot bool `json:"shoot"` }
type Player struct { ID int `json:"id"`; Selection int `json:"selection"`; Ready bool `json:"ready"`; X float64 `json:"x"`; Y float64 `json:"y"`; DX float64 `json:"dx"`; DY float64 `json:"dy"`; Shoot bool `json:"shoot"`; Seq uint64 `json:"seq"` }
type ClientMessage struct { Type string `json:"type"`; Selection int `json:"selection,omitempty"`; Ready bool `json:"ready,omitempty"`; Input *Input `json:"input,omitempty"` }
type Snapshot struct { Type string `json:"type"`; Tick uint64 `json:"tick"`; Phase string `json:"phase"`; Players []Player `json:"players"` }
type Client struct { conn *websocket.Conn; player int }
type Room struct { mu sync.Mutex; clients map[int]*Client; players map[int]*Player; tick uint64; phase string }
var roomsMu sync.Mutex
var rooms=map[string]*Room{}
var upgrader=websocket.Upgrader{CheckOrigin:func(r *http.Request)bool{return true}}
func getRoom(code string)*Room{roomsMu.Lock();defer roomsMu.Unlock();r:=rooms[code];if r==nil{r=&Room{clients:map[int]*Client{},players:map[int]*Player{},phase:"lobby"};rooms[code]=r};return r}
func(r *Room)add(c *websocket.Conn)(int,bool){r.mu.Lock();defer r.mu.Unlock();for id:=1;id<=maxPlayers;id++{if _,ok:=r.clients[id];ok{continue};r.clients[id]=&Client{conn:c,player:id};r.players[id]=&Player{ID:id,Selection:-1};return id,true};return 0,false}
func(r *Room)remove(id int){r.mu.Lock();defer r.mu.Unlock();delete(r.clients,id);delete(r.players,id);if len(r.clients)==0{r.phase="lobby"}}
func clamp(v float64)float64{if v < -1{return -1};if v>1{return 1};return v}
func allReady(p map[int]*Player)bool{if len(p)==0{return false};for _,x:=range p{if x.Selection<0||!x.Ready{return false}};return true}
func(r *Room)update(m ClientMessage,id int){r.mu.Lock();defer r.mu.Unlock();p:=r.players[id];if p==nil{return};switch m.Type{case "selection":if m.Selection<0||m.Selection>=4||p.Ready{return};for oid,o:=range r.players{if oid!=id&&o.Selection==m.Selection{return}};p.Selection=m.Selection;case "ready":if p.Selection>=0{p.Ready=m.Ready};case "input":if m.Input!=nil{p.DX=clamp(m.Input.DX);p.DY=clamp(m.Input.DY);p.Shoot=m.Input.Shoot;p.Seq=m.Input.Seq}};if allReady(r.players){r.phase="game"}}
func(r *Room)snapshot()Snapshot{r.mu.Lock();defer r.mu.Unlock();r.tick++;out:=make([]Player,0,len(r.players));for _,p:=range r.players{if r.phase=="game"{p.X+=p.DX*5;p.Y+=p.DY*5};out=append(out,*p)};return Snapshot{Type:"snapshot",Tick:r.tick,Phase:r.phase,Players:out}}
func(r *Room)broadcast(s Snapshot){b,e:=json.Marshal(s);if e!=nil{return};r.mu.Lock();cs:=make([]*Client,0,len(r.clients));for _,c:=range r.clients{cs=append(cs,c)};r.mu.Unlock();for _,c:=range cs{_ = c.conn.WriteMessage(websocket.TextMessage,b)}}
func handleWS(w http.ResponseWriter,req *http.Request){code:=req.URL.Query().Get("room");if len(code)<4||len(code)>8{http.Error(w,"invalid room",400);return};c,e:=upgrader.Upgrade(w,req,nil);if e!=nil{return};r:=getRoom(code);id,ok:=r.add(c);if !ok{_ = c.WriteJSON(map[string]any{"type":"error","message":"room full"});_ = c.Close();return};defer func(){r.remove(id);_ = c.Close()}();_ = c.WriteJSON(map[string]any{"type":"welcome","player":id});for{var m ClientMessage;if e:=c.ReadJSON(&m);e!=nil{return};r.update(m,id)}}
func main(){http.HandleFunc("/healthz",func(w http.ResponseWriter,r *http.Request){w.WriteHeader(200);_,_=w.Write([]byte("ok"))});http.HandleFunc("/ws",handleWS);port:=os.Getenv("PORT");if port==""{port="10000"};go func(){t:=time.NewTicker(50*time.Millisecond);defer t.Stop();for range t.C{roomsMu.Lock();rs:=make([]*Room,0,len(rooms));for _,r:=range rooms{rs=append(rs,r)};roomsMu.Unlock();for _,r:=range rs{r.broadcast(r.snapshot())}}}();log.Printf("Airplanes 5 multiplayer server listening on :%s",port);log.Fatal(http.ListenAndServe(":"+port,nil))}
