export type CardSuit = 'H' | 'D' | 'C' | 'S'; // Hearts, Diamonds, Clubs, Spades
export type CardRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: CardSuit;
  rank: CardRank;
  value: number; // 2-11 (Ace default to 11, adjusted during hand calculation)
}

export interface Hand {
  cards: Card[];
  bet: number;
  isStood: boolean;
  isDoubled: boolean;
  isFreeDouble?: boolean;
  isFreeHand?: boolean;
  isSplit: boolean;
  isBusted: boolean;
  isBlackjack: boolean;
  value: number;
  isSoft: boolean;
  surrendered: boolean;
  handGroupId?: number; // 0 or 1 (identifies which initial hand spot this originated from)
}

export interface PlayerSeat {
  id: number;
  name: string;
  bankroll: number;
  initialBankroll: number;
  hands: Hand[];
  isRuined: boolean;
  totalHandsPlayed: number;
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  totalEarned: number; // net profit/loss
  replacementCount: number; // number of times player at this seat has been replaced
  history: number[]; // sampled bankroll history
}

export interface PotOfGoldConfig {
  enabled: boolean;
  paytable: 'pt2' | 'pt1'; // PT2 (3/12/30/50/100) or PT1 (Jackpot 3/10/30/60/100/300/1000)
  handsOnTrigger?: 1 | 2; // 1 hand vs 2 hands (2 hands automatically requires 2x min bet)
  sideBetAmount: number; // e.g. 25
  sideBetCapType?: 'none' | 'tied' | '25' | '50' | '100' | 'custom';
  sideBetCapValue?: number; // numeric cap when custom or fixed
  mainBetNotation?: string | number;
  triggerMainBetNotation?: string | number; // e.g. "25" or "2x25"
  raiseMainOnTrigger?: boolean; // true = raise main bet during trigger window
  sideBetNotation?: string | number;
  triggerRC: number; // default 12 for 6 decks
  farmFives: boolean; // true = split 5s when side bet is active
  wonging?: {
    enabled: boolean;
    inRC: number; // e.g. 12
    outRC: number; // e.g. 20
  };
}

export interface GameRules {
  numDecks: number;
  hitSoft17: boolean; // true = H17 (dealer hits soft 17), false = S17 (dealer stands)
  payoutBlackjack: number; // 1.5 for 3:2, 1.2 for 6:5
  doubleAfterSplit: boolean; // DAS
  maxSplits: number; // maximum times we can split (e.g. 3 splits for 4 hands total)
  surrenderAllowed: boolean; // Late surrender
  penetration: number; // fraction of shoe played before shuffle (e.g., 0.75)
  minBet: number;
  maxBet: number;
  gameType?: 'standard' | 'free_bet';
  potOfGold?: PotOfGoldConfig;
}

export interface SimulationConfig {
  rules: GameRules;
  numPlayers: number;
  startingBankroll: number;
  betSpread: Record<number, string | number>; // True Count -> Bet Size multiplier/absolute bet or multi-hand notation (e.g. 2x50)
  totalHandsToSimulate: number;
  updateInterval: number; // batch size for progress updates
  roundTrueCount: 'whole' | 'half' | 'floor' | 'ceil'; // true count rounding rule
  wongOutMin: number | null;
  seatsPerTable: number;
  strategy: 'basic' | 'i18';
}

export interface SimulationProgress {
  handsPlayed: number;
  seatBankrolls: number[];
  seatReplacementCounts: number[];
  totalRuinCount: number;
  runningCount: number;
  trueCount: number;
  completed: boolean;
  bankrollHistorySamples: number[][]; // [handIndex][] for each player
  sampleIndices: number[]; // the hand indices corresponding to the history samples
  sumPayouts: number;
  sumSquaredPayouts: number;
  totalRoundsPlayedCount: number;
}
