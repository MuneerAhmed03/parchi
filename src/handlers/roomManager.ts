import { v4 as uuidv4 } from "uuid";
import RedisManager from "@/handlers/redisManager";
import { RoomIdGenerator } from "@/utils/roomIdGenerator";

export default class RoomManager {
  private redisManager: RedisManager;
  private roomIdGenerator: RoomIdGenerator;

  constructor() {
    this.redisManager = RedisManager.getInstance();
    this.roomIdGenerator = RoomIdGenerator.getInstance(this.redisManager);
  }

  async createRoom(playerId: string, playerName: string): Promise<string> {
    const roomId = await this.roomIdGenerator.generateRoomId();
    const instanceId = Math.random() > 0.7 ? "instance_1" : "instance_2";
    await this.redisManager.createRoom(
      roomId,
      playerId,
      playerName,
      instanceId,
    );
    return roomId;
  }

  async joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
  ): Promise<number> {
    const exists = await this.redisManager.roomExists(roomId);
    if (!exists) {
      return 404;
    }
    const gameStatus = await this.redisManager.getGameStatus(roomId);
    if (gameStatus === "inProgress") {
      const disconnectedPlayerId =
        await this.redisManager.getDisconnectedPlayer(roomId);
      // console.log("disconnected player:",disconnectedPlayerId);
      if (disconnectedPlayerId) {
        await this.redisManager.replacePlayer(
          roomId,
          disconnectedPlayerId,
          playerId,
          playerName,
        );
        return 200;
      }
      return 400;
    }

    const isRoomFull = await this.redisManager.isRoomFull(roomId);
    if (isRoomFull) {
      console.log("room full");
      return 400;
    }
    await this.redisManager.addPlayerToRoom(roomId, playerId, playerName);
    return 200;
  }
}
