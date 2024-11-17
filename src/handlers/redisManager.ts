import { createClient, RedisClientType } from "redis";
import GameState from "@/model/gameState";
import { connected } from "process";

export default class RedisManager {
  private client: RedisClientType;

  constructor() {
    this.client = createClient();
    this.client.connect();
  }

  // async createRoom(roomId: string, playerId: string): Promise<void> {
  //   // await this.client.multi()
  //   //   .hSet(`room:${roomId}`, "state", "lobby")
  //   //   .sAdd(`room:${roomId}:players`, playerId)
  //   //   .exec();


  // }
  async createRoom(roomId: string,playerId:string) :Promise<void>{
    // await this.client.hSet(`room:${roomId}`, "state", "lobby")
    await this.client.multi()
                    .hSet(`room:${roomId}`, "state", "lobby")
                    .sAdd(`room:${roomId}:players`, playerId)
                    .exec()
  }

  async addPlayerToRoom(roomId: string, playerName: string): Promise<void> {
    console.log(`${playerName} added to the room`)
    await this.client.sAdd(`room:${roomId}:players`, playerName);
  }

  async removePlayerFromRoom(roomId: string, playerName: string): Promise<void> {
    await this.client.sRem(`room:${roomId}:players`, playerName);
  }

  async getRoomPlayers(roomId: string): Promise<string[]> {
    return await this.client.sMembers(`room:${roomId}:players`);
  }

  async getRoomPlayerCount(roomId: string): Promise<number> {
    return await this.client.sCard(`room:${roomId}:players`);
  }

  async submitTitleAndCheck(roomId: string, title: string): Promise<boolean> {
    const result = await this.client.multi()
      .sAdd(`room:${roomId}:titles`, title)
      .sCard(`room:${roomId}:titles`)
      .sCard(`room:${roomId}:players`)
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

  async setPlayerConnection(playerId:string, roomId:string, isConnected:boolean):Promise<void>{
    const multi = this.client.multi()

    if(isConnected){
      multi.sAdd("connected_players",playerId);
      multi.sAdd(`room:${roomId}:connected_players`,playerId)
      multi.hSet(`player_room`,playerId,roomId)
    }else{
      multi.sRem("connected_players",playerId);
      const playerRoom = await this.client.hGet('player_rooms', playerId);
      if(playerRoom){
        multi.sRem(`room:${roomId}:connected_players`,playerId)
      }
      multi.hDel(`player_room`,playerId)
    }
    await multi.exec()
  }

  async getConnectedPlayers(roomId:string):Promise<string[]>{
    return await this.client.sMembers(`room:${roomId}:connected_players`);
  }

  async isPlayerConnected(playerId: string): Promise<boolean> {
    return await this.client.sIsMember('connected_players', playerId);
  }

  async getPlayerRoom(playerId: string): Promise<string | null> {
    return await this.client.hGet('player_room', playerId) || "unknown";
  }

  async cleanupConnections(): Promise<void> {
    const multi = this.client.multi();
    
    const rooms = await this.client.keys('room:*:connected_players');
    
    for (const roomKey of rooms) {
      multi.del(roomKey);
    }
    multi.del('connected_players');
    multi.del('player_room')
    // multi.del('player_rooms');
    
    await multi.exec();
  }

  async handlePlayerDisconnect(playerId:string){
    const roomId = await this.getPlayerRoom(playerId)
    if(roomId){
      await this.setPlayerConnection(playerId, roomId, false);

      const connectedPlayers = await this.getConnectedPlayers(roomId)
      if(connectedPlayers.length == 0){
        await this.cleanupRoom(roomId)
      }
    }
  }

  async cleanupRoom(roomId:string){
    const multi = this.client.multi();
    
    multi.del(`room:${roomId}:connected_players`);
    multi.del(`room:${roomId}:players`);
    multi.del(`room:${roomId}:titles`);
    multi.del(`room:${roomId}:gameState`);
    multi.del(`room:${roomId}`);
    
    await multi.exec();
  }

}
