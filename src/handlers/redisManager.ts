import { createClient, RedisClientType } from "redis";
import GameState, { Player } from "@/model/gameState";
import { ErrorHandler } from "@/utils/ErrorHandler";
import { GameError } from "@/utils/GameError";
import { connect } from "http2";

export default class RedisManager {
  private client: RedisClientType;
  private static instance: RedisManager;

  private constructor() {
    // this.client = createClient();
    // this.client.connect();

    const redisUrl =
      process.env.NODE_ENV === "production"
        ? process.env.REDIS_URL
        : "redis://127.0.0.1:6379";

    if (!redisUrl) {
      throw new Error("Redis URL is not defined in the environment variables.");
    }

    this.client = createClient({
      url: redisUrl,
    });

    // Add event listeners for error handling
    this.client.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    // Connect to Redis
    this.client.connect().catch((err) => {
      console.error("Failed to connect to Redis:", err);
    });
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      this.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  async roomExists(roomId: string): Promise<boolean> {
    const exists = await this.client.exists(`room:${roomId}`);
    return exists === 1;
  }

  async createRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    instanceId:string
  ): Promise<void> {
    try {
      console.log(` player ${playerId} created the room ${roomId}`);
      await this.client
        .multi()
        .hSet(`room:${roomId}`, "state", "lobby")
        .expire(`room:${roomId}`, 1800)
        .hSet(
          `room:${roomId}:players`,
          playerId,
          JSON.stringify({
            name: playerName,
            connected: true,
            title: null,
          }),
        )
        .expire(`room:${roomId}:players`, 1800)
        .set(`room:${roomId}:affinity`,instanceId)
        .expire(`room:${roomId}:affinity`,1800)
        .exec();
    } catch (error) {
      throw ErrorHandler.handleError(
        error as Error,
        "RedisManager.createRoom",
        playerId,
      );
    }
  }

  async addPlayerToRoom(
    roomId: string,
    playerId: string,
    playerName: string,
  ): Promise<void> {
    console.log(`${playerId} added to the room`);
    const maxplayers = 4;
    const playerCount = await this.getRoomPlayerCount(roomId);

    if (playerCount > maxplayers) {
      throw new Error("Room Full");
    }

    await this.client.hSet(
      `room:${roomId}:players`,
      playerId,
      JSON.stringify({
        name: playerName,
        connected: true,
        title: null,
      }),
    );
    console.log(`${playerId} successfully added to room ${roomId}`);
  }

  // async removePlayerFromRoom(roomId: string, playerId: string): Promise<void> {
  //   await this.client.hDel(`room:${roomId}:players`, playerId);
  // }

  async getRoomPlayers(roomId: string): Promise<Player[]> {
    const players = await this.client.hGetAll(`room:${roomId}:players`);
    return Object.keys(players).map((key) => {
      const parsedVal = JSON.parse(players[key]);
      return {
        id: key,
        name: parsedVal.name,
        isConnected: parsedVal.connected,
        title: parsedVal.title,
      };
    });
  }

  async getRoomPlayerCount(roomId: string): Promise<number> {
    return await this.client.hLen(`room:${roomId}:players`);
  }

  async submitTitleAndCheck(
    roomId: string,
    title: string,
    playerId: string,
  ): Promise<boolean> {
    // console.log(`submit title and check arguments: title:${title} room:${roomId} player:${playerId}`)
    const playerData = await this.client.hGet(
      `room:${roomId}:players`,
      playerId,
    );

    if (!playerData) {
      throw new Error(`player ${playerId} doesnt exist in room ${roomId}`);
    }
    const player = JSON.parse(playerData);
    player.title = title;

    const result = await this.client
      .multi()
      .hSet(`room:${roomId}:players`, playerId, JSON.stringify(player))
      .sAdd(`room:${roomId}:titles`, title)
      .sCard(`room:${roomId}:titles`)
      .hLen(`room:${roomId}:players`)
      .exec();

    if (!result) {
      throw new Error("Redis transaction failed");
    }
    console.log("submit title query result", result);
    const [, , submittedCount, playerCount] = result;
    console.log(
      `submit title result: submitted count:${submittedCount} and playeCount:${playerCount}`,
    );
    return Number(submittedCount) === 4 && Number(playerCount) === 4;
  }

  async getTitles(roomId: string): Promise<string[]> {
    return await this.client.sMembers(`room:${roomId}:titles`);
  }

