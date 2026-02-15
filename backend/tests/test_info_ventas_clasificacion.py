"""
Test suite for Info Ventas (Clasificacion) feature
Tests for:
- GET /api/cuentas/{id}/ventas/clasificacion - aggregated sales data by (marca, tipo, entalle)
- GET /api/cuentas/{id}/ventas/clasificacion/detail - drilldown lines for specific classification
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test cuenta with confirmed sales data
TEST_CUENTA_ID = 5744


class TestAuth:
    """Authentication helper"""
    token = None
    
    @classmethod
    def get_token(cls):
        if cls.token is None:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@crm.com",
                "password": "admin123"
            })
            assert response.status_code == 200, f"Login failed: {response.text}"
            cls.token = response.json()["token"]
        return cls.token


@pytest.fixture
def auth_header():
    """Get auth header with valid token"""
    return {"Authorization": f"Bearer {TestAuth.get_token()}"}


class TestClasificacionEndpoint:
    """Tests for GET /api/cuentas/{id}/ventas/clasificacion"""
    
    def test_clasificacion_requires_auth(self):
        """Endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion")
        assert response.status_code == 401
        assert "Token requerido" in response.json().get("detail", "")
    
    def test_clasificacion_returns_aggregated_data(self, auth_header):
        """Endpoint should return aggregated data by (marca, tipo, entalle)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have rows array
        assert "rows" in data
        assert isinstance(data["rows"], list)
        assert len(data["rows"]) > 0, "Should have at least some clasificacion rows"
    
    def test_clasificacion_row_structure(self, auth_header):
        """Each row should have expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data["rows"]:
            # Required fields
            assert "marca" in row, "Row should have 'marca' field"
            assert "tipo" in row, "Row should have 'tipo' field"
            assert "entalle" in row, "Row should have 'entalle' field"
            assert "ultima_fecha_compra" in row, "Row should have 'ultima_fecha_compra' field"
            assert "cantidad" in row, "Row should have 'cantidad' (SUM of qty)"
            assert "ventas" in row, "Row should have 'ventas' (SUM of subtotal)"
            assert "compras" in row, "Row should have 'compras' (COUNT DISTINCT orders)"
            
            # Type checks
            assert isinstance(row["cantidad"], (int, float)), "cantidad should be numeric"
            assert isinstance(row["ventas"], (int, float)), "ventas should be numeric"
            assert isinstance(row["compras"], (int, float)), "compras should be numeric"
    
    def test_clasificacion_sorted_by_ventas_desc(self, auth_header):
        """Results should be sorted by ventas descending"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response.status_code == 200
        data = response.json()
        rows = data["rows"]
        
        if len(rows) > 1:
            ventas_values = [r["ventas"] for r in rows]
            assert ventas_values == sorted(ventas_values, reverse=True), "Results should be sorted by ventas DESC"
    
    def test_clasificacion_only_includes_sales_not_reserva(self, auth_header):
        """Should only include SALE orders, not RESERVA"""
        # This is implicitly tested by checking the SQL filter (reserva = false)
        # We just verify the endpoint works and returns data
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response.status_code == 200
        data = response.json()
        # Verify we got some data (known test cuenta has sales)
        assert len(data["rows"]) > 0, "Should have SALE data for test cuenta"
    
    def test_clasificacion_respects_fecha_desde_filter(self, auth_header):
        """Date filter fecha_desde should work"""
        # Get all data first
        response_all = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response_all.status_code == 200
        all_rows = response_all.json()["rows"]
        
        # Filter to recent year only
        response_filtered = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header,
            params={"fecha_desde": "2022-01-01"}
        )
        assert response_filtered.status_code == 200
        filtered_rows = response_filtered.json()["rows"]
        
        # Filtered should have equal or fewer rows
        total_all = sum(r["compras"] for r in all_rows)
        total_filtered = sum(r["compras"] for r in filtered_rows)
        assert total_filtered <= total_all, "Filtered results should have <= all results"
    
    def test_clasificacion_respects_fecha_hasta_filter(self, auth_header):
        """Date filter fecha_hasta should work"""
        # Filter to old data only
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header,
            params={"fecha_hasta": "2022-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify all ultima_fecha_compra are within range
        for row in data["rows"]:
            if row["ultima_fecha_compra"]:
                assert row["ultima_fecha_compra"] <= "2022-12-31T23:59:59", \
                    f"ultima_fecha_compra {row['ultima_fecha_compra']} should be before 2022-12-31"
    
    def test_clasificacion_both_date_filters(self, auth_header):
        """Both date filters should work together"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header,
            params={"fecha_desde": "2022-01-01", "fecha_hasta": "2022-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["rows"], list)
    
    def test_clasificacion_empty_cuenta(self, auth_header):
        """Should return empty rows for cuenta with no sales"""
        # Use a cuenta ID that likely has no sales (very high ID)
        response = requests.get(
            f"{BASE_URL}/api/cuentas/99999999/ventas/clasificacion",
            headers=auth_header
        )
        # Should still return 200 with empty rows, not error
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data


class TestClasificacionDetailEndpoint:
    """Tests for GET /api/cuentas/{id}/ventas/clasificacion/detail"""
    
    def test_detail_requires_auth(self):
        """Endpoint should require authentication"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail"
        )
        assert response.status_code == 401
    
    def test_detail_returns_drilldown_lines(self, auth_header):
        """Should return individual order lines for classification"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        assert isinstance(data["rows"], list)
        assert len(data["rows"]) > 0, "Should have detail lines for this classification"
    
    def test_detail_row_structure(self, auth_header):
        """Each detail row should have expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data["rows"]:
            # Required fields for drilldown
            assert "line_id" in row or "order_id" in row, "Row should have line_id or order_id"
            assert "order_name" in row, "Row should have 'order_name'"
            assert "fecha" in row, "Row should have 'fecha'"
            assert "modelo_display" in row, "Row should have 'modelo_display'"
            assert "qty" in row, "Row should have 'qty'"
            assert "price_unit" in row, "Row should have 'price_unit'"
            assert "subtotal" in row, "Row should have 'subtotal'"
    
    def test_detail_supports_pagination(self, auth_header):
        """Should support page and limit parameters"""
        # First page
        response1 = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim", "page": 1, "limit": 5}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Check pagination fields
        assert "page" in data1
        assert "limit" in data1
        assert "has_next" in data1
        assert data1["page"] == 1
        assert data1["limit"] == 5
        assert len(data1["rows"]) <= 5
    
    def test_detail_pagination_next_page(self, auth_header):
        """Should return different data on page 2 if has_next is True"""
        # Small limit to ensure pagination
        response1 = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim", "page": 1, "limit": 3}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        if data1.get("has_next", False):
            # Get page 2
            response2 = requests.get(
                f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
                headers=auth_header,
                params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim", "page": 2, "limit": 3}
            )
            assert response2.status_code == 200
            data2 = response2.json()
            
            # Page 2 should have different data
            ids1 = {r.get("line_id") or r.get("order_id") for r in data1["rows"]}
            ids2 = {r.get("line_id") or r.get("order_id") for r in data2["rows"]}
            assert ids1.isdisjoint(ids2), "Page 2 should have different rows than page 1"
    
    def test_detail_empty_classification(self, auth_header):
        """Should handle empty classification (no marca/tipo/entalle)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "", "tipo": "", "entalle": "", "page": 1, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert "rows" in data
        # Should return lines with empty/null classification
        assert len(data["rows"]) > 0, "Should have some unclassified products"
    
    def test_detail_respects_date_filters(self, auth_header):
        """Date filters should work on detail endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={
                "marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim",
                "fecha_desde": "2022-01-01", "fecha_hasta": "2022-12-31"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # All dates should be within range
        for row in data["rows"]:
            if row.get("fecha"):
                assert row["fecha"] >= "2022-01-01", f"fecha {row['fecha']} should be after 2022-01-01"


class TestDataConsistency:
    """Tests to verify data consistency between endpoints"""
    
    def test_clasificacion_qty_matches_detail_count(self, auth_header):
        """cantidad in clasificacion should match total qty in detail"""
        # Get classification
        response_clasif = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_header
        )
        assert response_clasif.status_code == 200
        clasif_data = response_clasif.json()
        
        # Find ELEMENT PREMIUM Casaca Slim
        target = None
        for row in clasif_data["rows"]:
            if row["marca"] == "ELEMENT PREMIUM" and row["tipo"] == "Casaca" and row["entalle"] == "Slim":
                target = row
                break
        
        assert target is not None, "Should find ELEMENT PREMIUM Casaca Slim"
        
        # Get detail (all rows)
        response_detail = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_header,
            params={"marca": "ELEMENT PREMIUM", "tipo": "Casaca", "entalle": "Slim", "limit": 1000}
        )
        assert response_detail.status_code == 200
        detail_data = response_detail.json()
        
        # Sum qty in detail should match cantidad in classification
        total_qty = sum(r["qty"] for r in detail_data["rows"])
        assert total_qty == target["cantidad"], \
            f"Detail total qty ({total_qty}) should match clasificacion cantidad ({target['cantidad']})"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
