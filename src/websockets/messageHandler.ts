import { WebSocket } from "ws";
import RedisManager from "@/handlers/redisManager";
import BroadCastManager from "@/websockets/broadcastManager";
import GameLogic from "@/handlers/gameLogic";
import { GameError } from "@/utils/GameError";
import { ErrorHandler } from "@/utils/ErrorHandler";

export default class MessageHandler {
  constructor(
    private gameLogic: GameLogic,
    private redisManager: RedisManager,
    private broadcastManager: BroadCastManager,
    private wsMap: Map<string, WebSocket>,
  ) {}

  async handleMessage(ws: WebSocket, data: any) {
    try {
      switch (data.type) {
        case "join_room":
          await this.handleJoinRoom(data.roomId, data.playerId, ws);
          break;
        case "submit_title":
          await this.handleSubmitTitle(
            data.data.roomId,
            data.data.title,
            data.data.playerId,
          );
          break;
        case "play_card":
          await this.handlePlayCard(data.roomId, data.playerId, data.cardIndex);
          break;
        case "claim_win":
          await this.handleClaimWin(data.roomId, data.playerId);
          break;
        case "room_exit":
          await this.handleLeaveRoom(data.roomId, data.playerId);
          break;
        case "restart":
          await this.handleGameRestart(data.roomId);
          break;
        default:
          throw new GameError(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      this.handleMessageError(error as Error, data.playerId);
    }
  }

  private async handleJoinRoom(
    roomId: string,
    playerId: string,
    ws: WebSocket,
  ) {
    this.wsMap.set(playerId, ws);
    const gameStatus = await this.redisManager.getGameStatus(roomId);

    if (gameStatus === "inProgress") {
      await this.broadcastManager.broadCastGameState(roomId, this.wsMap);
      const playerName = (await this.redisManager.getRoomPlayers(roomId)).find(
        (p) => p.id === playerId,
      )?.name;
      await this.broadcastManager.broadCastToRoom(
        roomId,
        { type: "player_joined", data: playerName },
        this.wsMap,
      );
    } else {
      await this.broadcastManager.broadcastLobby(roomId, this.wsMap);
    }
  }

  private async handleSubmitTitle(
    roomId: string,
    title: string,
    playerId: string,
  ) {
    const allTitlesSubmitted = await this.redisManager.submitTitleAndCheck(
      roomId,
      title,
      playerId,
    );

    if (allTitlesSubmitted) {
      await this.gameLogic.startGame(roomId);
      await this.delay(2000);
      await this.broadcastManager.broadCastGameState(
        roomId,
        this.wsMap,
        "game_start",
      );
    } else {
      await this.broadcastManager.broadcastLobby(roomId, this.wsMap);
    }
  }

  private async handlePlayCard(
    roomId: string,
    playerId: string,
    cardIndex: number,
  ) {
    await this.gameLogic.playCard(roomId, playerId, cardIndex);
    await this.broadcastManager.broadCastGameState(roomId, this.wsMap);
  }

  private async handleLeaveRoom(roomId: string, playerId: string) {
    this.wsMap.delete(playerId);
    const state = await this.redisManager.getGameStatus(roomId);

    if (state === "lobby") {
      await this.redisManager.handlePlayerLeft(roomId, playerId);
      await this.broadcastManager.broadcastLobby(roomId, this.wsMap);
    } else if (state === "inProgress") {
      // console.log(`${playerId} left room from handle leave room`)
      await this.redisManager.handlePlayerDisconnect(playerId);
      await this.broadcastManager.broadCastToRoom(
        roomId,
        { type: "player_left", data: playerId },
        this.wsMap,
      );
    }
  }

  private async handleGameRestart(roomId: string) {
    await this.gameLogic.startGame(roomId);
    await this.delay(2000);
    await this.broadcastManager.broadCastGameState(
      roomId,
      this.wsMap,
      "game_start",
    );
  }

  private async handleClaimWin(roomId: string, playerId: string) {
    const isWinner = await this.gameLogic.claimWin(roomId, playerId);

    if (isWinner) {
      const players = await this.redisManager.getRoomPlayers(roomId);
      const winner = players.find((p) => p.id === playerId);
      await this.broadcastManager.broadCastToRoom(
        roomId,
        { type: "game_end", winner: winner?.name || null },
        this.wsMap,
      );
    } else {
      await this.broadcastManager.broadCastToRoom(
        roomId,
        { type: "wrong_claim", text: `${playerId} made wrong thap boink` },
        this.wsMap,
      );
    }
  }

  private handleMessageError(error: Error, playerId: string) {
    const handledError = ErrorHandler.handleError(
      error,
      "MessageHandler.handleMessage",
      playerId,
    );

    if (handledError instanceof GameError) {
      this.broadcastManager.broadcastError(
        playerId,
        handledError.message,
        this.wsMap,
      );
    } else {
      this.broadcastManager.broadcastError(
        playerId,
        "An unexpected error occurred",
        this.wsMap,
      );
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
