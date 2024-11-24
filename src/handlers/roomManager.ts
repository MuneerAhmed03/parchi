import { v4 as uuidv4 } from "uuid";
import RedisManager from "@/handlers/redisManager";
import { RoomIdGenerator } from "@/utils/roomIdGenerator";

export default class RoomManager {
  private redisManager: RedisManager;
  private roomIdGenerator: RoomIdGenerator;

  constructor() {
    this.redisManager = new RedisManager();
    this.roomIdGenerator = RoomIdGenerator.getInstance(this.redisManager)
  }

  async createRoom(playerId:string): Promise<string> {
    const roomId = await this.roomIdGenerator.generateRoomId();
    await this.redisManager.createRoom(roomId,playerId);
    return roomId;
  }

  async joinRoom(roomId: string, playerId: string): Promise<boolean> {
    // this.logCallerInfo()
    const isRoomFull = await this.redisManager.isRoomFull(roomId);
    if (isRoomFull) {
      return false;
    }
    await this.redisManager.addPlayerToRoom(roomId, playerId);
    return true;
  }
}
