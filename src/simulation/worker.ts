import type {
  Card,
  Hand,
  PlayerSeat,
  SimulationConfig,
  SimulationProgress
} from './types';
import {
  createShoe,
  shuffleShoe,
  calculateHandValue,
  getCardCountValue,
  getBasicStrategyAction
} from './blackjack';

// Listen for config and start command
self.onmessage = (event: MessageEvent) => {
  const config = event.data as SimulationConfig;
  runSimulation(config);
};

function runSimulation(config: SimulationConfig) {
  const { rules, numPlayers, startingBankroll, betSpread, totalHandsToSimulate, updateInterval } = config;

  // Initialize Shoe
  let shoe = shuffleShoe(createShoe(rules.numDecks));
  let runningCount = 0;

  // Initialize Seats
  const seats: PlayerSeat[] = [];
  for (let i = 0; i < numPlayers; i++) {
    seats.push({
      id: i,
      name: `Player ${i + 1}`,
      bankroll: startingBankroll,
      initialBankroll: startingBankroll,
      hands: [],
      isRuined: false,
      totalHandsPlayed: 0,
      totalWins: 0,
      totalLosses: 0,
      totalPushes: 0,
      totalEarned: 0,
      replacementCount: 0,
      history: [startingBankroll]
    });
  }

  let totalRuinCount = 0;
  let handsPlayed = 0;

  // We sample bankroll history to keep message payload small
  const sampleIndices: number[] = [0];
  const maxSamples = 1000;
  const sampleStep = Math.max(1, Math.floor(totalHandsToSimulate / maxSamples));

  // Game Loop
  while (handsPlayed < totalHandsToSimulate) {
    // 1. Calculate True Count at the beginning of the round
    const remainingDecksReal = shoe.length / 52;
    let remainingDecks = remainingDecksReal;

    if (config.roundTrueCount === 'whole') {
      remainingDecks = Math.max(1, Math.round(remainingDecksReal));
    } else if (config.roundTrueCount === 'half') {
      remainingDecks = Math.max(0.5, Math.round(remainingDecksReal * 2) / 2);
    } else if (config.roundTrueCount === 'floor') {
      remainingDecks = Math.max(0.5, Math.floor(remainingDecksReal));
    }

    const trueCount = remainingDecks > 0 ? Math.floor(runningCount / remainingDecks) : 0;

    // 2. Set bets for all players and handle ruin / replacement
    for (const seat of seats) {
      // Find bet size from bet spread
      let betSize = rules.minBet;
      if (trueCount in betSpread) {
        betSize = betSpread[trueCount];
      } else {
        // Fallback: search closest matching count
        const counts = Object.keys(betSpread).map(Number).sort((a, b) => a - b);
        if (counts.length > 0) {
          if (trueCount < counts[0]) {
            betSize = betSpread[counts[0]];
          } else if (trueCount > counts[counts.length - 1]) {
            betSize = betSpread[counts[counts.length - 1]];
          } else {
            // Find closest lower count
            const closest = counts.filter(c => c <= trueCount).pop();
            if (closest !== undefined) {
              betSize = betSpread[closest];
            }
          }
        }
      }

      // Clamp bet size to table limit
      betSize = Math.max(rules.minBet, Math.min(rules.maxBet, betSize));

      // Ruin Check: player needs at least minBet to play
      if (seat.bankroll < rules.minBet || seat.bankroll < betSize) {
        seat.replacementCount++;
        totalRuinCount++;
        seat.bankroll = startingBankroll; // Replace player immediately
        seat.totalEarned = 0; // reset net profit for new player at this seat
      }

      // Setup initial hand
      seat.hands = [
        {
          cards: [],
          bet: betSize,
          isStood: false,
          isDoubled: false,
          isSplit: false,
          isBusted: false,
          isBlackjack: false,
          value: 0,
          isSoft: false,
          surrendered: false
        }
      ];
      seat.bankroll -= betSize;
      seat.totalEarned -= betSize;
    }

    // 3. Deal initial cards
    const activeSeats = seats.filter(s => !s.isRuined);
    if (activeSeats.length === 0) break;

    // Deal two cards to each player hand
    for (let round = 0; round < 2; round++) {
      for (const seat of activeSeats) {
        const card = drawCard();
        seat.hands[0].cards.push(card);
      }
    }

    // Deal two cards to dealer
    const dealerUpcard = drawCard();
    const dealerDowncard = drawCard();
    const dealerHand: Hand = {
      cards: [dealerUpcard, dealerDowncard],
      bet: 0,
      isStood: false,
      isDoubled: false,
      isSplit: false,
      isBusted: false,
      isBlackjack: false,
      value: 0,
      isSoft: false,
      surrendered: false
    };

    // Calculate initial hand values
    for (const seat of activeSeats) {
      const res = calculateHandValue(seat.hands[0].cards);
      seat.hands[0].value = res.value;
      seat.hands[0].isSoft = res.isSoft;
      if (res.value === 21) {
        seat.hands[0].isBlackjack = true;
      }
    }

    const dRes = calculateHandValue(dealerHand.cards);
    dealerHand.value = dRes.value;
    dealerHand.isSoft = dRes.isSoft;
    if (dRes.value === 21) {
      dealerHand.isBlackjack = true;
    }

    // 4. Play hands for each active player
    for (const seat of activeSeats) {
      // Loop over hands (could grow if splits occur)
      for (let hIndex = 0; hIndex < seat.hands.length; hIndex++) {
        const hand = seat.hands[hIndex];

        // If dealer has blackjack, player hand is over (check later for payout/push)
        if (dealerHand.isBlackjack) {
          hand.isStood = true;
          continue;
        }

        // If player has blackjack, stand immediately
        if (hand.isBlackjack) {
          hand.isStood = true;
          continue;
        }

        // Action loop for this hand
        while (!hand.isStood && !hand.isBusted && !hand.surrendered) {
          const canSplit =
            hand.cards.length === 2 &&
            hand.cards[0].rank === hand.cards[1].rank &&
            seat.hands.length < rules.maxSplits + 1 &&
            seat.bankroll >= hand.bet; // player needs bankroll to split

          const action = getBasicStrategyAction(hand, dealerUpcard.value, rules, canSplit);

          if (action === 'Sur') {
            hand.surrendered = true;
            seat.bankroll += hand.bet * 0.5; // Refund half of the already-deducted bet
            seat.totalEarned += hand.bet * 0.5;
            seat.totalLosses++;
            break;
          } else if (action === 'P') {
            // Split hand
            hand.isSplit = true;
            seat.bankroll -= hand.bet; // Deduct additional bet for split hand
            seat.totalEarned -= hand.bet;
            const splitCard = hand.cards.pop()!;
            
            // Adjust current hand
            const res1 = calculateHandValue(hand.cards);
            hand.value = res1.value;
            hand.isSoft = res1.isSoft;

            // Draw new card for current hand
            const newCard1 = drawCard();
            hand.cards.push(newCard1);
            const res1Updated = calculateHandValue(hand.cards);
            hand.value = res1Updated.value;
            hand.isSoft = res1Updated.isSoft;

            // Create new hand
            const newHand: Hand = {
              cards: [splitCard],
              bet: hand.bet,
              isStood: false,
              isDoubled: false,
              isSplit: true,
              isBusted: false,
              isBlackjack: false,
              value: 0,
              isSoft: false,
              surrendered: false
            };

            // Draw new card for new hand
            const newCard2 = drawCard();
            newHand.cards.push(newCard2);
            const res2Updated = calculateHandValue(newHand.cards);
            newHand.value = res2Updated.value;
            newHand.isSoft = res2Updated.isSoft;

            // Append new hand to play
            seat.hands.push(newHand);

            // Special Ace Split rule: split aces receive only one card and cannot be split or hit again
            if (splitCard.rank === 'A') {
              hand.isStood = true;
              newHand.isStood = true;
            }
          } else if (action === 'D') {
            const doubleBet = hand.bet;
            if (seat.bankroll >= doubleBet) {
              seat.bankroll -= doubleBet; // Deduct double bet
              seat.totalEarned -= doubleBet;
              hand.isDoubled = true;
              hand.bet += doubleBet;
              const nextCard = drawCard();
              hand.cards.push(nextCard);
              const doubleRes = calculateHandValue(hand.cards);
              hand.value = doubleRes.value;
              hand.isSoft = doubleRes.isSoft;
              if (hand.value > 21) {
                hand.isBusted = true;
              }
              hand.isStood = true;
            } else {
              // Not enough money to double, fall back to hit
              const nextCard = drawCard();
              hand.cards.push(nextCard);
              const hitRes = calculateHandValue(hand.cards);
              hand.value = hitRes.value;
              hand.isSoft = hitRes.isSoft;
              if (hand.value > 21) {
                hand.isBusted = true;
              }
            }
          } else if (action === 'H') {
            const nextCard = drawCard();
            hand.cards.push(nextCard);
            const hitRes = calculateHandValue(hand.cards);
            hand.value = hitRes.value;
            hand.isSoft = hitRes.isSoft;
            if (hand.value > 21) {
              hand.isBusted = true;
            }
          } else {
            // Stand
            hand.isStood = true;
          }
        }
      }
    }

    // 5. Play dealer's hand
    let allPlayersBustOrSurrendered = true;
    for (const seat of activeSeats) {
      for (const hand of seat.hands) {
        if (!hand.isBusted && !hand.surrendered) {
          allPlayersBustOrSurrendered = false;
          break;
        }
      }
    }

    if (!allPlayersBustOrSurrendered && !dealerHand.isBlackjack) {
      // Dealer draws until 17 or higher
      while (dealerHand.value < 17 || (dealerHand.value === 17 && dealerHand.isSoft && rules.hitSoft17)) {
        const nextCard = drawCard();
        dealerHand.cards.push(nextCard);
        const dealerRes = calculateHandValue(dealerHand.cards);
        dealerHand.value = dealerRes.value;
        dealerHand.isSoft = dealerRes.isSoft;
      }
      if (dealerHand.value > 21) {
        dealerHand.isBusted = true;
      }
    }

    // 6. Payout & Statistics update
    for (const seat of activeSeats) {
      for (const hand of seat.hands) {
        seat.totalHandsPlayed++;

        if (hand.surrendered) {
          // Already paid
          continue;
        }

        if (hand.isBusted) {
          seat.totalLosses++;
        } else if (dealerHand.isBlackjack) {
          if (hand.isBlackjack) {
            // Push: refund bet
            seat.bankroll += hand.bet;
            seat.totalEarned += hand.bet;
            seat.totalPushes++;
          } else {
            // Loss: already deducted
            seat.totalLosses++;
          }
        } else if (hand.isBlackjack) {
          // Won blackjack: refund bet + pay blackjack payout (e.g. 1.5x or 1.2x)
          const payout = hand.bet + (hand.bet * rules.payoutBlackjack);
          seat.bankroll += payout;
          seat.totalEarned += payout;
          seat.totalWins++;
        } else if (dealerHand.isBusted) {
          // Dealer bust, player win: refund bet + pay 1:1 win
          const payout = hand.bet * 2;
          seat.bankroll += payout;
          seat.totalEarned += payout;
          seat.totalWins++;
        } else if (hand.value > dealerHand.value) {
          // Player higher score, player win: refund bet + pay 1:1 win
          const payout = hand.bet * 2;
          seat.bankroll += payout;
          seat.totalEarned += payout;
          seat.totalWins++;
        } else if (hand.value < dealerHand.value) {
          // Dealer higher score, player loss: already deducted
          seat.totalLosses++;
        } else {
          // Push: refund bet
          seat.bankroll += hand.bet;
          seat.totalEarned += hand.bet;
          seat.totalPushes++;
        }
      }
    }

    // Increment count of total hands played
    handsPlayed++;

    // 7. Check if shoe needs reshuffle
    if (shoe.length < rules.numDecks * 52 * (1 - rules.penetration)) {
      shoe = shuffleShoe(createShoe(rules.numDecks));
      runningCount = 0;
    }

    // Sample history
    if (handsPlayed % sampleStep === 0 || handsPlayed === totalHandsToSimulate) {
      sampleIndices.push(handsPlayed);
      for (const seat of seats) {
        seat.history.push(seat.bankroll);
      }
    }

    // 8. Progress update post
    if (handsPlayed % updateInterval === 0 || handsPlayed === totalHandsToSimulate) {
      self.postMessage({
        handsPlayed,
        seatBankrolls: seats.map(s => s.bankroll),
        seatReplacementCounts: seats.map(s => s.replacementCount),
        totalRuinCount,
        runningCount,
        trueCount,
        completed: handsPlayed === totalHandsToSimulate,
        bankrollHistorySamples: seats.map(s => s.history),
        sampleIndices
      } as SimulationProgress);
    }
  }

  // Draw card helper that tracks running count
  function drawCard(): Card {
    if (shoe.length === 0) {
      shoe = shuffleShoe(createShoe(rules.numDecks));
      runningCount = 0;
    }
    const card = shoe.pop()!;
    runningCount += getCardCountValue(card.rank);
    return card;
  }
}
