import type {
  Card,
  Hand,
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

interface PlayerSeat {
  id: number;
  isAP: boolean;
  bankroll: number;
  replacementCount: number;
  history: number[];
  totalHandsPlayed: number;
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  totalEarned: number;
  hands: Hand[];
}

interface SimTable {
  shoe: Card[];
  runningCount: number;
  seats: PlayerSeat[];
}

function runSimulation(config: SimulationConfig) {
  const { rules, numPlayers, seatsPerTable, startingBankroll, betSpread, totalHandsToSimulate, updateInterval } = config;

  // Each simulated player (AP) gets their own independent table
  const numTables = numPlayers;

  // Initialize parallel independent tables
  const tables: SimTable[] = [];
  for (let t = 0; t < numTables; t++) {
    const tableSeats: PlayerSeat[] = [];

    // Seat 0 is the AP player (ID t)
    tableSeats.push({
      id: t,
      isAP: true,
      bankroll: startingBankroll,
      replacementCount: 0,
      history: [startingBankroll],
      totalHandsPlayed: 0,
      totalWins: 0,
      totalLosses: 0,
      totalPushes: 0,
      totalEarned: 0,
      hands: []
    });

    // Remaining seats are Ploppies (flat betting basic strategy)
    for (let p = 1; p < seatsPerTable; p++) {
      tableSeats.push({
        id: -1,
        isAP: false,
        bankroll: 1_000_000,
        replacementCount: 0,
        history: [],
        totalHandsPlayed: 0,
        totalWins: 0,
        totalLosses: 0,
        totalPushes: 0,
        totalEarned: 0,
        hands: []
      });
    }

    tables.push({
      shoe: shuffleShoe(createShoe(rules.numDecks)),
      runningCount: 0,
      seats: tableSeats
    });
  }

  let totalRuinCount = 0;
  let handsPlayed = 0;
  let sumPayouts = 0;
  let sumSquaredPayouts = 0;
  let totalRoundsPlayedCount = 0;

  // We sample bankroll history to keep message payload small
  const sampleIndices: number[] = [0];
  const maxSamples = numPlayers > 10 ? 200 : 1000; // lower sample count for high player counts to keep charts fluid
  const sampleStep = Math.max(1, Math.floor(totalHandsToSimulate / maxSamples));

  // Helper to parse spread values like '2x50' or 100
  function parseSpreadValue(val: string | number): { numHands: number; betPerHand: number } {
    if (typeof val === 'number') {
      return { numHands: 1, betPerHand: Math.max(rules.minBet, Math.min(rules.maxBet, val)) };
    }
    const str = val.trim().toLowerCase().replace('$', '');
    const match = str.match(/^(\d+)x(\d+)$/);
    if (match) {
      const numHands = parseInt(match[1], 10);
      const betPerHand = Math.max(rules.minBet, Math.min(rules.maxBet, parseInt(match[2], 10)));
      return { numHands: Math.min(2, Math.max(1, numHands)), betPerHand };
    }
    const parsedNum = parseInt(str, 10);
    const bet = isNaN(parsedNum) ? rules.minBet : Math.max(rules.minBet, Math.min(rules.maxBet, parsedNum));
    return { numHands: 1, betPerHand: bet };
  }

  // Draw card helper associated with a specific table
  function drawCard(table: SimTable): Card {
    if (table.shoe.length === 0) {
      table.shoe = shuffleShoe(createShoe(rules.numDecks));
      table.runningCount = 0;
    }
    const card = table.shoe.pop()!;
    table.runningCount += getCardCountValue(card.rank);
    return card;
  }

  // Game Loop (rounds played per player)
  while (handsPlayed < totalHandsToSimulate) {
    for (const table of tables) {
      const remainingDecksReal = table.shoe.length / 52;
      let remainingDecks = remainingDecksReal;

      if (config.roundTrueCount === 'whole') {
        remainingDecks = Math.max(1, Math.round(remainingDecksReal));
      } else if (config.roundTrueCount === 'half') {
        remainingDecks = Math.max(0.5, Math.round(remainingDecksReal * 2) / 2);
      } else if (config.roundTrueCount === 'floor') {
        remainingDecks = Math.max(0.5, Math.floor(remainingDecksReal));
      }

      const trueCount = remainingDecks > 0 ? Math.floor(table.runningCount / remainingDecks) : 0;

      // Setup bets and handle ruin/replacement for seats at this table
      let activePlayingCount = 0;
      for (const seat of table.seats) {
        if (seat.isAP) {
          if (config.wongOutMin !== null && config.wongOutMin !== undefined && trueCount <= config.wongOutMin) {
            seat.hands = [];
            continue;
          }
          activePlayingCount++;

          let spreadVal: string | number = rules.minBet;
          if (trueCount in betSpread) {
            spreadVal = betSpread[trueCount];
          } else {
            const counts = Object.keys(betSpread).map(Number).sort((a, b) => a - b);
            if (counts.length > 0) {
              if (trueCount < counts[0]) spreadVal = betSpread[counts[0]];
              else if (trueCount > counts[counts.length - 1]) spreadVal = betSpread[counts[counts.length - 1]];
              else {
                const closest = counts.filter(c => c <= trueCount).pop();
                if (closest !== undefined) spreadVal = betSpread[closest];
              }
            }
          }

          const parsedSpread = parseSpreadValue(spreadVal);
          let numHands = parsedSpread.numHands;
          let betPerHand = parsedSpread.betPerHand;
          let totalInitialBet = betPerHand * numHands;

          if (seat.bankroll < rules.minBet) {
            seat.replacementCount++;
            totalRuinCount++;
            seat.bankroll = startingBankroll;
            seat.totalEarned = 0;
          } else if (seat.bankroll < totalInitialBet) {
            const maxBetPerHand = Math.floor(seat.bankroll / numHands);
            if (maxBetPerHand >= rules.minBet) {
              betPerHand = maxBetPerHand;
            } else {
              numHands = 1;
              betPerHand = Math.min(seat.bankroll, rules.maxBet);
            }
            totalInitialBet = betPerHand * numHands;
          }

          seat.hands = [];
          for (let h = 0; h < numHands; h++) {
            seat.hands.push({
              cards: [],
              bet: betPerHand,
              isStood: false,
              isDoubled: false,
              isSplit: false,
              isBusted: false,
              isBlackjack: false,
              value: 0,
              isSoft: false,
              surrendered: false
            });
          }
          seat.bankroll -= totalInitialBet;
          seat.totalEarned -= totalInitialBet;
        } else {
          // Ploppy seat: Always bets 1 hand of minBet
          activePlayingCount++;
          seat.hands = [{
            cards: [],
            bet: rules.minBet,
            isStood: false,
            isDoubled: false,
            isSplit: false,
            isBusted: false,
            isBlackjack: false,
            value: 0,
            isSoft: false,
            surrendered: false
          }];
          seat.bankroll -= rules.minBet;
        }
      }

      // If all seats sat out on this table, burn a round
      if (activePlayingCount === 0) {
        drawCard(table); drawCard(table);
        drawCard(table); drawCard(table);
        
        if (table.shoe.length < rules.numDecks * 52 * (1 - rules.penetration)) {
          table.shoe = shuffleShoe(createShoe(rules.numDecks));
          table.runningCount = 0;
        }
        continue;
      }

      const playingSeats = table.seats.filter(s => s.hands.length > 0);

      // Deal initial cards
      for (let round = 0; round < 2; round++) {
        for (const seat of playingSeats) {
          for (const hand of seat.hands) {
            hand.cards.push(drawCard(table));
          }
        }
      }

      const dealerUpcard = drawCard(table);
      const dealerDowncard = drawCard(table);

      // Illustrious 18 Insurance deviation (APs only)
      let tookInsuranceMap: Record<number, number> = {}; // seatId -> insuranceBetAmount
      if (dealerUpcard.rank === 'A' && config.strategy === 'i18' && trueCount >= 3) {
        for (const seat of playingSeats) {
          if (seat.isAP) {
            let totalInsurance = 0;
            for (const hand of seat.hands) {
              const ins = hand.bet * 0.5;
              if (seat.bankroll >= ins) {
                seat.bankroll -= ins;
                seat.totalEarned -= ins;
                totalInsurance += ins;
              }
            }
            if (totalInsurance > 0) {
              tookInsuranceMap[seat.id] = totalInsurance;
            }
          }
        }
      }

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

      // Calculate initial score
      for (const seat of playingSeats) {
        for (const hand of seat.hands) {
          const res = calculateHandValue(hand.cards);
          hand.value = res.value;
          hand.isSoft = res.isSoft;
          if (res.value === 21) hand.isBlackjack = true;
        }
      }

      const dRes = calculateHandValue(dealerHand.cards);
      dealerHand.value = dRes.value;
      dealerHand.isSoft = dRes.isSoft;
      if (dRes.value === 21) dealerHand.isBlackjack = true;

      // Play seats
      for (const seat of playingSeats) {
        for (let hIndex = 0; hIndex < seat.hands.length; hIndex++) {
          const hand = seat.hands[hIndex];
          if (dealerHand.isBlackjack || hand.isBlackjack) {
            hand.isStood = true;
            continue;
          }

          while (!hand.isStood && !hand.isBusted && !hand.surrendered) {
            const isFreeBetGame = rules.gameType === 'free_bet';
            const canSplit =
              hand.cards.length === 2 &&
              hand.cards[0].rank === hand.cards[1].rank &&
              seat.hands.length < rules.maxSplits + 1 &&
              (isFreeBetGame || seat.bankroll >= hand.bet);

            const isI18 = seat.isAP && config.strategy === 'i18';
            const action = getBasicStrategyAction(hand, dealerUpcard.value, rules, canSplit, trueCount, isI18);

            if (action === 'Sur') {
              hand.surrendered = true;
              seat.bankroll += hand.bet * 0.5;
              seat.totalEarned += hand.bet * 0.5;
              seat.totalLosses++;
              break;
            } else if (action === 'P') {
              hand.isSplit = true;
              const isFreeSplit = isFreeBetGame && !['10', 'J', 'Q', 'K'].includes(hand.cards[0].rank);

              if (!isFreeSplit) {
                seat.bankroll -= hand.bet;
                seat.totalEarned -= hand.bet;
              }

              const splitCard = hand.cards.pop()!;

              const res1 = calculateHandValue(hand.cards);
              hand.value = res1.value;
              hand.isSoft = res1.isSoft;

              hand.cards.push(drawCard(table));
              const res1Updated = calculateHandValue(hand.cards);
              hand.value = res1Updated.value;
              hand.isSoft = res1Updated.isSoft;

              const newHand: Hand = {
                cards: [splitCard],
                bet: hand.bet,
                isFreeHand: isFreeSplit,
                isStood: false,
                isDoubled: false,
                isSplit: true,
                isBusted: false,
                isBlackjack: false,
                value: 0,
                isSoft: false,
                surrendered: false
              };

              newHand.cards.push(drawCard(table));
              const res2Updated = calculateHandValue(newHand.cards);
              newHand.value = res2Updated.value;
              newHand.isSoft = res2Updated.isSoft;

              seat.hands.push(newHand);

              if (splitCard.rank === 'A') {
                hand.isStood = true;
                newHand.isStood = true;
              }
            } else if (action === 'D') {
              const { value: handVal, isSoft: handIsSoft } = calculateHandValue(hand.cards);
              const isFreeDouble = isFreeBetGame && !handIsSoft && hand.cards.length === 2 && (handVal === 9 || handVal === 10 || handVal === 11);

              if (isFreeDouble) {
                hand.isFreeDouble = true;
                hand.isDoubled = true;
                hand.cards.push(drawCard(table));
                const doubleRes = calculateHandValue(hand.cards);
                hand.value = doubleRes.value;
                hand.isSoft = doubleRes.isSoft;
                if (hand.value > 21) hand.isBusted = true;
                hand.isStood = true;
              } else {
                const doubleBet = hand.bet;
                if (seat.bankroll >= doubleBet) {
                  seat.bankroll -= doubleBet;
                  seat.totalEarned -= doubleBet;
                  hand.isDoubled = true;
                  hand.bet += doubleBet;
                  hand.cards.push(drawCard(table));
                  const doubleRes = calculateHandValue(hand.cards);
                  hand.value = doubleRes.value;
                  hand.isSoft = doubleRes.isSoft;
                  if (hand.value > 21) hand.isBusted = true;
                  hand.isStood = true;
                } else {
                  hand.cards.push(drawCard(table));
                  const hitRes = calculateHandValue(hand.cards);
                  hand.value = hitRes.value;
                  hand.isSoft = hitRes.isSoft;
                  if (hand.value > 21) hand.isBusted = true;
                }
              }
            } else if (action === 'H') {
              hand.cards.push(drawCard(table));
              const hitRes = calculateHandValue(hand.cards);
              hand.value = hitRes.value;
              hand.isSoft = hitRes.isSoft;
              if (hand.value > 21) hand.isBusted = true;
            } else {
              hand.isStood = true;
            }
          }
        }
      }

      // Play dealer
      let allPlayersBustOrSurrendered = true;
      for (const seat of playingSeats) {
        for (const hand of seat.hands) {
          if (!hand.isBusted && !hand.surrendered) {
            allPlayersBustOrSurrendered = false;
            break;
          }
        }
      }

      if (!allPlayersBustOrSurrendered && !dealerHand.isBlackjack) {
        while (dealerHand.value < 17 || (dealerHand.value === 17 && dealerHand.isSoft && rules.hitSoft17)) {
          const nextCard = drawCard(table);
          dealerHand.cards.push(nextCard);
          const dealerRes = calculateHandValue(dealerHand.cards);
          dealerHand.value = dealerRes.value;
          dealerHand.isSoft = dealerRes.isSoft;
        }
        if (dealerHand.value > 21) dealerHand.isBusted = true;
      }

      const isFreeBetGame = rules.gameType === 'free_bet';

      // Settle payouts
      for (const seat of playingSeats) {
        let seatRoundProfit = 0;

        // Settle Insurance (AP only)
        if (seat.isAP && tookInsuranceMap[seat.id] !== undefined) {
          const insBet = tookInsuranceMap[seat.id];
          if (dealerHand.isBlackjack) {
            seat.bankroll += insBet * 3;
            seat.totalEarned += insBet * 3;
            seatRoundProfit += insBet * 2;
          } else {
            seatRoundProfit -= insBet;
          }
        }

        for (const hand of seat.hands) {
          seat.totalHandsPlayed++;
          let x = 0;

          if (hand.surrendered) {
            x = -hand.bet * 0.5;
          } else if (hand.isBusted) {
            if (!hand.isFreeHand) {
              x = -hand.bet;
            }
            seat.totalLosses++;
          } else if (dealerHand.isBlackjack) {
            if (hand.isBlackjack) {
              if (!hand.isFreeHand) {
                seat.bankroll += hand.bet;
                seat.totalEarned += hand.bet;
              }
              seat.totalPushes++;
              x = 0;
            } else {
              seat.totalLosses++;
              x = hand.isFreeHand ? 0 : -hand.bet;
            }
          } else if (hand.isBlackjack) {
            const winAmount = hand.bet * rules.payoutBlackjack;
            const payout = hand.isFreeHand ? (hand.bet + winAmount) : (hand.bet + winAmount);
            seat.bankroll += payout;
            seat.totalEarned += payout;
            seat.totalWins++;
            x = winAmount;
          } else if (isFreeBetGame && dealerHand.value === 22) {
            // Push 22 Rule: Dealer 22 pushes against all non-busted player hands (except BJ)
            if (!hand.isFreeHand) {
              seat.bankroll += hand.bet;
              seat.totalEarned += hand.bet;
            }
            seat.totalPushes++;
            x = 0;
          } else if (dealerHand.isBusted || hand.value > dealerHand.value) {
            // Player wins
            const multiplier = hand.isFreeDouble ? 2 : 1;
            const winAmount = hand.bet * multiplier;
            const payout = hand.isFreeHand ? winAmount : (hand.bet + winAmount);
            seat.bankroll += payout;
            seat.totalEarned += payout;
            seat.totalWins++;
            x = winAmount;
          } else if (hand.value < dealerHand.value) {
            // Player loses
            seat.totalLosses++;
            x = hand.isFreeHand ? 0 : -hand.bet;
          } else {
            // Push
            if (!hand.isFreeHand) {
              seat.bankroll += hand.bet;
              seat.totalEarned += hand.bet;
            }
            seat.totalPushes++;
            x = 0;
          }
          seatRoundProfit += x;
        }

        if (seat.isAP) {
          sumPayouts += seatRoundProfit;
          sumSquaredPayouts += seatRoundProfit * seatRoundProfit;
          totalRoundsPlayedCount++;
        }
      }

      // Shuffle check
      if (table.shoe.length < rules.numDecks * 52 * (1 - rules.penetration)) {
        table.shoe = shuffleShoe(createShoe(rules.numDecks));
        table.runningCount = 0;
      }
    }

    handsPlayed++;

    // Sample history
    if (handsPlayed % sampleStep === 0 || handsPlayed === totalHandsToSimulate) {
      sampleIndices.push(handsPlayed);
      for (const table of tables) {
        for (const seat of table.seats) {
          if (seat.isAP) {
            seat.history.push(seat.bankroll);
          }
        }
      }
    }

    // Progress updates
    if (handsPlayed % updateInterval === 0 || handsPlayed === totalHandsToSimulate) {
      const seatBankrolls: number[] = [];
      const seatReplacementCounts: number[] = [];
      const bankrollHistorySamples: number[][] = [];
      
      for (const table of tables) {
        for (const seat of table.seats) {
          if (seat.isAP) {
            seatBankrolls[seat.id] = seat.bankroll;
            seatReplacementCounts[seat.id] = seat.replacementCount;
            bankrollHistorySamples[seat.id] = seat.history;
          }
        }
      }

      self.postMessage({
        handsPlayed,
        seatBankrolls,
        seatReplacementCounts,
        totalRuinCount,
        runningCount: tables[0].runningCount,
        trueCount: 0,
        completed: handsPlayed === totalHandsToSimulate,
        bankrollHistorySamples,
        sampleIndices,
        sumPayouts,
        sumSquaredPayouts,
        totalRoundsPlayedCount
      } as SimulationProgress);
    }
  }
}
