import json
with open('/Users/pmlhtra/Documents/software/blackjack/knowledge/shoe_trajectory_results.json', 'r') as f:
    data = json.load(f)

for deck, stats in data.items():
    print(deck, stats)
