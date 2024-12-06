import express from "express";
import * as http from "http";
import GameLogic from "@/handlers/gameLogic";
import RedisManager from "@/handlers/redisManager";
import RoomManager from "@/handlers/roomManager";
import WebSocketHandler from "@/websockets/sockethandler";
import BroadcastManager from "@/websockets/broadcastManager";
import bodyParser from "body-parser";
import { ErrorHandler } from '@/utils/ErrorHandler';
import { GameError } from "./utils/GameError";
import { Server } from 'http';
import cors from "cors"

process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = http.createServer(app);

const redisManager = RedisManager.getInstance();
const gameLogic = new GameLogic(redisManager);
const roomManager = new RoomManager();
const broadcastManager = new BroadcastManager(redisManager);
const webSocketHandler = new WebSocketHandler(
  gameLogic,
  redisManager,
  broadcastManager,
);

app.get("/health", async (req, res) => {
  res.send("Running");
});

app.post("/create-room", async (req, res, next) => {
  try {
    const playerId = req.body.playerId;
    const playerName = req.body.playerName;
    const roomId = await roomManager.createRoom(playerId, playerName);
    res.send(roomId);
  } catch (error) {
    next(error);
  }
});

app.post("/join-room", async (req, res) => {
  const roomId = req.body.roomId;
  const playerId = req.body.playerId;
  const playerName = req.body.playerName;
  const success = await roomManager.joinRoom(roomId, playerId,playerName);
  res.send({ success });
}); 

server.on("upgrade", (req, socket, head) => {
  webSocketHandler.onUpgrade(req, socket, head);
});
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const handledError = ErrorHandler.handleError(err, 'ExpressServer');
  res.status(500).json({
    error: handledError instanceof GameError ? handledError.message : 'An unexpected error occurred'
  });
});

async function shutdown() {
  console.log('Shutting down gracefully...');
  
  // Close WebSocket connections
  await broadcastManager.cleanup();
  
  // Close Redis connection
  await redisManager.close();
  
  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}
