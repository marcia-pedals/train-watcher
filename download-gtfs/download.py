import argparse
import httpx
import json
import os

parser = argparse.ArgumentParser()
parser.add_argument("operator_id")
parser.add_argument("out_dir")

args = parser.parse_args()

with open("secrets.json") as f:
    secrets = json.load(f)

transit_url = "https://api.511.org/transit"
key511 = secrets["key511"]

with httpx.Client() as client:
    response = client.get(f"{transit_url}/datafeeds?operator_id={args.operator_id}&api_key={key511}")
    response.raise_for_status()

out_dir_scoped = os.path.join(args.out_dir, args.operator_id)
os.makedirs(out_dir_scoped, exist_ok=True)
with open(os.path.join(out_dir_scoped, "data.zip"), "wb") as f:
    f.write(response.content)

