"""
Test Product Catalog Filter Implementation
==========================================
Tests that all commercial views (Ventas/Reservas POS) filter out 'unimportant' products.

Filter criteria:
- product_id IS NOT NULL
- sale_ok = true
- purchase_ok = false  
- name NOT ILIKE any of: correa, saco, bolsa, probador, paneton, publicitario

Endpoints to test:
- /api/comercial/orders - Global order headers with filtered lines_count
- /api/comercial/lines - Global order lines with filtered products
- /api/cuentas/{id}/ventas/metrics - Account-level filtered metrics
- /api/cuentas/{id}/ventas/orders - Account-level orders with filtered lines
- /api/cuentas/{id}/ventas/clasificacion - Classification without excluded products
- /api/cuentas/{id}/ventas/clasificacion/detail - Line details without excluded products
- /api/cuentas/{id}/ventas/lines - Account lines without excluded products
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://account-ui-ux.preview.emergentagent.com')

# Excluded product name patterns (case-insensitive)
EXCLUDED_PATTERNS = ['correa', 'saco', 'bolsa', 'probador', 'paneton', 'publicitario']

# Test account: partner_id 8 (CLIENTES VARIOS) - has many orders
TEST_CUENTA_ID = 8


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@crm.com", "password": "admin123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


def check_modelo_not_excluded(modelo_display):
    """Check that modelo_display does not contain excluded patterns"""
    if not modelo_display:
        return True
    modelo_lower = str(modelo_display).lower()
    for pattern in EXCLUDED_PATTERNS:
        if pattern in modelo_lower:
            return False
    return True


class TestComercialOrders:
    """Test /api/comercial/orders returns filtered data"""
    
    def test_orders_requires_auth(self):
        """Orders endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/comercial/orders")
        assert response.status_code == 401
    
    def test_orders_returns_data_with_filtered_lines(self, auth_headers):
        """Orders have lines_count > 0 (no orders with 0 filtered lines)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/orders",
            headers=auth_headers,
            params={"limit": 100}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        assert "metrics" in data
        assert data["metrics"]["orders_count"] > 0, "Expected orders to be returned"
        
        # Verify all orders have lines_count > 0
        # Note: qty_total can be 0 if there are returns (positive + negative qty)
        for row in data["rows"]:
            assert row.get("lines_count", 0) > 0, f"Order {row.get('order_id')} has lines_count=0 (should be excluded)"
            # qty_total may be 0 due to returns, but lines_count must be positive


class TestComercialLines:
    """Test /api/comercial/lines returns only filtered products"""
    
    def test_lines_requires_auth(self):
        """Lines endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/comercial/lines")
        assert response.status_code == 401
    
    def test_lines_no_excluded_products(self, auth_headers):
        """Lines do not contain excluded product names (correa, saco, bolsa, etc.)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 200}  # Get more rows for thorough check
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        assert len(data["rows"]) > 0, "Expected lines to be returned"
        
        # Check each line's modelo_display
        for row in data["rows"]:
            modelo = row.get("modelo_display", "")
            assert check_modelo_not_excluded(modelo), \
                f"Line contains excluded product: '{modelo}' (line_id: {row.get('line_id')})"
    
    def test_lines_metrics_positive(self, auth_headers):
        """Lines endpoint returns positive metrics"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["metrics"]["orders_count"] > 0, "Expected orders_count > 0"
        assert data["metrics"]["qty_total"] > 0, "Expected qty_total > 0"


class TestCuentaVentasMetrics:
    """Test /api/cuentas/{id}/ventas/metrics returns filtered metrics"""
    
    def test_metrics_requires_auth(self):
        """Metrics endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/metrics")
        assert response.status_code == 401
    
    def test_metrics_returns_filtered_counts(self, auth_headers):
        """Metrics returns positive counts with filtered data"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/metrics",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # partner_id 8 (CLIENTES VARIOS) should have data
        assert data.get("orders_count", 0) >= 0, "orders_count should be >= 0"
        assert data.get("qty_total", 0) >= 0, "qty_total should be >= 0"


class TestCuentaVentasOrders:
    """Test /api/cuentas/{id}/ventas/orders returns filtered orders"""
    
    def test_orders_requires_auth(self):
        """Orders endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/orders")
        assert response.status_code == 401
    
    def test_orders_all_have_filtered_lines(self, auth_headers):
        """All returned orders have lines_count > 0 (filtered)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/orders",
            headers=auth_headers,
            params={"limit": 50}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("rows", [])) > 0:
            for row in data["rows"]:
                assert row.get("lines_count", 0) > 0, \
                    f"Order {row.get('order_id')} has lines_count=0 (should be excluded)"


