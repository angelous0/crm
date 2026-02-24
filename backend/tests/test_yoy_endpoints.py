"""
Tests for Year-over-Year (YoY) comparison endpoints

New YoY endpoints tested:
1. GET /api/cuentas/{id}/ventas/yoy/metrics - KPIs comparison between years
2. GET /api/cuentas/{id}/ventas/yoy/by-month - Monthly breakdown
3. GET /api/cuentas/{id}/ventas/yoy/by-item - Classification mix with drill-down
4. GET /api/cuentas/{id}/ventas/yoy/item-orders - Orders for specific classification item
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://customer-reassign.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@crm.com",
        "password": "admin123"
    }, timeout=30)
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")

@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestYoYMetrics:
    """Tests for /api/cuentas/{id}/ventas/yoy/metrics endpoint"""
    
    def test_yoy_metrics_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/8/ventas/yoy/metrics", timeout=30)
        assert response.status_code == 401, "Should require authentication"
    
    def test_yoy_metrics_basic(self, auth_headers):
        """Test basic YoY metrics response structure"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/metrics",
            params={"year_a": 2026, "year_b": 2025},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "year_a" in data, "Should have year_a data"
        assert "year_b" in data, "Should have year_b data"
        assert "delta" in data, "Should have delta calculations"
        
        # Validate year_a structure
        assert "ventas" in data["year_a"], "year_a should have ventas"
        assert "unidades" in data["year_a"], "year_a should have unidades"
        assert "compras" in data["year_a"], "year_a should have compras"
        
        # Validate year_b structure
        assert "ventas" in data["year_b"], "year_b should have ventas"
        assert "unidades" in data["year_b"], "year_b should have unidades"
        assert "compras" in data["year_b"], "year_b should have compras"
        
        # Validate delta structure
        assert "ventas_pct" in data["delta"], "delta should have ventas_pct"
        assert "unidades_pct" in data["delta"], "delta should have unidades_pct"
        assert "compras_pct" in data["delta"], "delta should have compras_pct"
        
        print(f"YoY Metrics: year_a ventas={data['year_a']['ventas']}, year_b ventas={data['year_b']['ventas']}, delta={data['delta']['ventas_pct']}%")
    
    def test_yoy_metrics_with_month_filters(self, auth_headers):
        """Test YoY metrics with from_month and to_month filters"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/metrics",
            params={"year_a": 2026, "year_b": 2025, "from_month": "1", "to_month": "6"},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed with month filters: {response.text}"
        data = response.json()
        assert "year_a" in data
        assert "year_b" in data
        print(f"YoY Metrics (Jan-Jun): year_a ventas={data['year_a']['ventas']}, year_b ventas={data['year_b']['ventas']}")
    
    def test_yoy_metrics_default_years(self, auth_headers):
        """Test that default years are current and previous year"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/metrics",
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "year_a" in data
        assert "year_b" in data


class TestYoYByMonth:
    """Tests for /api/cuentas/{id}/ventas/yoy/by-month endpoint"""
    
    def test_yoy_by_month_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-month", timeout=30)
        assert response.status_code == 401, "Should require authentication"
    
    def test_yoy_by_month_basic(self, auth_headers):
        """Test basic by-month response structure"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-month",
            params={"year_a": 2026, "year_b": 2025},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "months" in data, "Should have months array"
        months = data["months"]
        assert isinstance(months, list), "months should be an array"
        
        # If there's data, validate structure
        if len(months) > 0:
            month_entry = months[0]
            assert "month" in month_entry, "Each month entry should have month number"
            assert "ventas_a" in month_entry, "Each month should have ventas_a"
            assert "ventas_b" in month_entry, "Each month should have ventas_b"
            assert "unidades_a" in month_entry, "Each month should have unidades_a"
            assert "unidades_b" in month_entry, "Each month should have unidades_b"
            assert "compras_a" in month_entry, "Each month should have compras_a"
            assert "compras_b" in month_entry, "Each month should have compras_b"
        
        print(f"YoY By Month: {len(months)} months with data")
    
    def test_yoy_by_month_months_are_valid(self, auth_headers):
        """Test that month numbers are valid (1-12)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-month",
            params={"year_a": 2026, "year_b": 2025},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        for month_entry in data.get("months", []):
            month = month_entry.get("month")
            assert 1 <= month <= 12, f"Month {month} should be between 1 and 12"
    
    def test_yoy_by_month_with_filters(self, auth_headers):
        """Test by-month with from_month and to_month filters"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-month",
            params={"year_a": 2026, "year_b": 2025, "from_month": "3", "to_month": "9"},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned months should be within filter range
        for month_entry in data.get("months", []):
            month = month_entry.get("month")
            assert 3 <= month <= 9, f"Month {month} should be between 3 and 9 (filter range)"


class TestYoYByItem:
    """Tests for /api/cuentas/{id}/ventas/yoy/by-item endpoint"""
    
    def test_yoy_by_item_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item", timeout=30)
        assert response.status_code == 401, "Should require authentication"
    
    def test_yoy_by_item_basic(self, auth_headers):
        """Test basic by-item response structure"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "rows" in data, "Should have rows array"
        rows = data["rows"]
        assert isinstance(rows, list), "rows should be an array"
        
        if len(rows) > 0:
            row = rows[0]
            # Validate classification fields
            assert "marca" in row, "Row should have marca"
            assert "tipo" in row, "Row should have tipo"
            assert "entalle" in row, "Row should have entalle"
            assert "tela" in row, "Row should have tela"
            
            # Validate comparison fields
            assert "ventas_a" in row, "Row should have ventas_a"
            assert "ventas_b" in row, "Row should have ventas_b"
            assert "var_abs" in row, "Row should have var_abs (absolute variation)"
            assert "var_pct" in row, "Row should have var_pct (percentage variation)"
            
        print(f"YoY By Item: {len(rows)} classification items")
    
    def test_yoy_by_item_top_limit(self, auth_headers):
        """Test that top parameter limits results"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "top": 5},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data.get("rows", [])) <= 5, "Should respect top limit"
    
    def test_yoy_by_item_sort_by_ventas_a(self, auth_headers):
        """Test sorting by ventas_a"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "sort_by": "ventas_a", "sort_dir": "desc"},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        rows = data.get("rows", [])
        
        # Verify descending order
        if len(rows) >= 2:
            for i in range(len(rows) - 1):
                assert rows[i]["ventas_a"] >= rows[i+1]["ventas_a"], "Should be sorted descending by ventas_a"
    
    def test_yoy_by_item_sort_by_var_abs(self, auth_headers):
        """Test sorting by var_abs (absolute variation)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "sort_by": "var_abs", "sort_dir": "desc"},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        rows = data.get("rows", [])
        
        if len(rows) >= 2:
            for i in range(len(rows) - 1):
                assert rows[i]["var_abs"] >= rows[i+1]["var_abs"], "Should be sorted descending by var_abs"
    
    def test_yoy_by_item_sort_ascending(self, auth_headers):
        """Test ascending sort direction"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "sort_by": "ventas_a", "sort_dir": "asc"},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        rows = data.get("rows", [])
        
        if len(rows) >= 2:
            for i in range(len(rows) - 1):
                assert rows[i]["ventas_a"] <= rows[i+1]["ventas_a"], "Should be sorted ascending by ventas_a"


