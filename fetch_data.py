import os
import sys
import json
import urllib.request
import zipfile
import subprocess
from datetime import datetime

# Ensure PyYAML is installed
try:
    import yaml
except ImportError:
    print("Installing PyYAML...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml"])
    import yaml

# Determine directory paths relative to script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ZIP_PATH = os.path.join(SCRIPT_DIR, "ccf-deadlines.zip")
EXTRACT_DIR = os.path.join(SCRIPT_DIR, "ccf-deadlines-extracted")
OUTPUT_JSON = os.path.join(SCRIPT_DIR, "conferences.json")

# Ensure directories exist
os.makedirs(SCRIPT_DIR, exist_ok=True)

# 1. Download ccf-deadlines master branch zip
if not os.path.exists(ZIP_PATH):
    print("Downloading ccf-deadlines database ZIP...")
    url = "https://github.com/ccfddl/ccf-deadlines/archive/refs/heads/master.zip"
    try:
        urllib.request.urlretrieve(url, ZIP_PATH)
        print("Download complete.")
    except Exception as e:
        print(f"Error downloading: {e}")
        sys.exit(1)
else:
    print("Using cached database ZIP...")

# 2. Extract ZIP
if not os.path.exists(EXTRACT_DIR):
    print("Extracting ZIP...")
    try:
        with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
            zip_ref.extractall(EXTRACT_DIR)
        print("Extraction complete.")
    except Exception as e:
        print(f"Error extracting: {e}")
        sys.exit(1)
else:
    print("Using cached extracted files...")

# Find the conference directory
extracted_folder_name = [d for d in os.listdir(EXTRACT_DIR) if not d.startswith('.')][0]
CONF_DIR = os.path.join(EXTRACT_DIR, extracted_folder_name, "conference")

print(f"Conference directory: {CONF_DIR}")

def parse_yaml_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        try:
            data = yaml.safe_load(f)
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            elif isinstance(data, dict):
                return data
        except Exception as e:
            print(f"YAML Parse error in {filepath}: {e}")
    return None

all_conferences = []

for root, dirs, files in os.walk(CONF_DIR):
    for file in files:
        if file.endswith(".yml") or file.endswith(".yaml"):
            if file == "types.yml":
                continue
            filepath = os.path.join(root, file)
            conf_data = parse_yaml_file(filepath)
            if conf_data and "title" in conf_data:
                # Append category based on subdirectory
                rel_dir = os.path.relpath(root, CONF_DIR)
                conf_data["category"] = rel_dir
                all_conferences.append(conf_data)

print(f"Parsed {len(all_conferences)} conferences in total.")

# 4. Filter for A/A* conferences with deadlines in June 2026 onwards
# Criteria: CCF rank == A OR CORE rank in [A*, A]
filtered_conferences = []
target_date_str = "2026-06-01"
target_date = datetime.strptime(target_date_str, "%Y-%m-%d")

for conf in all_conferences:
    # Check ranking
    rank = conf.get("rank", {})
    ccf_rank = str(rank.get("ccf", "")).upper() if rank else ""
    core_rank = str(rank.get("core", "")).upper() if rank else ""
    
    is_rank_a = (ccf_rank == "A" or core_rank in ["A*", "A"])
    if not is_rank_a:
        continue
        
    # Process conference instances (confs)
    valid_instances = []
    confs_list = conf.get("confs", [])
    if not confs_list:
        confs_list = []
        
    # Sort confs by year descending
    confs_list.sort(key=lambda x: int(x.get("year", 0)) if str(x.get("year", "")).isdigit() else 0, reverse=True)
    
    for instance in confs_list:
        timeline = instance.get("timeline", [])
        if not timeline:
            timeline = []
        has_future_deadline = False
        
        for t in timeline:
            dl_str = t.get("deadline", "") if isinstance(t, dict) else str(t)
            if dl_str.upper() == "TBD":
                yr = int(instance.get("year", 0)) if str(instance.get("year", "")).isdigit() else 0
                if yr >= 2026:
                    has_future_deadline = True
                    break
            else:
                try:
                    # Just check prefix yyyy-mm-dd
                    date_part = dl_str.split()[0]
                    dl_date = datetime.strptime(date_part, "%Y-%m-%d")
                    if dl_date >= target_date:
                        has_future_deadline = True
                        break
                except:
                    yr = int(instance.get("year", 0)) if str(instance.get("year", "")).isdigit() else 0
                    if yr >= 2026:
                        has_future_deadline = True
                        break
                        
        if has_future_deadline:
            valid_instances.append(instance)
            
    # If there are no future deadlines recorded in the YAML, project the next one
    if not valid_instances and confs_list:
        last_instance = confs_list[0]
        last_year = int(last_instance.get("year", 0)) if str(last_instance.get("year", "")).isdigit() else 0
        
        # Project a future instance
        projected_year = last_year + 1 if last_year > 0 else 2026
        if projected_year >= 2026:
            projected = {
                "year": str(projected_year),
                "id": f"{conf['title'].lower()}{str(projected_year)[2:]}",
                "link": last_instance.get("link", ""),
                "date": f"TBD, {projected_year}",
                "place": last_instance.get("place", "TBD"),
                "timezone": last_instance.get("timezone", "AoE"),
                "timeline": [
                    {
                        "deadline": "TBD",
                        "comment": "Estimated Paper Deadline"
                    }
                ],
                "projected": True
            }
            valid_instances.append(projected)

    if valid_instances:
        # Keep only the valid instances
        conf["confs"] = valid_instances
        filtered_conferences.append(conf)

print(f"Filtered to {len(filtered_conferences)} A/A* conferences with upcoming/projected deadlines.")

# Write output to JSON
with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(filtered_conferences, f, indent=2, ensure_ascii=False)

print(f"Successfully saved data to {OUTPUT_JSON}")
