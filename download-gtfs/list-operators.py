import httpx
import json

with open("secrets.json") as f:
    secrets = json.load(f)

transit_url = "https://api.511.org/transit"
key511 = secrets["key511"]

with httpx.Client() as client:
    response = client.get(f"{transit_url}/gtfsoperators?format=json&api_key={key511}")
    response.raise_for_status()
    data = json.loads(response.content.decode("utf-8-sig"))

for row in data:
    print(f"{row['Id']} {row['Name']:50} {row['LastGenerated']}")