class TestYoYItemOrders:
    """Tests for /api/cuentas/{id}/ventas/yoy/item-orders endpoint (drill-down)"""
    
    def test_yoy_item_orders_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/8/ventas/yoy/item-orders", timeout=30)
        assert response.status_code == 401, "Should require authentication"
    
    def test_yoy_item_orders_basic(self, auth_headers):
        """Test basic item-orders drill-down response"""
        # First get a classification item from by-item endpoint
        items_response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "top": 5},
            headers=auth_headers, timeout=60
        )
        assert items_response.status_code == 200
        items = items_response.json().get("rows", [])
        
        if len(items) > 0:
            item = items[0]
            # Query orders for this item
            response = requests.get(
                f"{BASE_URL}/api/cuentas/8/ventas/yoy/item-orders",
                params={
                    "year": 2026,
                    "marca": item.get("marca", ""),
                    "tipo": item.get("tipo", ""),
                    "entalle": item.get("entalle", ""),
                    "tela": item.get("tela", "")
                },
                headers=auth_headers, timeout=60
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            data = response.json()
            
            assert "rows" in data, "Should have rows array"
            assert "page" in data, "Should have page"
            assert "limit" in data, "Should have limit"
            assert "has_next" in data, "Should have has_next"
            
            if len(data["rows"]) > 0:
                order = data["rows"][0]
                assert "order_id" in order, "Order should have order_id"
                assert "order_name" in order, "Order should have order_name"
                assert "date_order" in order, "Order should have date_order"
                assert "qty_item" in order, "Order should have qty_item"
                assert "ventas_item" in order, "Order should have ventas_item"
                assert "lines_count" in order, "Order should have lines_count"
            
            print(f"YoY Item Orders: {len(data['rows'])} orders for item {item.get('marca', 'N/A')}/{item.get('tipo', 'N/A')}")
    
    def test_yoy_item_orders_with_specific_filters(self, auth_headers):
        """Test item-orders with specific classification filters"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/item-orders",
            params={
                "year": 2026,
                "marca": "ELEMENT PREMIUM",
                "tipo": "Pantalon Denim",
                "entalle": "Semipitillo",
                "tela": "Comfort"
            },
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "rows" in data
        assert isinstance(data["rows"], list)
        print(f"Orders for ELEMENT PREMIUM/Pantalon Denim/Semipitillo/Comfort: {len(data['rows'])} orders")
    
    def test_yoy_item_orders_pagination(self, auth_headers):
        """Test pagination in item-orders"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/item-orders",
            params={"year": 2025, "marca": "", "tipo": "", "entalle": "", "tela": "", "page": 1, "limit": 10},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["page"] == 1
        assert data["limit"] == 10
        assert len(data["rows"]) <= 10


class TestYoYVarPctCalculation:
    """Tests to verify var_pct calculation is correct"""
    
    def test_var_pct_calculation(self, auth_headers):
        """Verify that var_pct is calculated correctly: (ventas_a - ventas_b) / ventas_b * 100"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/8/ventas/yoy/by-item",
            params={"year_a": 2026, "year_b": 2025, "top": 10},
            headers=auth_headers, timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            ventas_a = row.get("ventas_a", 0)
            ventas_b = row.get("ventas_b", 0)
            var_pct = row.get("var_pct", 0)
            
            if ventas_b > 0:
                expected_pct = round((ventas_a - ventas_b) / ventas_b * 100, 1)
                assert abs(var_pct - expected_pct) < 0.2, f"var_pct {var_pct} should be close to {expected_pct}"
            elif ventas_a > 0:
                assert var_pct == 100.0, "var_pct should be 100 when ventas_b is 0 but ventas_a > 0"
            else:
                assert var_pct == 0, "var_pct should be 0 when both ventas are 0"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
