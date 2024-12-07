import { createClient, RedisClientType } from "redis";
import GameState, {Player} from "@/model/gameState";
import { ErrorHandler } from '@/utils/ErrorHandler';
import { GameError } from "@/utils/GameError";

export default class RedisManager {
  private client: RedisClientType;
  private static instance :RedisManager;

  private constructor() {
    this.client = createClient();
    this.client.connect();
  }

  public static getInstance(): RedisManager{
    if(!RedisManager.instance){
      this.instance= new RedisManager
    }
    return RedisManager.instance;
  }


  async roomExists(roomId: string): Promise<boolean> {
    const exists = await this.client.exists(`room:${roomId}`)
    return exists === 1;
  }

  async createRoom(roomId: string, playerId: string, playerName: string): Promise<void> {
    try {
      await this.client.multi()
        .hSet(`room:${roomId}`, "state", "lobby")
        .hSet(`room:${roomId}:players`, playerId, JSON.stringify({
          name: playerName,
          connected: "true"
        }))
        .exec();
    } catch (error) {
      throw ErrorHandler.handleError(error as Error, 'RedisManager.createRoom', playerId);
    }
  }

  async addPlayerToRoom(roomId: string, playerId: string, playerName: string): Promise<void> {
    console.log(`${playerId} added to the room`)
    const maxplayers = 4;
    const playerCount = await this.getRoomPlayerCount(roomId);

    if (playerCount > maxplayers) {
      throw new Error("Room Full")
    }

    await this.client.hSet(`room:${roomId}:players`, playerId, JSON.stringify(
      {
        name: playerName,
        connected: true
      }));
    console.log(`${playerId} successfully added to room ${roomId}`);

  }

  async removePlayerFromRoom(roomId: string, playerId: string): Promise<void> {
    await this.client.hDel(`room:${roomId}:players`, playerId);
  }

  async getRoomPlayers(roomId: string): Promise<Player[]> {
    const players = await this.client.hGetAll(`room:${roomId}:players`)
    console.log("redis manager players:",players);
    return Object.keys(players).map((key)=>{
      const parsedVal = JSON.parse(players[key]);
      return{
        id:key,
        name:parsedVal.name,
        isConnected:parsedVal.connected
      }
    });
  }

  async getRoomPlayerCount(roomId: string): Promise<number> {
    return await this.client.hLen(`room:${roomId}:players`);
  }

  async submitTitleAndCheck(roomId: string, title: string): Promise<boolean> {
    const result = await this.client.multi()
      .sAdd(`room:${roomId}:titles`, title)
      .sCard(`room:${roomId}:titles`)
      .hLen(`room:${roomId}:players`)
      .exec();

    if (!result) {
      throw new Error("Redis transaction failed");
    }

    const [, submittedCount, playerCount] = result;
    return Number(submittedCount) === Number(playerCount);
  }

  async getTitles(roomId: string): Promise<string[]> {
    return await this.client.sMembers(`room:${roomId}:titles`);
  }

  async saveGameState(roomId: string, gameState: GameState): Promise<void> {
    await this.client.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
  }

  async getGameState(roomId: string): Promise<GameState> {
    try {
      const gameState = await this.client.get(`room:${roomId}:gameState`);
      if (!gameState) {
        throw new GameError("Game state not found");
      }
      return JSON.parse(gameState);
    } catch (error) {
      throw ErrorHandler.handleError(error as Error, 'RedisManager.getGameState');
    }
  }

  async setGameStatus(roomId: string, status: string): Promise<void> {
    await this.client.hSet(`room:${roomId}`, "state", status);
  }

  async getGameStatus(roomId: string): Promise<string> {
    return (await this.client.hGet(`room:${roomId}`, "state")) || "unknown";
  }

  async removeRoom(roomId: string): Promise<void> {
    await this.client.multi()
      .del(`room:${roomId}`)
      .del(`room:${roomId}:players`)
      .del(`room:${roomId}:titles`)
      .del(`room:${roomId}:gameState`)
      .exec();
  }

  async isRoomFull(roomId: string): Promise<boolean> {
    const playerCount = await this.getRoomPlayerCount(roomId);
    return playerCount >= 4;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async setPlayerConnection(playerId: string, roomId: string, isConnected: boolean): Promise<void> {
    const playerData = await this.client.hGet(`room:${roomId}:players`, playerId);
    if (playerData) {
      const player = JSON.parse(playerData);
      player.connected = isConnected;
      await this.client.hSet(`room:${roomId}:players`, playerId, JSON.stringify(player));
    }
  }


  async isPlayerConnected(playerId: string, roomId: string): Promise<boolean> {
    const playerData = await this.client.hGet(`room:${roomId}:players`, playerId);
    if (!playerData) return false;

    const player = JSON.parse(playerData);
    return player.connected === true;
  }

  async getPlayerRoom(playerId: string): Promise<string | null> {
    return await this.client.hGet('player_room', playerId) || "unknown";
  }

  async handlePlayerDisconnect(playerId: string) {
    const roomId = await this.getPlayerRoom(playerId)
    if (roomId) {
      await this.setPlayerConnection(playerId, roomId, false);

      const connectedPlayers = (await this.getRoomPlayers(roomId)).filter(player => player.isConnected === true)
      if (connectedPlayers.length == 0) {
        await this.cleanupRoom(roomId)
      }
    }
  }

  async cleanupRoom(roomId: string) {
    const multi = this.client.multi();
    multi.del(`room:${roomId}:players`);
    multi.del(`room:${roomId}:titles`);
    multi.del(`room:${roomId}:gameState`);
    multi.del(`room:${roomId}`);

    await multi.exec();
  }

}
