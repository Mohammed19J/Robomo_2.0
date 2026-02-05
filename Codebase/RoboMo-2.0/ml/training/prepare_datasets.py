import os, numpy as np, pandas as pd

INPUT_DIR  = "./ml/data"
OUTPUT_DIR = "./ml/data"

def _exists(path): 
    ok = os.path.exists(path)
    if not ok: print(f"[skip] {path} not found")
    return ok

def main():
    smoke_csv = os.path.join(INPUT_DIR, "Smoke_Detection_Data.csv")
    iaq_csv   = os.path.join(INPUT_DIR, "Indoor_AirQuality_Data.csv")
    home_csv  = os.path.join(INPUT_DIR, "Home_Occupancy_Data.csv")  # note: file name as given
    gym_csv   = os.path.join(INPUT_DIR, "Gym_Occupancy_Data.csv")

    # ---- Smoke ----python ml/training/prepare_datasets.py
    if _exists(smoke_csv):
        df = pd.read_csv(smoke_csv)
        s = pd.DataFrame()
        s["timestamp"] = pd.to_datetime(df["UTC"], unit="s", errors="coerce").dt.tz_localize("UTC").astype(str)
        s["device_id"] = "smoke_lab"
        s["co2"]       = df.get("eCO2[ppm]")
        s["voc"]       = df.get("TVOC[ppb]")
        s["pm1"]       = df.get("PM1.0")
        s["pm25"]      = df.get("PM2.5")
        s["pm4"]       = np.nan
        s["pm10"]      = np.nan
        s["temp_c"]    = df.get("Temperature[C]")
        s["rh"]        = df.get("Humidity[%]")
        s["smoke_present"] = (df["Fire Alarm"] > 0).astype(int)
    else:
        s = pd.DataFrame()

    # ---- Indoor AQ (also gives occupancy count & health features) ----
    if _exists(iaq_csv):
        df = pd.read_csv(iaq_csv)
        i = pd.DataFrame()
        i["timestamp"] = pd.to_datetime(df["Timestamp"], format="%d-%m-%Y %H:%M", errors="coerce").dt.tz_localize("UTC").astype(str)
        i["device_id"] = "office_iaq"
        i["co2"]       = df.get("CO2 (ppm)")
        i["voc"]       = df.get("TVOC (ppb)")
        i["pm1"]       = np.nan
        i["pm25"]      = df.get("PM2.5 (?g/m?)")
        i["pm4"]       = np.nan
        i["pm10"]      = df.get("PM10 (?g/m?)")
        i["temp_c"]    = df.get("Temperature (?C)")
        i["rh"]        = df.get("Humidity (%)")
        if "Occupancy Count" in df.columns:
            i["occupied"] = (pd.to_numeric(df["Occupancy Count"], errors="coerce") > 0).astype(int)
    else:
        i = pd.DataFrame()

    # ---- Home occupancy ----
    if _exists(home_csv):
        df = pd.read_csv(home_csv)
        h = pd.DataFrame()
        h["timestamp"] = pd.to_datetime(df["date"], errors="coerce").dt.tz_localize("UTC").astype(str)
        h["device_id"] = "home_env"
        h["co2"] = h["voc"] = h["pm1"] = h["pm25"] = h["pm4"] = h["pm10"] = np.nan
        h["temp_c"]    = df.get("tem")
        h["rh"]        = df.get("hum")
        # 'occ' is L/M/H/E — treat 'E' as empty (0), others as occupied (1)
        h["occupied"]  = (~df["occ"].astype(str).str.upper().eq("E")).astype(int)
    else:
        h = pd.DataFrame()

    # ---- Gym occupancy ----
    if _exists(gym_csv):
        df = pd.read_csv(gym_csv)
        g = pd.DataFrame()
        g["timestamp"] = pd.to_datetime(df["date"], errors="coerce").dt.tz_localize("UTC").astype(str)
        g["device_id"] = "gym_env"
        g["co2"] = g["voc"] = g["pm1"] = g["pm25"] = g["pm4"] = g["pm10"] = np.nan
        g["temp_c"]    = df.get("tem")
        g["rh"]        = df.get("hum")
        g["occupied"]  = (~df["occ"].astype(str).str.upper().eq("E")).astype(int)
    else:
        g = pd.DataFrame()

    # ---- Outputs ----
    smoke_train = s
    health_train = i
    occupancy_train = pd.concat(
        [
            i.reindex(columns=["timestamp","device_id","co2","voc","pm1","pm25","pm4","pm10","temp_c","rh","occupied"]),
            h.reindex(columns=["timestamp","device_id","co2","voc","pm1","pm25","pm4","pm10","temp_c","rh","occupied"]),
            g.reindex(columns=["timestamp","device_id","co2","voc","pm1","pm25","pm4","pm10","temp_c","rh","occupied"]),
        ],
        ignore_index=True
    ).dropna(subset=["timestamp"])

    if not smoke_train.empty:
        smoke_train.to_csv(os.path.join(OUTPUT_DIR, "smoke_train.csv"), index=False)
        print("[ok] wrote smoke_train.csv")
    if not health_train.empty:
        health_train.to_csv(os.path.join(OUTPUT_DIR, "health_train.csv"), index=False)
        print("[ok] wrote health_train.csv")
    if not occupancy_train.empty:
        occupancy_train.to_csv(os.path.join(OUTPUT_DIR, "occupancy_train.csv"), index=False)
        print("[ok] wrote occupancy_train.csv")

if __name__ == "__main__":
    main()
