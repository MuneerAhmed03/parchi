import { v4 as uuidv4 } from 'uuid'
import  RedisManager  from '@/handlers/redisManager'

export class RoomManager {
  private redisManager: RedisManager

  constructor() {
    this.redisManager = new RedisManager()
  }

  async createRoom(): Promise<string> {
    const roomId = uuidv4()
    await this.redisManager.createRoom(roomId)
    return roomId
  }

  async joinRoom(roomId: string, playerName: string): Promise<boolean> {
    const playerCount = await this.redisManager.getRoomPlayerCount(roomId)
    if (playerCount >= 4) {
      return false
    }
    await this.redisManager.addPlayertToRoom(roomId, playerName)
    return true
  }
}