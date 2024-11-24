import { createClient, RedisClientType } from "redis";
import GameState from "@/model/gameState";
import { connected } from "process";

export default class RedisManager {
  private client: RedisClientType;

  constructor() {
    this.client = createClient();
    this.client.connect();
  }
  async roomExists(roomId: string): Promise<boolean> {
    const exists = await this.client.exists(`room:${roomId}`)
    return exists === 1;
  }

  async createRoom(roomId: string, playerId: string): Promise<void> {
    // await this.client.hSet(`room:${roomId}`, "state", "lobby")
    await this.client.multi()
      .hSet(`room:${roomId}`, "state", "lobby")
      .hSet(`room:${roomId}:players`, playerId,JSON.stringify({connected:"true"}))
      .exec()
  }

  async addPlayerToRoom(roomId: string, playerId: string): Promise<void> {
    console.log(`${playerId} added to the room`)
    const maxplayers = 4;
    const playerCount = await this.getRoomPlayerCount(roomId);
    
    if(playerCount > maxplayers){
      throw new Error("Room Full")
    }

    await this.client.hSet(`room:${roomId}:players`, playerId, JSON.stringify({ connected: true }));
    console.log(`${playerId} successfully added to room ${roomId}`);

  }

  async removePlayerFromRoom(roomId: string, playerId: string): Promise<void> {
    await this.client.hDel(`room:${roomId}:players`, playerId);
  }

  async getRoomPlayers(roomId: string): Promise<string[]> {
    return Object.keys(await this.client.hGetAll(`room:${roomId}:players`));
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
    const gameState = await this.client.get(`room:${roomId}:gameState`);
    if (!gameState) {
      throw new Error("Game state not found");
    }
    return JSON.parse(gameState);
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
    const playerData = await this.client.hGet(`room:${roomId}:players`,playerId);
    if(playerData){
      const player = JSON.parse(playerData);
      player.connected= isConnected;
      await this.client.hSet(`room:${roomId}:players`,playerId,JSON.stringify(player));
    }
  }

  async getConnectedPlayers(roomId: string): Promise<string[]> {
    const players = await this.client.hGetAll(`room:${roomId}:players`);
    return Object.entries(players)
      .filter(([, data]) => JSON.parse(data).connected)
      .map(([playerId]) => playerId);

  }

  async isPlayerConnected(playerId: string,roomId:string): Promise<boolean> {
    const playerData = await this.client.hGet(`room:${roomId}:players`, playerId);
    if (!playerData) return false;

    const player = JSON.parse(playerData);
    return player.connected === true;
  }

  async getPlayerRoom(playerId: string): Promise<string | null> {
    return await this.client.hGet('player_room', playerId) || "unknown";
  }

  // async cleanupConnections(): Promise<void> {
  //   const multi = this.client.multi();

  //   const rooms = await this.client.keys('room:*:connected_players');

  //   for (const roomKey of rooms) {
  //     multi.del(roomKey);
  //   }
  //   multi.del('connected_players');
  //   multi.del('player_room')
  //   // multi.del('player_rooms');

  //   await multi.exec();
  // }

  async handlePlayerDisconnect(playerId: string) {
    const roomId = await this.getPlayerRoom(playerId)
    if (roomId) {
      await this.setPlayerConnection(playerId, roomId, false);

      const connectedPlayers = await this.getConnectedPlayers(roomId)
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
