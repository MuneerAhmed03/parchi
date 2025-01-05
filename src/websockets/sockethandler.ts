import { WebSocket, WebSocketServer } from "ws";
import * as http from "http";
import RedisManager from "@/handlers/redisManager";
import BroadCastManager from "@/websockets/broadcastManager";
import GameLogic from "@/handlers/gameLogic";
import { ErrorHandler } from "@/utils/ErrorHandler";
import MessageHandler from "./messageHandler";

export default class WebSocketHandler {
  private wsMap: Map<string, WebSocket> = new Map();
  private heartbeatInterval = 30000;
  private messageHandler: MessageHandler;

  constructor(
    private gameLogic: GameLogic,
    private redisManager: RedisManager,
    private broadcastManager: BroadCastManager,
  ) {
    this.messageHandler = new MessageHandler(
      gameLogic,
      redisManager,
      broadcastManager,
      this.wsMap
    );
    setInterval(this.checkConnections.bind(this), this.heartbeatInterval);
  }

  onUpgrade(req: http.IncomingMessage, socket: any, head: Buffer) {
    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      this.handleConnection(ws);
    });
  }

  private handleConnection(ws: WebSocket) {
    this.setupMessageHandler(ws);
    this.setupHeartbeat(ws);
    this.setupErrorHandler(ws);
    this.setupCloseHandler(ws);
  }

  private setupMessageHandler(ws: WebSocket) {
    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message);
        await this.messageHandler.handleMessage(ws, data);
      } catch (error) {
        ErrorHandler.handleError(error as Error, "WebSocketHandler.handleConnection");
      }
    });
  }

  private setupHeartbeat(ws: WebSocket) {
    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });
    (ws as any).isAlive = true;
  }

  private setupErrorHandler(ws: WebSocket) {
    ws.on("error", (error) => {
      ErrorHandler.handleError(error as Error, "WebSocketHandler.connection");
    });
  }

  private setupCloseHandler(ws: WebSocket) {
    ws.on("close", async () => {
      const playerId = this.getPlayerIdBySocket(ws);
      if (playerId) {
        await this.handleDisconnect(playerId, ws);
      }
    });
  }

  private async checkConnections(): Promise<void> {
    for (const [playerId, ws] of this.wsMap.entries()) {
      if (!this.isAlive(ws)) {
        if (this.wsMap.has(playerId)) {
          await this.handleDisconnect(playerId, ws);
        }
      } else {
        this.ping(ws);
      }
    }
  }

  private async handleDisconnect(playerId: string, ws: WebSocket) {
    ws.terminate();
    this.wsMap.delete(playerId);
    const roomId = await this.redisManager.getPlayerRoom(playerId);
    
    if (roomId) {
      await this.broadcastManager.broadCastToRoom(
        roomId,
        { type: "player_disconnect", data: playerId },
        this.wsMap
      );
    }
    await this.redisManager.handlePlayerDisconnect(playerId);
  }

  private isAlive(ws: WebSocket): boolean {
    return ws.readyState === WebSocket.OPEN;
  }

  private ping(ws: WebSocket) {
    try {
      ws.ping();
    } catch (error) {
      console.error("Ping failed:", error);
    }
  }

  private getPlayerIdBySocket(ws: WebSocket): string | undefined {
    for (const [playerId, socket] of this.wsMap.entries()) {
      if (socket === ws) return playerId;
    }
    return undefined;
  }
}
