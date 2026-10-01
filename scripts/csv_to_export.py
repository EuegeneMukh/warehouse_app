import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def read_rows(path):
    with path.open(newline="", encoding="utf-8-sig") as file:
        return list(csv.DictReader(file))


def main():
    directory = Path(sys.argv[1] if len(sys.argv) > 1 else "supabase-export")
    output = Path(sys.argv[2] if len(sys.argv) > 2 else directory / "warehouse-export.json")
    components = read_rows(directory / "components_rows.csv")
    inventory = read_rows(directory / "inventory_rows.csv")
    organizers = read_rows(directory / "organizers_rows.csv")
    for organizer in organizers:
        organizer["rows"] = json.loads(organizer["rows"])
    data = {"format": "warehouse-export", "version": 1,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "components": components, "inventory": inventory, "organizers": organizers}
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Создан {output}: компонентов {len(components)}, наличия {len(inventory)}, органайзеров {len(organizers)}")


if __name__ == "__main__":
    main()
