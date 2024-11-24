import RedisManager from "@/handlers/redisManager";

export class RoomIdGenerator {
    private static instance: RoomIdGenerator;
    private redisManager: RedisManager;
    private roomMap: Map<string, number>;
    private availableIds: string[]

    private constructor(redisManager: RedisManager) {
        this.redisManager = redisManager;
        this.roomMap = new Map();
        this.availableIds = [];

        for (let i = 1000; i <= 9999; i++) {
            const id = i.toString()
            this.roomMap.set(id, 0);
            this.availableIds.push(id)
        }
    }

    public static getInstance(redisManager: RedisManager): RoomIdGenerator {
        if (!RoomIdGenerator.instance) {
            this.instance = new RoomIdGenerator(redisManager);

        }
        return RoomIdGenerator.instance;
    }

    async generateRoomId(): Promise<string> {
        if (this.availableIds.length === 0) {
            throw new Error("No rooms avaialable");
        }

        const roomIndex = Math.floor(Math.random() * this.availableIds.length);
        const roomId = this.availableIds[roomIndex];

        this.availableIds[roomIndex] = this.availableIds[this.availableIds.length - 1];
        this.availableIds.pop();

        const exists = await this.redisManager.roomExists(roomId);
        if (!exists) {
            this.roomMap.set(roomId, 1);
            return roomId
        }

        this.roomMap.set(roomId, 1);
        return this.generateRoomId();
    }

    releaseRoom(roomId: string): void {
        if (this.roomMap.get(roomId) === 1) {
            this.roomMap.set(roomId, 0);
            this.availableIds.push(roomId)
        }
    }

} 