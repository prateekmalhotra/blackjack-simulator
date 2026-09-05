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
  getPogCountValue,
  getInitialPogRunningCount,
  getBasicStrategyAction
} from './blackjack';

const POG_PAYTABLE_PT2: Record<number, number> = {
  1: 3,
  2: 12,
  3: 30,
  4: 50,
  5: 100,
  6: 100,
  7: 100
};

const POG_PAYTABLE_PT1: Record<number, number> = {
  1: 3,
  2: 10,
  3: 30,
  4: 60,
  5: 100,
  6: 300,
  7: 1000
};

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
  pogRunningCount: number;
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
      pogRunningCount: getInitialPogRunningCount(rules.numDecks),
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

  // Helper to parse spread values like '2x50', '2×25', '2*10', or 100
  function parseSpreadValue(val: string | number, defaultVal: number = rules.minBet, minBound: number = 1, maxBound: number = 1000): { numHands: number; betPerHand: number } {
    if (typeof val === 'number') {
      return { numHands: 1, betPerHand: Math.max(minBound, Math.min(maxBound, val)) };
    }
    const clean = String(val).trim().toLowerCase().replace('$', '').replace(/\s+/g, '');
    const match = clean.match(/^(\d+)[xX\u00d7*](\d+)$/);
    if (match) {
      const numHands = Math.min(2, Math.max(1, parseInt(match[1], 10)));
      const betPerHand = Math.max(minBound, Math.min(maxBound, parseInt(match[2], 10)));
      return { numHands, betPerHand };
    }
    const parsedNum = parseInt(clean, 10);
    const bet = isNaN(parsedNum) ? defaultVal : Math.max(minBound, Math.min(maxBound, parsedNum));
    return { numHands: 1, betPerHand: bet };
  }

  // Draw card helper associated with a specific table
  function drawCard(table: SimTable): Card {
    if (table.shoe.length === 0) {
      table.shoe = shuffleShoe(createShoe(rules.numDecks));
      table.runningCount = 0;
      table.pogRunningCount = getInitialPogRunningCount(rules.numDecks);
      for (const s of table.seats) pogSeatedMap[s.id] = false;
    }
    const card = table.shoe.pop()!;
    table.runningCount += getCardCountValue(card.rank);
    table.pogRunningCount += getPogCountValue(card);
    return card;
  }

  const pogSeatedMap: Record<number, boolean> = {};

  // Game Loop (rounds played per player)
  while (handsPlayed < totalHandsToSimulate) {
    for (const table of tables) {
      const isPotOfGoldActive = rules.gameType === 'free_bet' || !!rules.potOfGold?.enabled;
      const remainingDecksReal = table.shoe.length / 52;
      let remainingDecks = remainingDecksReal;

      if (config.roundTrueCount === 'whole') {
        remainingDecks = Math.max(1, Math.round(remainingDecksReal));
      } else if (config.roundTrueCount === 'half') {
        remainingDecks = Math.max(0.5, Math.round(remainingDecksReal * 2) / 2);
      } else if (config.roundTrueCount === 'ceil' || config.roundTrueCount === 'floor') {
        const floorVal = Math.floor(remainingDecksReal);
        const frac = remainingDecksReal - floorVal;
        remainingDecks = Math.max(1, frac >= 0.2 ? floorVal + 1 : floorVal);
      }

      const trueCount = remainingDecks > 0 ? Math.floor(table.runningCount / remainingDecks) : 0;

      // Track round side bet state and lammers per seat
      const isSideStakedMap: Record<number, boolean> = {};
      const seatSideBetMap: Record<number, number> = {};
      const seatNumHandsMap: Record<number, number> = {};
      const seatLammersMap: Record<number, Record<number, number>> = {};

      // Setup bets and handle ruin/replacement for seats at this table
      let activePlayingCount = 0;
      for (const seat of table.seats) {
        if (seat.isAP) {
          if (isPotOfGoldActive) {
            const wongingEnabled = !!rules.potOfGold?.wonging?.enabled;
            const inRC = rules.potOfGold?.wonging?.inRC ?? 12;
            const outRC = rules.potOfGold?.wonging?.outRC ?? 20;

            if (wongingEnabled) {
              const currentlySeated = pogSeatedMap[seat.id] ?? false;
              if (!currentlySeated) {
                if (table.pogRunningCount <= inRC) {
                  pogSeatedMap[seat.id] = true;
                } else {
                  seat.hands = [];
                  continue; // Back-counting / spectating
                }
              } else {
                if (table.pogRunningCount > outRC) {
                  pogSeatedMap[seat.id] = false;
                  seat.hands = [];
                  continue; // Wonged out / left table
                }
              }
            }

            // Pot of Gold Side Bet Staking via POG2 Count
            const pog = rules.potOfGold;
            const triggerRC = pog?.triggerRC ?? 12;
            const isSideStaked = table.pogRunningCount <= triggerRC;
            isSideStakedMap[seat.id] = isSideStaked;

            let numHands = 1;
            let mainBetPerHand = rules.minBet;
            let sideBetPerHand = 0;

            if (isSideStaked) {
              const handsOnTrigger = pog?.handsOnTrigger ?? (String(pog?.triggerMainBetNotation || '').includes('2x') ? 2 : 1);
              numHands = handsOnTrigger;

              if (pog?.triggerMainBetNotation) {
                const parsed = parseSpreadValue(pog.triggerMainBetNotation, rules.minBet, 1, rules.maxBet);
                mainBetPerHand = parsed.betPerHand;
              } else if (pog?.mainBetNotation) {
                const parsed = parseSpreadValue(pog.mainBetNotation, rules.minBet, 1, rules.maxBet);
                mainBetPerHand = parsed.betPerHand;
              } else {
                mainBetPerHand = rules.minBet;
              }

              // Determine Side Bet & apply Side Bet Cap
              let rawSideBet = pog?.sideBetAmount ?? 25;
              if (pog?.sideBetNotation) {
                rawSideBet = parseSpreadValue(pog.sideBetNotation, 25, 1, 1000).betPerHand;
              }

              let effectiveCap = 1000;
              if (pog?.sideBetCapType === 'tied') {
                effectiveCap = mainBetPerHand; // Side <= Main
              } else if (pog?.sideBetCapType === '25') {
                effectiveCap = 25;
              } else if (pog?.sideBetCapType === '50') {
                effectiveCap = 50;
              } else if (pog?.sideBetCapType === '100') {
                effectiveCap = 100;
              } else if (pog?.sideBetCapType === 'custom' && pog?.sideBetCapValue !== undefined) {
                effectiveCap = pog.sideBetCapValue;
              }

              sideBetPerHand = Math.max(0, Math.min(rawSideBet, effectiveCap));
            } else {
              // Outside trigger: Base spots from start
              const handsOutside = pog?.handsOutsideTrigger ?? (String(pog?.mainBetNotation || '').includes('2x') ? 2 : 1);
              numHands = handsOutside;
              if (pog?.mainBetNotation) {
                const parsed = parseSpreadValue(pog.mainBetNotation, rules.minBet, 1, rules.maxBet);
                mainBetPerHand = parsed.betPerHand;
                if (parsed.numHands) numHands = parsed.numHands;
              } else {
                mainBetPerHand = rules.minBet;
              }
              sideBetPerHand = 0;
            }

            let totalInitialBet = numHands * (mainBetPerHand + sideBetPerHand);

            if (seat.bankroll < rules.minBet) {
              seat.replacementCount++;
              totalRuinCount++;
              seat.bankroll = startingBankroll;
              seat.totalEarned = 0;
            } else if (seat.bankroll < totalInitialBet) {
              const maxTotalPerHand = Math.floor(seat.bankroll / numHands);
              if (maxTotalPerHand >= rules.minBet) {
                mainBetPerHand = maxTotalPerHand;
                sideBetPerHand = 0;
              } else {
                numHands = 1;
                mainBetPerHand = Math.min(seat.bankroll, rules.maxBet);
                sideBetPerHand = 0;
              }
              totalInitialBet = numHands * (mainBetPerHand + sideBetPerHand);
            }

            seatNumHandsMap[seat.id] = numHands;
            seatSideBetMap[seat.id] = sideBetPerHand;

            activePlayingCount++;
            seat.hands = [];
            for (let h = 0; h < numHands; h++) {
              seat.hands.push({
                cards: [],
                bet: mainBetPerHand,
                isStood: false,
                isDoubled: false,
                isSplit: false,
                isBusted: false,
                isBlackjack: false,
                value: 0,
                isSoft: false,
                surrendered: false,
                handGroupId: h
              });
            }
            seat.bankroll -= totalInitialBet;
            seat.totalEarned -= totalInitialBet;
          } else {
            // Standard Blackjack Hi-Lo Bet Spread
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
          }
        } else {
          // Ploppy seat: Always bets 1 hand of minBet and takes all free splits/doubles
          if (seat.bankroll < rules.minBet) {
            seat.bankroll = startingBankroll;
            seat.replacementCount++;
          }
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
          table.pogRunningCount = getInitialPogRunningCount(rules.numDecks);
          for (const s of table.seats) pogSeatedMap[s.id] = false;
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

      const isFreeBetGame = rules.gameType === 'free_bet';

      // Play seats
      for (const seat of playingSeats) {
        for (let hIndex = 0; hIndex < seat.hands.length; hIndex++) {
          const hand = seat.hands[hIndex];
          if (dealerHand.isBlackjack || hand.isBlackjack) {
            hand.isStood = true;
            continue;
          }

          while (!hand.isStood && !hand.isBusted && !hand.surrendered) {
            const gId = hand.handGroupId ?? 0;
            const canSplit =
              hand.cards.length === 2 &&
              hand.cards[0].rank === hand.cards[1].rank &&
              seat.hands.filter(h => (h.handGroupId ?? 0) === gId).length < rules.maxSplits + 1 &&
              (isFreeBetGame || seat.bankroll >= hand.bet);

            const isI18 = seat.isAP && config.strategy === 'i18';
            const isSideStaked = isSideStakedMap[seat.id] || false;
            const action = getBasicStrategyAction(hand, dealerUpcard.value, rules, canSplit, trueCount, isI18, isSideStaked);

            if (action === 'Sur') {
              hand.surrendered = true;
              seat.bankroll += hand.bet * 0.5;
              seat.totalEarned += hand.bet * 0.5;
              seat.totalLosses++;
              break;
            } else if (action === 'P') {
              hand.isSplit = true;
              const isFreeSplit = isFreeBetGame && !['10', 'J', 'Q', 'K'].includes(hand.cards[0].rank);
              const gId = hand.handGroupId ?? 0;

              if (isFreeSplit) {
                if (!seatLammersMap[seat.id]) seatLammersMap[seat.id] = {};
                seatLammersMap[seat.id][gId] = (seatLammersMap[seat.id][gId] || 0) + 1;
              }

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
                surrendered: false,
                handGroupId: gId
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
              const gId = hand.handGroupId ?? 0;

              if (isFreeDouble) {
                if (!seatLammersMap[seat.id]) seatLammersMap[seat.id] = {};
                seatLammersMap[seat.id][gId] = (seatLammersMap[seat.id][gId] || 0) + 1;
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
            const winProfit = hand.isFreeDouble ? (hand.bet * 2) : hand.bet;
            const payout = hand.isFreeHand ? winProfit : (hand.bet + winProfit);
            seat.bankroll += payout;
            seat.totalEarned += payout;
            seat.totalWins++;
            x = winProfit;
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

        // Settle Pot of Gold Side Bet (per initial hand spot)
        if (isPotOfGoldActive && seat.isAP && isSideStakedMap[seat.id]) {
          const sideBetPerHand = seatSideBetMap[seat.id] || 0;
          const numSpots = seatNumHandsMap[seat.id] || 1;
          if (sideBetPerHand > 0) {
            for (let g = 0; g < numSpots; g++) {
              if (dealerHand.isBlackjack) {
                // Under Nevada rules, side bet loses to dealer natural
                seatRoundProfit -= sideBetPerHand;
              } else {
                const lammers = seatLammersMap[seat.id]?.[g] || 0;
                if (lammers === 0) {
                  seatRoundProfit -= sideBetPerHand;
                } else {
                  const lammersClamped = Math.min(7, lammers);
                  const paytable = rules.potOfGold?.paytable === 'pt1' ? POG_PAYTABLE_PT1 : POG_PAYTABLE_PT2;
                  const mult = paytable[lammersClamped] || 100;
                  const sideWin = sideBetPerHand * mult;
                  const payout = sideBetPerHand + sideWin;
                  seat.bankroll += payout;
                  seat.totalEarned += payout;
                  seatRoundProfit += sideWin;
                }
              }
            }
          }
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
        table.pogRunningCount = getInitialPogRunningCount(rules.numDecks);
        for (const s of table.seats) pogSeatedMap[s.id] = false;
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
