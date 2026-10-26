"""Merge a resume data.json with a site overlay → resume.json ready for `php artisan resume:import`.
Usage: python3 scripts/resume/build_site_seed.py <data.json> deploy/sites/<domain>/resume"""
import json, sys
data = json.load(open(sys.argv[1])); site = sys.argv[2]
overlay = json.load(open(f"{site}/overlay.json"))
for k, v in overlay.items():
    if isinstance(v, dict) and isinstance(data.get(k), dict): data[k].update(v)
    else: data[k] = v
json.dump(data, open(f"{site}/resume.json", "w"), ensure_ascii=False, indent=1)
print(f"{site}/resume.json")
