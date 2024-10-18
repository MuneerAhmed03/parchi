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
    const gameState = await this.redisManager.getGameState(roomId);

    gameState.players.forEach((player, index) => {
      const playerWs = this.clients.get(player);
      if (playerWs && playerWs.readyState === WebSocket.OPEN) {
        const playerView = this.getPlayerView(gameState, index);
        playerWs.send(
          JSON.stringify({
            type: "gameState",
            data: playerView,
          }),
        );
      }
    });
  }

  async getPlayerView(gameState: GameState, playerIndex: number) {
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
}
