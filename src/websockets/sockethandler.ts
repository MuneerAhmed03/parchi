import { WebSocket, WebSocketServer } from "ws";
import * as http from "http";
import RedisManager from "@/handlers/redisManager";
import BroadCastManager from "@/websockets/broadcastManager";
import GameLogic from "@/handlers/gameLogic";

export default class WebSocketHandler {
    constructor (
        private gameLogic: GameLogic,
        private redisManager: RedisManager,
        private broadcastManager: BroadCastManager
    ){}

    onUpgrade(request: http.IncomingMessage, socket: any, head: Buffer){
        const wss = new WebSocketServer({noServer: true});
        wss.handleUpgrade(req, socket, head, (ws)=>{
            this.handleConnection(ws)
        })
    }

    private handleConnection(ws: WebSocket){
        ws.on('message', as)
    }
}