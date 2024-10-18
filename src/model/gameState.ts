export default interface GameState {
    players: string[];
    hands: { title: string; id: string; }[][];
    currentPlayerIndex: number;
    gameStatus: string;
    winner?: string;
  }
  