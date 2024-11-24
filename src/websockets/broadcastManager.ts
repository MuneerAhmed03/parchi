import WebSocket from "ws";
import RedisManager from "@/handlers/redisManager";
import GameState from "@/model/gameState";

export default class BroadCastManager {
  // private clients: Map<string, WebSocket> = new Map();

  constructor(private redisManager: RedisManager) {}

  async addClient(playerId: string,roomId:string, ws: WebSocket) {
    // this.clients.set(playerId, ws);
    await this.redisManager.setPlayerConnection(playerId,roomId,true);

    const heartbeat = setInterval( async ()=>{
      if(ws.readyState == WebSocket.OPEN){
        ws.ping()
      }else{
          clearInterval(heartbeat)
          await this.redisManager.handlePlayerDisconnect(playerId)
      }
    },3000)

    ws.on('close', async () => {
      clearInterval(heartbeat);
      await this.redisManager.handlePlayerDisconnect(playerId);
    }); 
  }

  // removeClient(roomId: string) {
  //   this.clients.delete(roomId);
  // }

  async broadCastGameState(roomId: string, wsMap:Map<string,WebSocket>): Promise<void> {
    // const keys = Array.from(this.clients.keys());
    // console.log(keys);
    console.log("game state broadcasting attempt")
    const gameState = await this.redisManager.getGameState(roomId);

    const connectedPlayers = await this.redisManager.getConnectedPlayers(roomId);
    for ( const playerId of connectedPlayers){
        const ws =  wsMap.get(playerId);
        if(ws?.readyState === WebSocket.OPEN){
          const playerIndex = gameState.players.indexOf(playerId);
          const playerView = this.getPlayerView(gameState,playerIndex);
          ws.send(
            JSON.stringify({
              type: "gameState",
              data: playerView,
            }),
          );  
        }
    }
  }

  async broadcastLobby(roomId:string, wsMap:Map<string,WebSocket>) : Promise<void>{
    // const players = await this.redisManager.getRoomPlayers(roomId)
    const [players, connectedPlayers] = await Promise.all([
      this.redisManager.getRoomPlayers(roomId),
      this.redisManager.getConnectedPlayers(roomId)
    ])

    for (const playerId of connectedPlayers){
      const ws = wsMap.get(playerId);
      if(ws?.readyState === WebSocket.OPEN){
        ws.send(
          JSON.stringify({
            type:"lobby",
            data: players,
          })
        )
      }
    }
  }

  getPlayerView(gameState: GameState, playerIndex: number) {
    const playerView = {
      players: gameState.players,
      currentPlayerIndex: gameState.currentPlayerIndex,
      gameStatus: gameState.gameStatus,
      winner: gameState.winner,
      hand: gameState.hands[playerIndex],
    };
    return playerView;
  }

  broadCastToRoom(roomId: string, message: any, wsMap:Map<string,WebSocket>) {
    this.redisManager.getRoomPlayers(roomId).then((players) => {
      players.forEach((player) => {
        const playerWs =  wsMap.get(player);
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          playerWs.send(JSON.stringify(message));
        }
      });
    });
  }

  broadcastError(player:string, errorMessage:string,wsMap:Map<string,WebSocket>){
    const playerWs=wsMap.get(player);
    if(playerWs && playerWs.readyState === WebSocket.OPEN){
      playerWs.send(JSON.stringify({type :"error",message: errorMessage}))
    }
  }
}