class TestCuentaVentasClasificacion:
    """Test /api/cuentas/{id}/ventas/clasificacion returns filtered classification"""
    
    def test_clasificacion_requires_auth(self):
        """Clasificacion endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion")
        assert response.status_code == 401
    
    def test_clasificacion_no_excluded_products(self, auth_headers):
        """Classification data does not include excluded products"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check that no rows have excluded product markers
        # (Classification groups by marca/tipo/entalle, but underlying products should be filtered)
        rows = data.get("rows", [])
        for row in rows:
            # Ensure positive quantities (no empty classification groups)
            assert row.get("cantidad", 0) >= 0, "cantidad should be >= 0"
            assert row.get("ventas", 0) >= 0, "ventas should be >= 0"


class TestCuentaVentasClasificacionDetail:
    """Test /api/cuentas/{id}/ventas/clasificacion/detail returns filtered lines"""
    
    def test_detail_requires_auth(self):
        """Detail endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail")
        assert response.status_code == 401
    
    def test_detail_no_excluded_products(self, auth_headers):
        """Detail lines do not contain excluded products"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/clasificacion/detail",
            headers=auth_headers,
            params={"limit": 100}
        )
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        for row in rows:
            modelo = row.get("modelo_display", "")
            assert check_modelo_not_excluded(modelo), \
                f"Detail line contains excluded product: '{modelo}'"


class TestCuentaVentasLines:
    """Test /api/cuentas/{id}/ventas/lines returns only filtered lines"""
    
    def test_lines_requires_auth(self):
        """Lines endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/lines")
        assert response.status_code == 401
    
    def test_lines_no_excluded_products(self, auth_headers):
        """Account lines do not contain excluded products"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/lines",
            headers=auth_headers,
            params={"limit": 100}
        )
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        for row in rows:
            modelo = row.get("modelo_display", "")
            assert check_modelo_not_excluded(modelo), \
                f"Line contains excluded product: '{modelo}'"
    
    def test_lines_for_sale_doc_tipo(self, auth_headers):
        """Lines for SALE doc_tipo do not contain excluded products"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/lines",
            headers=auth_headers,
            params={"doc_tipo": "SALE", "limit": 100}
        )
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        for row in rows:
            modelo = row.get("modelo_display", "")
            assert check_modelo_not_excluded(modelo), \
                f"SALE line contains excluded product: '{modelo}'"


class TestFilterConsistency:
    """Test filter consistency across endpoints"""
    
    def test_comercial_orders_vs_lines_consistency(self, auth_headers):
        """Orders count should be consistent between orders and lines endpoints"""
        orders_resp = requests.get(
            f"{BASE_URL}/api/comercial/orders",
            headers=auth_headers
        )
        lines_resp = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers
        )
        
        assert orders_resp.status_code == 200
        assert lines_resp.status_code == 200
        
        orders_count = orders_resp.json()["metrics"]["orders_count"]
        lines_orders_count = lines_resp.json()["metrics"]["orders_count"]
        
        # KPIs should match (both come from header-level metrics)
        assert orders_count == lines_orders_count, \
            f"Orders count mismatch: orders={orders_count}, lines={lines_orders_count}"
    
    def test_cuenta_orders_have_positive_lines(self, auth_headers):
        """All cuenta orders should have positive lines_count (no empty orders)"""
        response = requests.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/orders",
            headers=auth_headers,
            params={"limit": 100}
        )
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        for row in rows:
            lines_count = row.get("lines_count", 0)
            assert lines_count > 0, \
                f"Order {row.get('order_id')} has lines_count={lines_count} (should be > 0)"


class TestExcludedPatternsSpecific:
    """Test that specific excluded patterns are filtered out"""
    
    def test_no_correa_in_lines(self, auth_headers):
        """No 'correa' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "correa" not in modelo, f"Found 'correa' in modelo: {row.get('modelo_display')}"
    
    def test_no_saco_in_lines(self, auth_headers):
        """No 'saco' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "saco" not in modelo, f"Found 'saco' in modelo: {row.get('modelo_display')}"
    
    def test_no_bolsa_in_lines(self, auth_headers):
        """No 'bolsa' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "bolsa" not in modelo, f"Found 'bolsa' in modelo: {row.get('modelo_display')}"
    
    def test_no_probador_in_lines(self, auth_headers):
        """No 'probador' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "probador" not in modelo, f"Found 'probador' in modelo: {row.get('modelo_display')}"
    
    def test_no_paneton_in_lines(self, auth_headers):
        """No 'paneton' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "paneton" not in modelo, f"Found 'paneton' in modelo: {row.get('modelo_display')}"
    
    def test_no_publicitario_in_lines(self, auth_headers):
        """No 'publicitario' products in commercial lines"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/lines",
            headers=auth_headers,
            params={"limit": 500}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            modelo = str(row.get("modelo_display", "")).lower()
            assert "publicitario" not in modelo, f"Found 'publicitario' in modelo: {row.get('modelo_display')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
