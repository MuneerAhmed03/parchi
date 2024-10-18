import { createClient, RedisClientType } from "redis"
import GameState from "@/model/gameState";

export default class RedisManager {
    private client: RedisClientType;

    constructor() {
        this.client = createClient(),
            this.client.connect()
    }

    async createRoom(roomId: string): Promise<void> {
        await this.client.hSet(`room:${roomId}`, 'state', 'lobby');
    }

    async addPlayertToRoom(roomId: string, playerName: string): Promise<void> {
        await this.client.sAdd(`room:${roomId}:players`, playerName);
    }

    async getRoomPlayers(roomId: string): Promise<string[]> {
        return await this.client.sMembers(`room:${roomId}:players`);
    }
    
    async getRoomPlayerCount(roomId: string): Promise<number> {
        return await this.client.sCard(`room:${roomId}:players`);
    }

    async addTitle(roomId: string, title: string): Promise<boolean> {
        const exists = await this.client.sIsMember(`room:${roomId}:titles`, title);
        if (exists) {
            return false;
        }
        await this.client.sAdd(`room:${roomId}:titles`, title);
        return true;
    }

    async getTitles(roomId: string): Promise<string[]> {
        return await this.client.sMembers(`room:${roomId}:titles`);
    }

    async checkDeck(roomId: string): Promise<boolean> {
        return true;
        //checks all title submitted
    }

    async saveGameState(roomId: string, gameState: GameState): Promise<void> {
        await this.client.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
    }

    async getGameState(roomId: string): Promise<GameState> {
        const gameState = await this.client.get(`room:${roomId}:gameState`);
        if (!gameState) {
            throw new Error('Game state not found');
        }
        return JSON.parse(gameState);
    }

    async setGameStatus(roomId: string, status: string): Promise<void> {
        await this.client.hSet(`room:${roomId}`, 'state', status);
    }

    async getGameStatus(roomId: string): Promise<string> {
        return await this.client.hGet(`room:${roomId}`, 'state') || 'unknown';
    }

    async removeRoom(roomId: string): Promise<void> {
        await this.client.del(`room:${roomId}`);
        await this.client.del(`room:${roomId}:players`);
        await this.client.del(`room:${roomId}:titles`);
        await this.client.del(`room:${roomId}:gameState`);
    }

    async removePlayerFromRoom(roomId: string, playerName: string): Promise<void> {
        await this.client.sRem(`room:${roomId}:players`, playerName);
    }

    async isRoomFull(roomId: string): Promise<boolean> {
        const playerCount = await this.getRoomPlayerCount(roomId);
        return playerCount >= 4;
    }

    async close() : Promise<void> {
        await this.client.quit();
    }

}