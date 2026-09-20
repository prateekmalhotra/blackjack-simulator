import os
import glob
import re

def clean_html(text):
    return re.sub('<[^<]+>', ' ', text)

directory = '/Users/pmlhtra/Documents/software/blackjack/knowledge/'
files = glob.glob(directory + '*')

all_text = {}
for f in files:
    if f.endswith('.html'):
        with open(f, 'r') as file:
            all_text[os.path.basename(f)] = clean_html(file.read())
    elif f.endswith('.md'):
        with open(f, 'r') as file:
            all_text[os.path.basename(f)] = file.read()
    elif f.endswith('.json'):
        with open(f, 'r') as file:
            all_text[os.path.basename(f)] = file.read()

# Write to a single file
with open(directory + 'all_knowledge.txt', 'w') as out:
    for filename, content in all_text.items():
        out.write(f"=== {filename} ===\n")
        out.write(content)
        out.write("\n\n")

print("Done.")
