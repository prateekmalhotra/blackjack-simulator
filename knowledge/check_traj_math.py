import json

with open('/Users/pmlhtra/Documents/software/blackjack/knowledge/shoe_trajectory_results.json', 'r') as f:
    data = json.load(f)

dist = data['distribution']
rc_gt_24 = sum(d['percentage'] for d in dist if d['rc'] > 24)
rc_21_24 = sum(d['percentage'] for d in dist if 21 <= d['rc'] <= 24)
rc_17_20 = sum(d['percentage'] for d in dist if 17 <= d['rc'] <= 20)
rc_13_16 = sum(d['percentage'] for d in dist if 13 <= d['rc'] <= 16)
rc_9_12 = sum(d['percentage'] for d in dist if 9 <= d['rc'] <= 12)
rc_le_8 = sum(d['percentage'] for d in dist if d['rc'] <= 8)

print(f"RC > 24: {rc_gt_24:.4f}%")
print(f"RC 21-24: {rc_21_24:.4f}%")
print(f"RC 17-20: {rc_17_20:.4f}%")
print(f"RC 13-16: {rc_13_16:.4f}%")
print(f"RC 9-12: {rc_9_12:.4f}%")
print(f"RC <= 8: {rc_le_8:.4f}%")
