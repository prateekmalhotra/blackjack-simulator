import json

with open('/Users/pmlhtra/Documents/software/blackjack/knowledge/distribution_results.json', 'r') as f:
    data = json.load(f)

for mode, content in data.items():
    print(f"Mode: {mode}")
    total_rounds = 0
    trigger_rounds = 0
    trigger_hits = 0
    for count, stats in content.items():
        total_rounds += stats['roundsPlayed']
        if int(count) <= 12:
            trigger_rounds += stats['roundsPlayed']
            trigger_hits += stats['totalHits']
    print(f"Total: {total_rounds}, Trigger: {trigger_rounds}, Trigger Freq: {trigger_rounds/total_rounds:.4f}")
    print(f"Trigger Hit Rate: {trigger_hits/trigger_rounds:.4f}")

