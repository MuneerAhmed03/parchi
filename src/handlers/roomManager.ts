import { v4 as uuidv4 } from "uuid";
import RedisManager from "@/handlers/redisManager";
import { RoomIdGenerator } from "@/utils/roomIdGenerator";

export default class RoomManager {
  private redisManager: RedisManager;
  private roomIdGenerator: RoomIdGenerator;

  constructor() {
    this.redisManager = RedisManager.getInstance();
    this.roomIdGenerator = RoomIdGenerator.getInstance(this.redisManager)
  }

  async createRoom(playerId:string,playerName:string): Promise<string> {
    const roomId = await this.roomIdGenerator.generateRoomId();
    await this.redisManager.createRoom(roomId,playerId,playerName);
    return roomId;
  }

  async joinRoom(roomId: string, playerId: string,playerName:string): Promise<boolean> {
    const isRoomFull = await this.redisManager.isRoomFull(roomId);
    if (isRoomFull) {
      return false;
    }
    await this.redisManager.addPlayerToRoom(roomId, playerId,playerName);
    return true;
  }
}
