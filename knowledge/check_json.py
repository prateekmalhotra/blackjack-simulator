import json

with open('/Users/pmlhtra/Documents/software/blackjack/knowledge/distribution_results.json', 'r') as f:
    data = json.load(f)

aggregated = {}
for mode, mode_data in data.items():
    for count, stats in mode_data.items():
        if count not in aggregated:
            aggregated[count] = {
                'roundsPlayed': 0, 'zeroLammers': 0, 'oneLammer': 0, 'twoLammers': 0,
                'threeLammers': 0, 'fourOrMoreLammers': 0
            }
        for k in aggregated[count]:
            aggregated[count][k] += stats[k]

for count, stats in sorted(aggregated.items(), key=lambda x: int(x[0]), reverse=True):
    rounds = stats['roundsPlayed']
    if rounds == 0: continue
    p0 = stats['zeroLammers'] / rounds
    p1 = stats['oneLammer'] / rounds
    p2 = stats['twoLammers'] / rounds
    p3 = stats['threeLammers'] / rounds
    p4 = stats['fourOrMoreLammers'] / rounds
    
    # PT2 payout: 0, 3, 12, 30, 50 (assuming 4+ is 50 for this EV test)
    ev_pt2 = (p0 * -1) + (p1 * 3) + (p2 * 12) + (p3 * 30) + (p4 * 50)
    
    if int(count) in [24, 14, 13, 12]:
        print(f"Count {count}: Rds={rounds}, P0={p0:.4f}, P1={p1:.4f}, P2={p2:.4f}, P3={p3:.4f}, P4+={p4:.4f} | EV={ev_pt2:.4f}")

# Also check ground truth
print("\nCalculating Ground Truth baseline (RC=24 / Count=0):")
baseline = aggregated["24"]
rounds = baseline['roundsPlayed']
p0 = baseline['zeroLammers'] / rounds
p1 = baseline['oneLammer'] / rounds
print(f"RC=24: P(0)={p0:.6f}, P(1)={p1:.6f}")

