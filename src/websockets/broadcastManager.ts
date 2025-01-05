import WebSocket from "ws";
import RedisManager from "@/handlers/redisManager";
import GameState, { PlayerView } from "@/model/gameState";
import { ErrorHandler } from "@/utils/ErrorHandler";

export default class BroadCastManager {
  constructor(private redisManager: RedisManager) {}

  private async sendMessageToPlayer(
    ws: WebSocket,
    message: any
  ): Promise<void> {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private async getConnectedPlayersWithSockets(
    roomId: string,
    wsMap: Map<string, WebSocket>
  ): Promise<Array<{ player: any; ws: WebSocket | undefined }>> {
    const players = await this.redisManager.getRoomPlayers(roomId);
    const connectedPlayers = players.filter(player => player.isConnected === true);
    
    return connectedPlayers.map(player => ({
      player,
      ws: wsMap.get(player.id)
    }));
  }

  private async broadcastToConnectedPlayers(
    roomId: string,
    wsMap: Map<string, WebSocket>,
    messageBuilder: (player: any) => any
  ): Promise<void> {
    const playersWithSockets = await this.getConnectedPlayersWithSockets(roomId, wsMap);
    
    for (const { player, ws } of playersWithSockets) {
      if (ws) {
        await this.sendMessageToPlayer(ws, messageBuilder(player));
      }
    }
  }

  async broadCastGameState(
    roomId: string,
    wsMap: Map<string, WebSocket>,
    messageType?: string
  ): Promise<void> {
    const gameState = await this.redisManager.getGameState(roomId);

    await this.broadcastToConnectedPlayers(roomId, wsMap, (player) => {
      const playerIndex = gameState.players.findIndex(x => x.id === player.id);
      if (playerIndex === -1) return null;

      const playerView = this.getPlayerView(gameState, playerIndex);
      return {
        type: messageType || "gameState",
        data: playerView
      };
    });
  }

  async broadcastLobby(
    roomId: string,
    wsMap: Map<string, WebSocket>
  ): Promise<void> {
    try {
      const players = await this.redisManager.getRoomPlayers(roomId);
      
      await this.broadcastToConnectedPlayers(roomId, wsMap, () => ({
        type: "lobby",
        data: players
      }));
    } catch (error) {
      ErrorHandler.handleError(
        error as Error,
        "BroadcastManager.broadcastLobby",
        roomId
      );
    }
  }

  getPlayerView(gameState: GameState, playerIndex: number): PlayerView {
    return {
      playerIndex,
      players: gameState.players,
      currentPlayerIndex: gameState.currentPlayerIndex,
      gameStatus: gameState.gameStatus,
      winner: gameState.winner,
      hand: gameState.hands[playerIndex],
    };
  }

  broadCastToRoom(
    roomId: string,
    message: any,
    wsMap: Map<string, WebSocket>
  ) {
    this.broadcastToConnectedPlayers(roomId, wsMap, () => message)
      .catch(error => {
        ErrorHandler.handleError(
          error as Error,
          "BroadcastManager.broadCastToRoom",
          roomId
        );
      });
  }

  broadcastError(
    player: string,
    errorMessage: string,
    wsMap: Map<string, WebSocket>
  ) {
    const ws = wsMap.get(player);
    if (ws) {
      this.sendMessageToPlayer(ws, {
        type: "error",
        message: errorMessage
      }).catch(error => {
        ErrorHandler.handleError(
          error as Error,
          "BroadcastManager.broadcastError",
          player
        );
      });
    }
  }
}