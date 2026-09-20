import json

# Check the trigger_zone_expectations arithmetic
p0 = 0.8166
p1 = 0.1599
p2 = 0.0167
p3 = 0.0052
p4 = 0.0011
p5_plus = 0.0005

ev = (p0 * -1) + (p1 * 3) + (p2 * 12) + (p3 * 30) + (p4 * 50) + (p5_plus * 100)
print(f"Trigger Zone EV recalculation: {ev:.4f} (Doc claims +0.1091)")
print(f"Sum of probabilities: {p0+p1+p2+p3+p4+p5_plus:.4f}")
print(f"Net EV per $25 hand: ${25 * ev:.4f} (Doc claims $2.73)")

