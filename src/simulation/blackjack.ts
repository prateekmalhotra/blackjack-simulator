import type { Card, CardSuit, CardRank, Hand, GameRules } from './types';

// Card counting value mapping (Hi-Lo)
export function getCardCountValue(rank: CardRank): number {
  switch (rank) {
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
      return 1;
    case '7':
    case '8':
    case '9':
      return 0;
    case '10':
    case 'J':
    case 'Q':
    case 'K':
    case 'A':
      return -1;
  }
}

// Card rank to numeric value mapping (Ace defaults to 11)
export function getCardRankValue(rank: CardRank): number {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

// Calculate the score of a hand, adjusting Aces from 11 to 1 if the score exceeds 21
export function calculateHandValue(cards: Card[]): { value: number; isSoft: boolean } {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    value += card.value;
    if (card.rank === 'A') {
      aces++;
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  // A hand is soft if there's at least one Ace counted as 11
  const isSoft = aces > 0 && value <= 21;

  return { value, isSoft };
}

// Initialize a shoe with specified number of decks
export function createShoe(numDecks: number): Card[] {
  const suits: CardSuit[] = ['H', 'D', 'C', 'S'];
  const ranks: CardRank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const shoe: Card[] = [];

  for (let d = 0; d < numDecks; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        shoe.push({
          suit,
          rank,
          value: getCardRankValue(rank),
        });
      }
    }
  }
  return shoe;
}

