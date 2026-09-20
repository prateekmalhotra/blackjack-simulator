import re
import os
import glob
import json

directory = '/Users/pmlhtra/Documents/software/blackjack/knowledge/'

def extract_numbers(filename, text):
    lines = text.split('\n')
    filtered = []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line: continue
        if re.search(r'\d', line):
            filtered.append(f"{i+1}: {line}")
    return '\n'.join(filtered)

files = glob.glob(directory + '*')
results = []
for f in files:
    if f.endswith('.json') or f.endswith('.py') or f.endswith('.txt'): continue
    with open(f, 'r') as file:
        content = file.read()
        if f.endswith('.html'):
            content = re.sub('<[^<]+>', ' ', content)
            content = re.sub(' +', ' ', content)
        results.append(f"=== {os.path.basename(f)} ===")
        results.append(extract_numbers(f, content))
        results.append("\n")

with open(directory + 'summary.txt', 'w') as out:
    out.write('\n'.join(results))
