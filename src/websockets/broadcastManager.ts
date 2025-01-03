import WebSocket from "ws";
import RedisManager from "@/handlers/redisManager";
import GameState, { PlayerView } from "@/model/gameState";

export default class BroadCastManager {

  constructor(private redisManager: RedisManager) {}
  async broadCastGameState(
    roomId: string,
    wsMap: Map<string, WebSocket>,
    messageType?: string,
  ): Promise<void> {
    const gameState = await this.redisManager.getGameState(roomId);
    const connectedPlayers = (
      await this.redisManager.getRoomPlayers(roomId)
    ).filter((player) => player.isConnected === true);
    for (const player of connectedPlayers) {
      const ws = wsMap.get(player.id);
      if (ws?.readyState === WebSocket.OPEN) {
        const playerIndex = gameState.players.findIndex(
          (x) => x.id === player.id,
        );
        if (playerIndex !== -1) {
          const playerView = this.getPlayerView(gameState, playerIndex);
          ws.send(
            JSON.stringify({
              type: messageType ? messageType : "gameState",
              data: playerView,
            }),
          );
        }
      }
    }
  }

  async broadcastLobby(
    roomId: string,
    wsMap: Map<string, WebSocket>,
  ): Promise<void> {
    console.log("lobby broadcast called");
    try {
      console.log("room id passed to broadcast lobby:", roomId);
      const players = await this.redisManager.getRoomPlayers(roomId);
      console.log("players", players);
      const connectedPlayers = (
        await this.redisManager.getRoomPlayers(roomId)
      ).filter((player) => player.isConnected === true);
      for (const player of connectedPlayers) {
        const ws = wsMap.get(player.id);
        console.log("sending message to: ", player.id);
        // console.log("ws state: ", wsMap);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "lobby",
              data: players,
            }),
          );
        }
      }
    } catch (error) {
      console.log("lobby broadcast error", error);
    }
  }

  getPlayerView(gameState: GameState, playerIndex: number): PlayerView {
    const playerView = {
      playerIndex,
      players: gameState.players,
      currentPlayerIndex: gameState.currentPlayerIndex,
      gameStatus: gameState.gameStatus,
      winner: gameState.winner,
      hand: gameState.hands[playerIndex],
    };
    return playerView;
  }

  broadCastToRoom(roomId: string, message: any, wsMap: Map<string, WebSocket>) {
    this.redisManager.getRoomPlayers(roomId).then((players) => {
      players.forEach((player) => {
        const playerWs = wsMap.get(player.id);
        if (playerWs && playerWs.readyState === WebSocket.OPEN) {
          playerWs.send(JSON.stringify(message));
        }
      });
    });
  }

  broadcastError(
    player: string,
    errorMessage: string,
    wsMap: Map<string, WebSocket>,
  ) {
    const playerWs = wsMap.get(player);
    if (playerWs && playerWs.readyState === WebSocket.OPEN) {
      playerWs.send(JSON.stringify({ type: "error", message: errorMessage }));
    }
  }
}
