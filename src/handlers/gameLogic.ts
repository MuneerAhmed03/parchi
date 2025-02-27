import RedisManager from "@/handlers/redisManager";
import { GameError } from "@/utils/GameError";
import { ErrorHandler } from "@/utils/ErrorHandler";

interface Chit {
  title: string;
  id: string;
}

export default class GameLogic {
  constructor(private redisManager: RedisManager) {}

  async startGame(roomId: string): Promise<void> {
    const players = await this.redisManager.getRoomPlayers(roomId);
    const titles = await this.redisManager.getTitles(roomId);
    await this.redisManager.setGameStatus(roomId, "inProgress");

    const deck = this.createDeck(titles);
    this.shuffleDeck(deck);
    const hands = this.dealHands(deck, players.length);
    // console.log("start game function", roomId);
    await this.redisManager.saveGameState(roomId, {
      players,
      hands,
      currentPlayerIndex: 0,
      gameStatus: "inProgress",
    });
  }

  async playCard(
    roomId: string,
    playerId: string,
    cardIndex: number,
  ): Promise<void> {
    try {
      const gameState = await this.redisManager.getGameState(roomId);

      if (gameState.gameStatus !== "inProgress") {
        throw new GameError("Game is not in progress");
      }

      const playerIndex = gameState.players.findIndex(
        (player) => player.id === playerId,
      );
      if (playerIndex !== gameState.currentPlayerIndex) {
        throw new GameError("Not your turn");
      }

      if (cardIndex >= gameState.hands[playerIndex].length) {
        throw new GameError("Invalid card index");
      }

      const card = gameState.hands[playerIndex][cardIndex];
      gameState.hands[playerIndex].splice(cardIndex, 1);

      const nextPlayerIndex =
        (gameState.currentPlayerIndex + 1) % gameState.players.length;
      gameState.hands[nextPlayerIndex].push(card);
      gameState.currentPlayerIndex = nextPlayerIndex;

      await this.redisManager.saveGameState(roomId, gameState);
    } catch (error) {
      throw ErrorHandler.handleError(
        error as Error,
        "GameLogic.playCard",
        playerId,
      );
    }
  }

  async claimWin(roomId: string, playerId: string): Promise<boolean> {
    const gameState = await this.redisManager.getGameState(roomId);
    const playerIndex = gameState.players.findIndex(
      (player) => player.id === playerId,
    );
    const hand = gameState.hands[playerIndex];

    if (this.verifyWin(hand)) {
      gameState.gameStatus = "finished";
      gameState.winner = playerId;
      await this.redisManager.saveGameState(roomId, gameState);
      return true;
    }
    return false;
  }

  createDeck(titles: string[]): Chit[] {
    let deck: Chit[] = [];
    titles.forEach((title) => {
      for (let i = 0; i < 4; i++) {
        deck.push({ title, id: `${title}-${i}` });
      }
    });
    return deck;
  }

  shuffleDeck(deck: Chit[]) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  dealHands(deck: Chit[], players: number) {
    const hands: Chit[][] = [];
    for (let i = 0; i < players; i++) {
      hands.push(deck.splice(0, 4));
    }
    return hands;
  }

  verifyWin(hand: Chit[]): boolean {
    return hand.every((chit) => chit.title === hand[0].title);
  }
}
