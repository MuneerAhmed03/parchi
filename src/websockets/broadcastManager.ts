import WebSocket from "ws";
import RedisManager from "@/handlers/redisManager";
import GameState from "@/model/gameState";

export default class BroadCastManager {
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(private redisManager: RedisManager) {}

  async addClient(playerId: string, roomId: string, ws: WebSocket) {
    await this.redisManager.setPlayerConnection(playerId, roomId, true);

    this.clearHeartbeat(playerId);

    const heartbeat = setInterval(async () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        this.clearHeartbeat(playerId);
        await this.redisManager.handlePlayerDisconnect(playerId);
      }
    }, 60000);

    this.heartbeatIntervals.set(playerId, heartbeat);

    ws.on('close', async () => {
      this.clearHeartbeat(playerId);
      await this.redisManager.handlePlayerDisconnect(playerId);
    });

    ws.on('error', async () => {
      this.clearHeartbeat(playerId);
      await this.redisManager.handlePlayerDisconnect(playerId);
    });
  }

  private clearHeartbeat(playerId: string) {
    const interval = this.heartbeatIntervals.get(playerId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(playerId);
    }
  }

  // Add cleanup method
  async cleanup() {
    for (const [playerId, interval] of this.heartbeatIntervals.entries()) {
      clearInterval(interval);
      await this.redisManager.handlePlayerDisconnect(playerId);
    }
    this.heartbeatIntervals.clear();
  }

  async broadCastGameState(roomId: string, wsMap:Map<string,WebSocket>, messageType?:string): Promise<void> {
    console.log("game state broadcasting attempt")
    const gameState = await this.redisManager.getGameState(roomId);

    const connectedPlayers = (await this.redisManager.getRoomPlayers(roomId)).filter(player => player.isConnected === true)
    for ( const player of connectedPlayers){
        const ws =  wsMap.get(player.id);
        if(ws?.readyState === WebSocket.OPEN){
          const playerIndex = gameState.players.findIndex(x => x.id === player.id);
          const playerView = this.getPlayerView(gameState,playerIndex);
          ws.send(
            JSON.stringify({
              type: messageType ? messageType : "gameState",
              data: playerView,
            }),
          );  
        }
    }
  }

  async broadcastLobby(roomId:string, wsMap:Map<string,WebSocket>) : Promise<void>{
    console.log("lobby broadcast called");
    try {
      console.log("room id passed to broadcast lobby:",roomId);
    const players =  await this.redisManager.getRoomPlayers(roomId);
    console.log("players",players);
    const connectedPlayers = (await this.redisManager.getRoomPlayers(roomId)).filter(player => player.isConnected === true)
    console.log("connected players",connectedPlayers);
    for (const player of connectedPlayers){
      const ws = wsMap.get(player.id);
      if(ws?.readyState === WebSocket.OPEN){
        ws.send(
          JSON.stringify({
            type:"lobby",
            data: players,
          })
        )
      }
    }}catch(error){
      console.log("lobby broadcast error",error);
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
        const playerWs =  wsMap.get(player.id);
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
