from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import requests

BASE_URL = "https://tdsb.ebasefm.com"


@dataclass
class TDSBSpacesClient:
    session: requests.Session = field(default_factory=requests.Session)

    def space_types(self, permit_type_id: int = 3) -> list[dict[str, Any]]:
        r = self.session.get(
            f"{BASE_URL}/cu/api/space_types/fetch_available",
            params={"permit_type_id": permit_type_id},
        )
        r.raise_for_status()
        return r.json()

    def facilities(self, permit_type_id: int = 3) -> list[dict[str, Any]]:
        r = self.session.get(
            f"{BASE_URL}/cu/api/schools/search_available",
            params={"is_admin": 0, "permit_type_id": permit_type_id, "user_id": 0},
        )
        r.raise_for_status()
        return r.json()

    def spaces(self, school_id: int, available_only: bool = True) -> list[dict[str, Any]]:
        r = self.session.post(
            f"{BASE_URL}/rentals/xhr/spaces/fetch",
            data={"school_id": school_id, "available_only": str(available_only).lower()},
        )
        r.raise_for_status()
        return r.json()

    def bookings(
        self,
        school_id: int,
        start_date: str,
        end_date: str,
        space_id: int = 0,
    ) -> list[dict[str, Any]]:
        r = self.session.get(
            f"{BASE_URL}/rentals/bookings/get",
            params={
                "start_date": start_date,
                "end_date": end_date,
                "filters[filter_type]": "facility",
                "filters[school_id]": school_id,
                "filters[space_id]": space_id,
            },
        )
        r.raise_for_status()
        return r.json()

    def special_dates(self, school_id: int, start_date: str, end_date: str) -> list[dict[str, Any]]:
        r = self.session.get(
            f"{BASE_URL}/cu/special_dates/get",
            params={"start_date": start_date, "end_date": end_date, "school_id": school_id},
        )
        r.raise_for_status()
        return r.json()


if __name__ == "__main__":
    client = TDSBSpacesClient()
    facilities = client.facilities()
    print(f"facilities: {len(facilities)}")
    sample = next(f for f in facilities if f["id"] == 322)
    print(sample["name"])
    spaces = client.spaces(sample["id"])
    print(f"spaces: {len(spaces)}")
    bookings = client.bookings(sample["id"], "2026-05-01 00:00:00", "2026-05-07 23:59:59")
    print(f"bookings in sample week: {len(bookings)}")
