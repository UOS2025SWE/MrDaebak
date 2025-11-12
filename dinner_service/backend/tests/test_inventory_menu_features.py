from decimal import Decimal
from typing import Any

from backend.services.menu_service import MenuService
from backend.services.order_service import OrderService
from backend.services.side_dish_service import side_dish_service


class _FakeResult:
    def __init__(self, rows: list[tuple[Any, Any]]):
        self._rows = rows

    def fetchall(self) -> list[tuple[Any, Any]]:  # pragma: no cover - simple data holder
        return self._rows


class _FakeDB:
    """Very small stand-in for a SQLAlchemy Session used in unit tests."""

    def __init__(self, inventory_map: dict[str, float]):
        self.inventory_map = inventory_map

    def execute(self, query, params):  # type: ignore[override]
        query_str = str(query)
        if "FROM ingredients i" in query_str:
            rows: list[tuple[Any, Any]] = []
            for key, value in params.items():
                if key.startswith("code_"):
                    code = value
                    rows.append((code, self.inventory_map.get(code, 0.0)))
            return _FakeResult(rows)

        raise AssertionError(f"Unexpected query executed during test: {query_str}")


def test_calculate_style_availability_respects_inventory(monkeypatch):
    base_ingredient_map = {
        "simple": {"wine": 1, "premium_steak": 1},
        "grand": {"wine": 1},
    }
    fake_db = _FakeDB({"wine": 5.0, "premium_steak": 0.0})

    def fake_get_main_store_id(cls, db):  # pragma: no cover - monkeypatch helper
        return "store-1"

    monkeypatch.setattr(MenuService, "_get_main_store_id", classmethod(fake_get_main_store_id))

    availability = MenuService._calculate_style_availability(fake_db, "valentine", base_ingredient_map)

    assert availability["simple"] is False  # 스테이크 부족 → 판매 불가
    assert availability["grand"] is True   # 와인 재고 충분 → 판매 가능


def test_prepare_side_dishes_aggregates_cost_and_ingredients(monkeypatch):
    side_dish_catalog = {
        "seasonal_salad": {
            "side_dish_id": "sd-salad",
            "code": "seasonal_salad",
            "name": "계절 샐러드",
            "base_price": Decimal("9000"),
            "is_available": True,
            "ingredients": [
                {"ingredient_code": "fresh_salad", "quantity": Decimal("1")},
                {"ingredient_code": "plastic_plate", "quantity": Decimal("1")},
            ],
        },
        "baguette_set": {
            "side_dish_id": "sd-baguette",
            "code": "baguette_set",
            "name": "바게트 세트",
            "base_price": Decimal("9000"),
            "is_available": True,
            "ingredients": [
                {"ingredient_code": "baguette", "quantity": Decimal("1")},
            ],
        },
    }

    def fake_get_side_dish(db, code):  # pragma: no cover - monkeypatch helper
        return side_dish_catalog.get(code)

    monkeypatch.setattr(side_dish_service, "get_side_dish_by_code", fake_get_side_dish)

    selection = [
        {"code": "seasonal_salad", "quantity": 2},
        {"code": "baguette_set", "quantity": 1},
    ]

    result = OrderService._prepare_side_dishes(db=None, side_dishes_payload=selection, custom_cake_customization=None)  # type: ignore[arg-type]

    assert result["success"] is True
    assert result["total_price"] == Decimal("27000")
    assert result["ingredients"]["fresh_salad"] == Decimal("2")
    assert result["ingredients"]["baguette"] == Decimal("1")
    assert result["ingredients"]["plastic_plate"] == Decimal("2")


def test_prepare_side_dishes_rejects_unavailable(monkeypatch):
    def fake_get_side_dish(db, code):  # pragma: no cover - monkeypatch helper
        return {
            "side_dish_id": "sd-sold-out",
            "code": code,
            "name": "품절 디시",
            "base_price": Decimal("5000"),
            "is_available": False,
            "ingredients": [],
        }

    monkeypatch.setattr(side_dish_service, "get_side_dish_by_code", fake_get_side_dish)

    result = OrderService._prepare_side_dishes(db=None, side_dishes_payload=[{"code": "soldout", "quantity": 1}], custom_cake_customization=None)  # type: ignore[arg-type]

    assert result["success"] is False
    assert "비활성화" in result["error"]
