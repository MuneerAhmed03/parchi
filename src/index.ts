import express from "express";
import * as http from "http";
import GameLogic from "@/handlers/gameLogic";
import RedisManager from "@/handlers/redisManager";
import RoomManager from "@/handlers/roomManager";
import WebSocketHandler from "@/websockets/sockethandler";
import BroadcastManager from "@/websockets/broadcastManager";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const server = http.createServer(app);

const redisManager = new RedisManager();
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

app.post("/create-room", async (req, res) => {
  const playerName = req.body.playerName;
  const roomId = await roomManager.createRoom(playerName);
  res.send(roomId);
});

app.post("/join-room", async (req, res) => {
  const roomId = req.body.roomId;
  const playerName = req.body.playerName;
  const success = await roomManager.joinRoom(roomId, playerName);
  res.send({ success });
});

server.on("upgrade", (req, socket, head) => {
  webSocketHandler.onUpgrade(req, socket, head);
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