// Shuffle cards using Fisher-Yates
export function shuffleShoe(shoe: Card[]): Card[] {
  const shuffled = [...shoe];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// POG2 Card Counting Value Mapping for Pot of Gold
export function getPogCountValue(card: Card): number {
  if (card.rank === 'A') return -1;
  if (card.rank === '2') return (card.suit === 'H' || card.suit === 'D') ? 1 : 0;
  if (['3', '4', '6', '7'].includes(card.rank)) return 1;
  if (['5', '8', '9'].includes(card.rank)) return 0;
  return -1; // 10, J, Q, K
}

export function getInitialPogRunningCount(numDecks: number): number {
  return 4 * numDecks; // 24 for 6 decks
}

// Action types
export type BlackjackAction = 'H' | 'S' | 'D' | 'P' | 'Sur'; // Hit, Stand, Double, Split, Surrender

export function getFreeBetStrategyAction(
  hand: Hand,
  dealerUpcardValue: number,
  rules: GameRules,
  canSplit: boolean,
  isSideStaked: boolean = false
): BlackjackAction {
  const { cards } = hand;
  const { value, isSoft } = calculateHandValue(cards);
  const dVal = dealerUpcardValue;

  // 1. Free Split Check:
  // All pairs EXCEPT 10-value cards (10, J, Q, K) are FREE SPLIT vs any upcard
  if (cards.length === 2 && cards[0].rank === cards[1].rank && canSplit) {
    const rank = cards[0].rank;
    if (['10', 'J', 'Q', 'K'].includes(rank)) {
      return 'S'; // Never split 10s
    }
    // Farm 5s when Pot of Gold side bet is active
    if (rank === '5' && isSideStaked && rules.potOfGold?.farmFives !== false) {
      return 'P';
    }
    // Free split ALL other pairs (2-9, A)
    return 'P';
  }

  // 2. Free Double Check:
  // Hard 2-card totals of 9, 10, 11 get a FREE DOUBLE vs any upcard
  if (!isSoft && cards.length === 2 && (value === 9 || value === 10 || value === 11)) {
    return 'D';
  }

  // 3. Soft Hands
  if (isSoft) {
    const nonAceValue = value - 11;
    if (nonAceValue >= 8) return 'S'; // Soft 19+ Stand
    if (nonAceValue === 7) {
      return dVal <= 8 ? 'S' : 'H'; // Soft 18 Stand vs 2-8, Hit vs 9,10,A
    }
    return 'H'; // Soft 13-17 Hit
  }

  // 4. Hard Hands
  if (value >= 17) return 'S';
  if (value <= 8) return 'H';

  // Hard 12-16: Stand vs 4-6, Hit vs 2,3,7-11
  if (value >= 12 && value <= 16) {
    return dVal >= 4 && dVal <= 6 ? 'S' : 'H';
  }

  return 'H';
}

// Basic Strategy Engine
export function getBasicStrategyAction(
  hand: Hand,
  dealerUpcardValue: number,
  rules: GameRules,
  canSplit: boolean,
  trueCount: number = 0,
  useDeviations: boolean = false,
  isSideStaked: boolean = false
): BlackjackAction {
  if (rules.gameType === 'free_bet') {
    return getFreeBetStrategyAction(hand, dealerUpcardValue, rules, canSplit, isSideStaked);
  }

  const { cards } = hand;
  const { value, isSoft } = calculateHandValue(cards);

  // Dealer upcard normalized (Ace is 11)
  const dVal = dealerUpcardValue;

  // Illustrious 18 Play Deviations
  if (useDeviations) {
    const canDouble = cards.length === 2 && (!hand.isSplit || rules.doubleAfterSplit);

    // 1. 16 vs 10: Stand if TC >= 0, otherwise Hit
    if (!isSoft && value === 16 && dVal === 10) {
      return trueCount >= 0 ? 'S' : 'H';
    }

    // 2. 15 vs 10: Stand if TC >= 4, otherwise Hit
    if (!isSoft && value === 15 && dVal === 10) {
      return trueCount >= 4 ? 'S' : 'H';
    }

    // 3. TT vs 6: Split if TC >= 4, otherwise Stand
    if (cards.length === 2 && cards[0].rank === '10' && cards[1].rank === '10' && dVal === 6 && canSplit) {
      return trueCount >= 4 ? 'P' : 'S';
    }

    // 4. TT vs 5: Split if TC >= 5, otherwise Stand
    if (cards.length === 2 && cards[0].rank === '10' && cards[1].rank === '10' && dVal === 5 && canSplit) {
      return trueCount >= 5 ? 'P' : 'S';
    }

    // 5. 10 vs 10: Double if TC >= 4, otherwise Hit
    if (!isSoft && value === 10 && dVal === 10 && canDouble) {
      return trueCount >= 4 ? 'D' : 'H';
    }

    // 6. 12 vs 4: Stand if TC >= 0, otherwise Hit
    if (!isSoft && value === 12 && dVal === 4) {
      return trueCount >= 0 ? 'S' : 'H';
    }

    // 7. 12 vs 5: Stand if TC >= -1, otherwise Hit
    if (!isSoft && value === 12 && dVal === 5) {
      return trueCount >= -1 ? 'S' : 'H';
    }

    // 8. 12 vs 6: Stand if TC >= -1, otherwise Hit
    if (!isSoft && value === 12 && dVal === 6) {
      return trueCount >= -1 ? 'S' : 'H';
    }

    // 9. 13 vs 2: Stand if TC >= -1, otherwise Hit (Deviation from basic strategy Stand)
    if (!isSoft && value === 13 && dVal === 2) {
      return trueCount >= -1 ? 'S' : 'H';
    }

    // 10. 13 vs 3: Stand if TC >= -2, otherwise Hit (Deviation from basic strategy Stand)
    if (!isSoft && value === 13 && dVal === 3) {
      return trueCount >= -2 ? 'S' : 'H';
    }

    // 11. 9 vs 2: Double if TC >= 1, otherwise Hit
    if (!isSoft && value === 9 && dVal === 2 && canDouble) {
      return trueCount >= 1 ? 'D' : 'H';
    }

    // 12. 11 vs Ace: Double if TC >= 1, otherwise Hit
    if (!isSoft && value === 11 && dVal === 11 && canDouble) {
      return trueCount >= 1 ? 'D' : 'H';
    }

    // 13. 9 vs 7: Double if TC >= 3, otherwise Hit
    if (!isSoft && value === 9 && dVal === 7 && canDouble) {
      return trueCount >= 3 ? 'D' : 'H';
    }

    // 14. 16 vs 9: Stand if TC >= 5, otherwise Hit
    if (!isSoft && value === 16 && dVal === 9) {
      return trueCount >= 5 ? 'S' : 'H';
    }

    // 15. 12 vs 3: Stand if TC >= 2, otherwise Hit
    if (!isSoft && value === 12 && dVal === 3) {
      return trueCount >= 2 ? 'S' : 'H';
    }

    // 16. 12 vs 2: Stand if TC >= 3, otherwise Hit
    if (!isSoft && value === 12 && dVal === 2) {
      return trueCount >= 3 ? 'S' : 'H';
    }

    // 17. 10 vs Ace: Double if TC >= 4 (or 3 for H17), otherwise Hit
    if (!isSoft && value === 10 && dVal === 11 && canDouble) {
      const idx = rules.hitSoft17 ? 3 : 4;
      return trueCount >= idx ? 'D' : 'H';
    }
  }

  // 1. Check for Surrender first (only on the first two cards of the hand)
  if (rules.surrenderAllowed && cards.length === 2 && !hand.isSplit) {
    if (value === 16 && [9, 10, 11].includes(dVal) && cards[0].rank !== '8') {
      return 'Sur';
    }
    if (value === 15 && dVal === 10) {
      return 'Sur';
    }
    if (rules.hitSoft17 && value === 15 && dVal === 11) {
      // H17 Surrender variation
      return 'Sur';
    }
  }

  // 2. Check for Split (must be exactly 2 cards of same rank/value and within splits limit)
  if (cards.length === 2 && cards[0].rank === cards[1].rank && canSplit) {
    const rank = cards[0].rank;

    if (rank === 'A' || rank === '8') {
      return 'P'; // Always split Aces and 8s
    }

    if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') {
      return 'S'; // Never split 10s
    }

    if (rank === '9') {
      // Split 9s vs 2-9 except 7 (stand), stand vs 10, Ace
      return dVal !== 7 && dVal <= 9 ? 'P' : 'S';
    }

    if (rank === '7') {
      return dVal <= 7 ? 'P' : 'H';
    }

    if (rank === '6') {
      // Split vs 2-6 (DAS) or 2-6 (non-DAS). Typically split vs 2-6
      return dVal <= 6 ? 'P' : 'H';
    }

    if (rank === '5') {
      // Double 5s vs 2-9, else Hit
      const canDouble = !hand.isSplit || rules.doubleAfterSplit;
      return canDouble && dVal <= 9 ? 'D' : 'H';
    }

    if (rank === '4') {
      // Split vs 5-6 only if DAS allowed, else Hit
      return rules.doubleAfterSplit && (dVal === 5 || dVal === 6) ? 'P' : 'H';
    }

    if (rank === '2' || rank === '3') {
      // Split vs 2-7, else Hit
      return dVal <= 7 ? 'P' : 'H';
    }
  }

  // 3. Check for Soft Hands
  if (isSoft) {
    const nonAceValue = value - 11; // Value of the other card(s)

    // A,8 and A,9 (Soft 19/20) always Stand
    if (nonAceValue >= 8) {
      return 'S';
    }

    // A,7 (Soft 18)
    if (nonAceValue === 7) {
      // Stand vs 2, 7, 8
      if ([2, 7, 8].includes(dVal)) return 'S';
      // Double vs 3-6, else Hit
      const canDouble = cards.length === 2 && (!hand.isSplit || rules.doubleAfterSplit);
      return canDouble && dVal >= 3 && dVal <= 6 ? 'D' : dVal >= 9 ? 'H' : 'S';
    }

    // Soft 13-17 (A,2 to A,6)
    const canDouble = cards.length === 2 && (!hand.isSplit || rules.doubleAfterSplit);
    if (nonAceValue === 6) {
      // A,6 Double vs 3-6, else Hit
      return canDouble && dVal >= 3 && dVal <= 6 ? 'D' : 'H';
    }
    if (nonAceValue === 5 || nonAceValue === 4) {
      // A,5 & A,4 Double vs 4-6, else Hit
      return canDouble && dVal >= 4 && dVal <= 6 ? 'D' : 'H';
    }
    if (nonAceValue === 3 || nonAceValue === 2) {
      // A,3 & A,2 Double vs 5-6, else Hit
      return canDouble && dVal >= 5 && dVal <= 6 ? 'D' : 'H';
    }
    if (nonAceValue === 1) {
      // Soft 12 (A,A when split is not allowed) -> Always Hit
      return 'H';
    }
  }

  // 4. Hard Hands
  if (value >= 17) {
    return 'S'; // Stand on Hard 17+
  }
  if (value <= 8) {
    return 'H'; // Hit on Hard 8-
  }

  const canDouble = cards.length === 2 && (!hand.isSplit || rules.doubleAfterSplit);

  if (value === 11) {
    // Double 11 vs 2-10, Hit vs A (H17 may double vs A, but we'll stick to S17 standard: double vs 2-10)
    return canDouble && dVal <= 10 ? 'D' : 'H';
  }
  if (value === 10) {
    // Double 10 vs 2-9, else Hit
    return canDouble && dVal <= 9 ? 'D' : 'H';
  }
  if (value === 9) {
    // Double 9 vs 3-6, else Hit
    return canDouble && dVal >= 3 && dVal <= 6 ? 'D' : 'H';
  }

  // Hard 12-16
  if (value === 12) {
    return dVal >= 4 && dVal <= 6 ? 'S' : 'H';
  }
  // Hard 13-16
  return dVal <= 6 ? 'S' : 'H';
}
