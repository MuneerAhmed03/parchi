import RedisManager from "@/handlers/redisManager";

export class RoomIdGenerator {
  private static instance: RoomIdGenerator;
  private redisManager: RedisManager;
  private roomMap: Map<string, number>;
  private availableIds: string[];
  
  private static readonly CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private static readonly ID_LENGTH = 5;
  
  private constructor(redisManager: RedisManager) {
    this.redisManager = redisManager;
    this.roomMap = new Map();
    this.availableIds = [];
    
  }
  
  public static getInstance(redisManager: RedisManager): RoomIdGenerator {
    if (!RoomIdGenerator.instance) {
      this.instance = new RoomIdGenerator(redisManager);
    }
    return RoomIdGenerator.instance;
  }
  
  private generateRandomId(): string {
    let result = '';
    const charactersLength = RoomIdGenerator.CHARS.length;
    
    for (let i = 0; i < RoomIdGenerator.ID_LENGTH; i++) {
      const randomIndex = Math.floor(Math.random() * charactersLength);
      result += RoomIdGenerator.CHARS[randomIndex];
    }
    
    return result;
  }
  
  async generateRoomId(): Promise<string> {
    const maxAttempts = 100; 
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      const roomId = this.generateRandomId();
      
      if (this.roomMap.get(roomId) === 1) {
        attempts++;
        continue;
      }
      
      const exists = await this.redisManager.roomExists(roomId);
      if (!exists) {
        this.roomMap.set(roomId, 1);
        return roomId;
      }
      
      attempts++;
    }
    
    throw new Error("Failed to generate a unique room ID after maximum attempts");
  }
  
  releaseRoom(roomId: string): void {
    if (this.roomMap.get(roomId) === 1) {
      this.roomMap.set(roomId, 0);
    }
  }
  
  public static isValidRoomId(roomId: string): boolean {
    if (roomId.length !== RoomIdGenerator.ID_LENGTH) {
      return false;
    }
    
    return roomId.split('').every(char => 
      RoomIdGenerator.CHARS.includes(char)
    );
  }
}