import { WebSocket, WebSocketServer } from "ws";
import * as http from "http";
import RedisManager from "@/handlers/redisManager";
import BroadCastManager from "@/websockets/broadcastManager";
import GameLogic from "@/handlers/gameLogic";
import { GameError } from "@/utils/GameError";

export default class WebSocketHandler {
  private wsMap:Map<string, WebSocket> = new Map();
  constructor(
    private gameLogic: GameLogic,
    private redisManager: RedisManager,
    private broadcastManager: BroadCastManager,
  ) {
    this.redisManager.cleanupConnections()
    setInterval(this.checkConnections.bind(this),60000)
  }

  private async checkConnections(): Promise<void> {
    for(const [playerId,ws] of this.wsMap.entries()){
      if (ws.readyState !== WebSocket.OPEN) {
        this.wsMap.delete(playerId);
        await this.redisManager.handlePlayerDisconnect(playerId);
      }
    } 
  }

  onUpgrade(req: http.IncomingMessage, socket: any, head: Buffer) {
    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket) {
    ws.on("message", async (message: string) => {
      const data = JSON.parse(message);
      await this.handleMessage(ws, data);
    });
    ws.on("close", async () => {});
  }

  private async handleMessage(ws: WebSocket, data: any) {
    try{
    switch (data.type) {
      case "join_room":
        console.log(`${data.playerId} requested to join with data as ${JSON.stringify(data)}`)
        await this.handleJoinRoom(data.roomId, data.playerId, ws);
        break;
      case "submit_title":
        await this.handleSubmitTitle(data.roomId, data.title);
        break;
      case "play_card":
        await this.handlePlayCard(data.roomId, data.playerId, data.cardIndex);
        break;
      case "claim_win":
        await this.handleClaimWin(data.roomId, data.playerId);
    }
  }catch(error){
    console.error("Error handling messgae:", error);
    if( error instanceof GameError){
      this.broadcastManager.broadcastError(data.playerId,error.message);
    }else{
      this.broadcastManager.broadcastError(data.playerId,"An unexpected error occured");
    }
  }
  }

  private async handleJoinRoom(
    roomId: string,
    playerId: string,
    ws: WebSocket,
  ) {
    this.wsMap.set(playerId,ws);
    await this.broadcastManager.addClient(playerId,roomId,ws)
    await this.broadcastManager.broadcastLobby(roomId, this.wsMap);
    // await this.broadcastManager.broadCastGameState(roomId);
  }

  private async handleSubmitTitle( roomId: string, title: string) {
      const allTitlesSubmitted = await this.redisManager.submitTitleAndCheck(roomId, title);
      if (allTitlesSubmitted) {
        await this.gameLogic.startGame(roomId);
        console.log("game started")
        await this.delay(2000);
        await this.broadcastManager.broadCastGameState(roomId,this.wsMap);
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

    await this.gameLogic.playCard(roomId, playerId, cardIndex);
    await this.broadcastManager.broadCastGameState(roomId,this.wsMap);
    console.log(`${playerId} passes ${cardIndex}`);
  }

  private async handleClaimWin(roomId: string, playerId: string) {
    const isWinner = await this.gameLogic.claimWin(roomId, playerId);
    if (isWinner) {
      this.broadcastManager.braoadCastToRoon(roomId, {
        type: "game_end",
        winner: playerId,
      });
    }
    await this.broadcastManager.broadCastGameState(roomId,this.wsMap);
  }
}
