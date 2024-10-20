import { v4 as uuidv4 } from "uuid";
import RedisManager from "@/handlers/redisManager";

export default class RoomManager {
  private redisManager: RedisManager;

  constructor() {
    this.redisManager = new RedisManager();
  }

  async createRoom(): Promise<string> {
    const roomId = uuidv4();
    await this.redisManager.createRoom(roomId);
    return roomId;
  }

  async joinRoom(roomId: string, playerName: string): Promise<boolean> {
    const isRoomFull = await this.redisManager.isRoomFull(roomId);
    if (isRoomFull) {
      return false;
    }
    await this.redisManager.addPlayerToRoom(roomId, playerName);
    return true;
  }
}
