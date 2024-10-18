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

    onUpgrade(req: http.IncomingMessage, socket: any, head: Buffer){
        const wss = new WebSocketServer({noServer: true});
        wss.handleUpgrade(req, socket, head, (ws)=>{
            this.handleConnection(ws)
        })
    }

    private handleConnection(ws: WebSocket){
        ws.on('message', async(message: string) => {
            const data = JSON.parse(message);
            await this.handleMessage(ws, data);
        })
        ws.on('close',async () => {})
    }

    private async handleMessage(ws: WebSocket, data: any){
        switch(data.type){
            case 'join_room':
                await this.handleJoinRoom(data.roomId, data.playerId,ws);
                break;
            case 'submit_title':
                await this.handleSubmitTitle(data.roomId,data.title);
                break;
            case 'play_card':
                await this.handlePlayCard(data.roomId,data.playerId,data.cardIndex)
                break;
            case 'claim_win':
                await this.handleClaimWin(data.roomId,data.playerId);
        }
    }


    private async handleJoinRoom(roomId : string, playerId:string, ws:WebSocket){
        this.broadcastManager.addClient(playerId, ws);
        await this.broadcastManager.broadCastGameState(roomId);
    }

    private async handleSubmitTitle(roomId:string, title:string){
        this.redisManager.addTitle(roomId,title);
        const allTitlesSubmitted = await this.redisManager.allCardSubmitted(roomId)
        if(allTitlesSubmitted){
            this.gameLogic.startGame(roomId);
            await this.broadcastManager.broadCastGameState(roomId);
        }
    }

    private async handlePlayCard(roomId: string, playerId: string, cardIndex: number){
        await this.gameLogic.playCard(roomId,playerId,cardIndex);
        await this.broadcastManager.broadCastGameState(roomId);
    }

    private async handleClaimWin(roomId: string, playerId: string){
        const isWinner = await  this.gameLogic.claimWin(roomId, playerId);
        if(isWinner){
            this.broadcastManager.braoadCastToRoon(roomId, {
                type: 'game_end',
                winner:playerId
            });
        }
        await this.broadcastManager.broadCastGameState(roomId);
    }
}