  async saveGameState(roomId: string, gameState: GameState): Promise<void> {
    await this.client.set(
      `room:${roomId}:gameState`,
      JSON.stringify(gameState),
    );
    await this.updateTtl(roomId);
  }

  async updateTtl(roomId: string) {
    await this.client
      .multi()
      .expire(`room:${roomId}:gameState`, 1800)
      .expire(`room:${roomId}`, 1800)
      .expire(`room:${roomId}:titles`, 1800)
      .expire(`room:${roomId}:players`, 1800)
      .expire(`room:${roomId}:affinity`,1800)
      .exec();
  }

  async getGameState(roomId: string): Promise<GameState> {
    try {
      console.log("game state being retrieved from redis manager:", roomId);
      const gameState = await this.client.get(`room:${roomId}:gameState`);
      if (!gameState) {
        throw new GameError("Game state not found");
      }
      return JSON.parse(gameState);
    } catch (error) {
      throw ErrorHandler.handleError(
        error as Error,
        "RedisManager.getGameState",
      );
    }
  }

  async setGameStatus(roomId: string, status: string): Promise<void> {
    await this.client.hSet(`room:${roomId}`, "state", status);
  }

  async getGameStatus(roomId: string): Promise<string> {
    return (await this.client.hGet(`room:${roomId}`, "state")) || "unknown";
  }

  async removeRoom(roomId: string): Promise<void> {
    await this.client
      .multi()
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

  async setPlayerConnection(
    playerId: string,
    roomId: string,
    isConnected: boolean,
  ): Promise<void> {
    const playerData = await this.client.hGet(
      `room:${roomId}:players`,
      playerId,
    );
    if (playerData) {
      const player = JSON.parse(playerData);
      player.connected = isConnected;
      await this.client.hSet(
        `room:${roomId}:players`,
        playerId,
        JSON.stringify(player),
      );
    }
  }

  async isPlayerConnected(playerId: string, roomId: string): Promise<boolean> {
    const playerData = await this.client.hGet(
      `room:${roomId}:players`,
      playerId,
    );
    if (!playerData) return false;

    const player = JSON.parse(playerData);
    return player.connected === true;
  }

  async getPlayerRoom(playerId: string): Promise<string | null> {
    return (await this.client.hGet("player_room", playerId)) || "unknown";
  }

  async handlePlayerDisconnect(playerId: string) {
    const roomId = await this.getPlayerRoom(playerId);
    if (roomId) {
      await this.setPlayerConnection(playerId, roomId, false);

      const connectedPlayers = (await this.getRoomPlayers(roomId)).filter(
        (player) => player.isConnected === true,
      );
      if (connectedPlayers.length == 0) {
        await this.cleanupRoom(roomId);
      }
    }
  }

  async handlePlayerLeft(roomId: string, playerId: string) {
    const players = await this.getRoomPlayers(roomId);
    const player = players.find((p) => p.id === playerId);
    if (!player) {
      throw new GameError("player who left is not in the room");
    }
    const title = player.title ?? "";
    await this.client
      .multi()
      .hDel(`room:${roomId}:players`, playerId)
      .sRem(`room:${roomId}:titles`, title)
      .exec();
    if (players.length - 1 === 0) {
      this.cleanupRoom(roomId);
    }
  }

  async replacePlayer(
    roomId: string,
    oldPlayerId: string,
    newPlayerId: string,
    newPlayerName: string,
  ): Promise<void> {
    const gameState = await this.getGameState(roomId);
    const playerIndex = gameState.players.findIndex(
      (p) => p.id === oldPlayerId,
    );
    const playerData = await this.client.hGet(
      `room:${roomId}:players`,
      oldPlayerId,
    );

    if (playerIndex === -1 || !playerData) {
      throw new GameError("Orignal player not found in game State");
    }

    const title = JSON.parse(playerData).title;

    gameState.players[playerIndex] = {
      id: newPlayerId,
      name: newPlayerName,
      isConnected: true,
    };

    await this.saveGameState(roomId, gameState);
    await this.client.hSet(
      `room:${roomId}:players`,
      newPlayerId,
      JSON.stringify({
        name: newPlayerName,
        connected: true,
        title,
      }),
    );

    await this.client.hDel(`room:${roomId}:players`, oldPlayerId);
  }

  async getDisconnectedPlayer(roomId: string): Promise<string | null> {
    const players = await this.getRoomPlayers(roomId);
    const disconnected = players.find((player) => !player.isConnected);
    return disconnected ? disconnected.id : null;
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
