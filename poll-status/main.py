import datetime
import json
import httpx
import os
import time

with open("secrets.json") as f:
    secrets = json.load(f)

transit_url = "https://api.511.org/transit"
key511 = secrets["key511"]

def maybe_dump_minute_date(client, resource):
    dt = datetime.datetime.now()
    folder = f"data/{resource}/{dt.strftime('%Y-%m-%d')}"
    os.makedirs(folder, exist_ok=True)
    filename = dt.strftime("%H%M.json")
    path = os.path.join(folder, filename)
    if os.path.exists(path):
        return
    print(f"Fetching for {path}")
    response = client.get(f"{transit_url}/{resource}?api_key={key511}&agency=CT&format=json")
    try:
        response.raise_for_status()
    except Exception as e:
        print(f"Error: {e}")
        return
    data = json.loads(response.content.decode("utf-8-sig"))
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Dumped to {path}")

while True:
    with httpx.Client() as client:
        maybe_dump_minute_date(client, "VehicleMonitoring")
        maybe_dump_minute_date(client, "StopMonitoring")
        time.sleep(1)