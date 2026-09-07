# 🏺 Pot of Gold Advantage Play Playbook (POG2 System)

A comprehensive field manual for beating Free Bet Blackjack with the Pot of Gold side bet using the **POG2 Unbalanced Card Counting System**.

---

## 1. System Overview & The 3 Golden Rules

1. **Shoe Inception Count:**
   * Running Count begins at **$+24$** for a fresh 6-deck shoe ($4 \times \text{numDecks}$).
2. **The Staking Trigger:**
   * Place the Pot of Gold side bet whenever the **Running Count is $\le \mathbf{12}$**.
   * *No division by remaining decks (True Count) is required—the pivot is fixed at 12!*
3. **The 5,5 "Farming" Rule:**
   * When the side bet is active, **always Free Split a pair of 5s** instead of taking the Free Double.
   * This creates 2 separate hands starting with 5s, harvesting multi-lammer chains ($30:1$ to $100:1$).

---

## 2. POG2 Card Tags & Logic

| Card Rank | Tag | Why it belongs in this bucket |
| :--- | :---: | :--- |
| **A, 10, J, Q, K** | **−1** | **Kryptonite:** 10s cannot free-split, create dead totals (12–20), kill split chains, and cause dealer blackjacks (which wipe out all side bets under Nevada rules). Aces cannot free-double (only hard totals double) and split once. |
| **3, 4, 6, 7** | **+1** | **Pure Fuel:** All pairs split for free ($3,3, 4,4, 6,6, 7,7$), combine to form hard 9, 10, 11 free doubles ($3+6=9, 3+7=10, 4+6=10, 4+7=11$), and fuel long multi-lammer chains. |
| **Red 2 (♥/♦)** | **+1** | **Parity Anchor:** A deuce has an ideal weight of $+0.82$. Tagging Red 2s as $+1$ and Black 2s as $0$ averages out to $+0.50$ per deuce, locking the pivot at 12 without deck division. |
| **Black 2 (♠/♣)** | **0** | Part of the deuce half-tag parity anchor. |
| **5** | **0** | **The 5 Paradox:** $5+5=10$ is already a free double. The split and double routes collide on the same hand (redundancy), reducing its marginal value. Rounding to 0 eliminates mental fatigue. |
| **8, 9** | **0** | High proportion of dead totals (8+4 to 8+7 and 9+3 to 9+7 exceed 11). Net values round to 0. |

---

## 3. Paytables & Payouts ($25 Side Bet)

| Lammers Collected | Pay Table 2 (PT2) | Pay Table 1 (Jackpot) | $25 Bet Payout (PT2) | $25 Bet Payout (PT1) |
| :---: | :---: | :---: | :---: | :---: |
| **1 Lammer** | 3 : 1 | 3 : 1 | **$75** | **$75** |
| **2 Lammers** | **12 : 1** ⭐ | 10 : 1 | **$300** | **$250** |
| **3 Lammers** | 30 : 1 | 30 : 1 | **$750** | **$750** |
| **4 Lammers** | 50 : 1 | 60 : 1 | **$1,250** | **$1,500** |
| **5 Lammers** | 100 : 1 | 100 : 1 | **$2,500** | **$2,500** |
| **6 Lammers** | 100 : 1 | 300 : 1 | **$2,500** | **$7,500** |
| **7 Lammers (Max)** | 100 : 1 | **1,000 : 1** 🏆 | **$2,500** | **$25,000** |

> [!NOTE]
> **PT2 vs. PT1:** PT2 is mathematically superior (+1.17% better edge, 40% less variance) because the workhorse **2-lammer rung pays 12:1 instead of 10:1** (fires 1 in 32 trigger hands!).

---

## 4. Casino Staking Tactics

### A. Tied Staking (Raise Main on Trigger — "Side $\le$ Main")
Use when table rules state the side bet cannot exceed the main wager:
* **Outside Trigger ($\text{RC} > 12$):** Bet **$10 Main / $0 Side**.
* **Inside Trigger ($\text{RC} \le 12$):** Raise to **$25 Main / $25 Side**.
* **Camouflage:** Raising main bets on small cards confuses casino surveillance—you appear to be an unsophisticated gambler on a hunch!
* **Net Profit:** **+$19.01 / 100 rounds** (+$46.77/hr heads-up).

### B. The 2-Player Team Method (Spotter & Striker)
Bypasses the "2x table minimum to play 2 hands" penalty:
* **Player 1 (Spotter):** Sits at table, bets $10 table minimum on 1 spot, keeps count from 24.
* **Player 2 (Striker):** Chills nearby. When count hits $\text{RC} \le 12$, Player 1 gives a subtle signal (e.g. moving drink or touching rail).
* **Execution:** Player 2 sits down in adjacent chair and drops **$10 Main + $25 Side**. Player 1 also places **$10 Main + $25 Side**.
* **Net Profit:** **+$81.12/hr** (3-player table) to **+$191.88/hr** (heads-up)!

### C. Back-Counting / Wonging
* **Wong-In:** Spectate without betting until **$\text{RC} \le 12$**.
* **Wong-Out:** Leave table when **$\text{RC} > 16$ or $20$** (or upon shoe shuffle).

---

## 5. The D10 Break-Even vs. D12 Staking Trigger

In advantage play terminology, **"D"** stands for **"Down"** (cards counted down from shoe inception):
* **D10 = Down 10** ($\text{RC} = 14$, or Count $-10$ from zero).
* **D12 = Down 12** ($\text{RC} = 12$, or Count $-12$ from zero).

### Why D10 is the Break-Even Line:
* At a fresh shuffle (Count $0$ / $\text{RC} = 24$), the Pot of Gold carries a massive **$-13.53\%$ house edge**.
* As 10s and Aces exit, that house advantage steadily erodes.
* **At D10 (Count $-10$ / $\text{RC} = 14$): The house edge hits $\approx 0.00\%$!** 
  * With Fives Farming active, the player edge is **$-0.57\%$ to $+0.47\%$** (virtually a dead-even coin flip, losing only ~$\approx \$0.14$ to $\$0.25$ per $\$25$ bet).
  * At **D11 (Count $-11$ / $\text{RC} = 13$):** The edge crosses into positive territory (**$+0.43\%$ to $+1.63\%$**).

### Why the Playbook Triggers at D12 instead of D10:
If the house edge disappears at D10, why does Rule 2 demand waiting until **D12 ($\text{RC} \le 12$)**?
1. **Mandatory Main Bet Drag:** On your own spot, table rules require a Main Bet. On 6:5 Free Bet BJ, the main bet carries a **$-1.5\%$ to $-1.8\%$ house edge** ($-\$0.15$ to $-\$0.18$ per $\$10$ bet). At D10, a $0.0\%$ side bet does not overcome this table tax—your round EV is still negative. At **D12**, the side bet generates **$+4.11\%$ EV** ($+\$1.03$ on $\$25$), easily overcoming the main bet loss to yield a net session profit of **+$0.88/hand**.
2. **Variance Compensation:** Pot of Gold has an 82% loss rate and 18% hit rate. APs never take on heavy side bet variance for a $0\%$ edge; you demand at least **$+3\%$ to $+4\%$ buffer** before risking bankroll capital.
3. **The "Friendly Spot" Exception:** If you use the stealth tactic of placing $25 on an adjacent friendly player's side bet spot (where **they pay the main bet** and you have **zero main bet drag**), D10 is an exact 50/50 break-even game, and D11/D12 delivers pure un-taxed $+EV$!

