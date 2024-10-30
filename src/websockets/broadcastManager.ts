import WebSocket from "ws";
import RedisManager from "@/handlers/redisManager";
import GameState from "@/model/gameState";

export default class BroadCastManager {
  private clients: Map<string, WebSocket> = new Map();

  constructor(private redisManager: RedisManager) {}

  addClient(playerId: string, ws: WebSocket) {
    this.clients.set(playerId, ws);
  }

  removeClient(roomId: string) {
    this.clients.delete(roomId);
  }

  async broadCastGameState(roomId: string): Promise<void> {
    const keys = Array.from(this.clients.keys());
    console.log(keys);
    console.log("game state broadcasting attempt")
    const gameState = await this.redisManager.getGameState(roomId);
    // console.log(JSON.stringify(gameState));
    gameState.players.forEach((player, index) => {
      const playerWs = this.clients.get(player);
      if (playerWs && playerWs.readyState === WebSocket.OPEN) {
        const playerView =  this.getPlayerView(gameState, index);
        // console.log("player view: ",playerView);
        playerWs.send(
          JSON.stringify({
            type: "gameState",
            data: playerView,
          }),
        );
      }
    });
  }

  async broadcastLobby(roomId:string) : Promise<void>{
    const players = await this.redisManager.getRoomPlayers(roomId)
    players.forEach(player => {
      const playerWs = this.clients.get(player);
      if (playerWs && playerWs.readyState === WebSocket.OPEN){
        playerWs.send(
          JSON.stringify({
            type: "lobby",
            data : players,
          })
        )
      }
    })
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

  braoadCastToRoon(roomId: string, message: any) {
    this.redisManager.getRoomPlayers(roomId).then((players) => {
      players.forEach((player) => {
        const playerWs = this.clients.get(player);
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          playerWs.send(JSON.stringify(message));
        }
      });
    });
  }

  broadcastError(player:string, errorMessage:string){
    const playerWs=this.clients.get(player);
    if(playerWs && playerWs.readyState === WebSocket.OPEN){
      playerWs.send(JSON.stringify({type :"error",message: errorMessage}))
    }
  }
}
