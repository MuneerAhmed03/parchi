import { WebSocket, WebSocketServer } from "ws";
import * as http from "http";
import RedisManager from "@/handlers/redisManager";
import BroadCastManager from "@/websockets/broadcastManager";
import GameLogic from "@/handlers/gameLogic";
import { GameError } from "@/utils/GameError";
import { ErrorHandler } from "@/utils/ErrorHandler";

export default class WebSocketHandler {
  private wsMap: Map<string, WebSocket> = new Map();
  private heartbeatInterval = 30000; // 30 seconds

  constructor(
    private gameLogic: GameLogic,
    private redisManager: RedisManager,
    private broadcastManager: BroadCastManager,
  ) {
    setInterval(this.checkConnections.bind(this), this.heartbeatInterval);
  }

  private async checkConnections(): Promise<void> {
    for (const [playerId, ws] of this.wsMap.entries()) {
      if (!this.isAlive(ws)) {
        if(!this.wsMap.has(playerId)){
          continue;
        }
        await this.handleDisconnect(playerId, ws);
      } else {
        this.ping(ws);
      }
    }
  }

  private isAlive(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN;
  }

  private ping(ws: WebSocket) {
    try {
      ws.ping();
    } catch (error) {
      console.error('Ping failed:', error);
    }
  }

  private async handleDisconnect(playerId: string, ws: WebSocket) {
    ws.terminate();
    this.wsMap.delete(playerId);
    await this.redisManager.handlePlayerDisconnect(playerId);
  }

  onUpgrade(req: http.IncomingMessage, socket: any, head: Buffer) {
    console.log("requested");
    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket) {
    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message);
        await this.handleMessage(ws, data);
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });

    ws.on("error", (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on("close", async () => {
      const playerId = this.getPlayerIdBySocket(ws);
      if (playerId) {
        await this.handleDisconnect(playerId, ws);
      }
    });

    (ws as any).isAlive = true;
  }

  private getPlayerIdBySocket(ws: WebSocket): string | undefined {
    for (const [playerId, socket] of this.wsMap.entries()) {
      if (socket === ws) return playerId;
    }
    return undefined;
  }

  private async handleMessage(ws: WebSocket, data: any) {
    try {
      switch (data.type) {
        case "join_room":
          await this.handleJoinRoom(data.roomId, data.playerId, ws);
          break;
        case "submit_title":
          console.log()
          await this.handleSubmitTitle(data.data.roomId, data.data.title, data.data.playerId);
          break;
        case "play_card":
          await this.handlePlayCard(data.roomId, data.playerId, data.cardIndex);
          break;
        case "claim_win":
          await this.handleClaimWin(data.roomId, data.playerId);
          break;
        case "room_exit":
          
        default:
          throw new GameError(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      const handledError = ErrorHandler.handleError(error as Error, 'WebSocketHandler.handleMessage', data.playerId);
      if (handledError instanceof GameError) {
        console.log("Broadcasrting error")
        this.broadcastManager.broadcastError(data.playerId, handledError.message, this.wsMap);
      } else {
        this.broadcastManager.broadcastError(data.playerId, "An unexpected error occurred", this.wsMap);
      }
    }
  }

  private async handleJoinRoom(
    roomId: string,
    playerId: string,
    ws: WebSocket,
  ) {

    this.wsMap.set(playerId, ws);
    // await this.broadcastManager.addClient(playerId, roomId, ws)

    const gameStatus = await this.redisManager.getGameStatus(roomId);

    if(gameStatus === "inProgress"){
      await this.broadcastManager.broadCastGameState(roomId,this.wsMap);
    }else{
    await this.broadcastManager.broadcastLobby(roomId, this.wsMap);
    }

  }

  private async handleSubmitTitle(roomId: string, title: string, playerId: string) {

    const allTitlesSubmitted = await this.redisManager.submitTitleAndCheck(roomId, title, playerId);
    console.log("alltitlkes submitted:", allTitlesSubmitted)
    if (allTitlesSubmitted) {
      await this.gameLogic.startGame(roomId);
      console.log("game started")
      await this.delay(2000);
      await this.broadcastManager.broadCastGameState(roomId, this.wsMap, "game_start");
    } else {
      console.log("title submit broadcast")
      this.broadcastManager.broadcastLobby(roomId,this.wsMap)
    }
  }
  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  private async handlePlayCard(
    roomId: string,
    playerId: string,
    cardIndex: number,
  ) {

    await this.gameLogic.playCard(roomId, playerId, cardIndex);;
    await this.broadcastManager.broadCastGameState(roomId, this.wsMap);
    console.log(`${playerId} passes ${cardIndex}`);
  }

  private async handleLeaveRoom(roomId:string,playerId:string){
    await this.redisManager.removePlayerFromRoom(roomId,playerId)
    this.wsMap.delete(playerId)
    const state = await this.redisManager.getGameStatus(roomId);
    if(state ===  "lobby"){
    await this.broadcastManager.broadcastLobby(roomId,this.wsMap);
  }else if(state === "running"){

  }
  }

  private async handleClaimWin(roomId: string, playerId: string) {
    const isWinner = await this.gameLogic.claimWin(roomId, playerId);
    if (isWinner) {
      const name = (await this.redisManager.getRoomPlayers(roomId)).find(obj => obj.id===playerId)?.name ||null;
      this.broadcastManager.broadCastToRoom(roomId, {
        type: "game_end",
        winner: name,
      }, this.wsMap);
      await this.redisManager.removeRoom(roomId);

    } else {
      this.broadcastManager.broadCastToRoom(roomId, {
        type: "game_continue",
        text: `${playerId} made wrong thap boink`,
      }, this.wsMap);
    }
  }
}
