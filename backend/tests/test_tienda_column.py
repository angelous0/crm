"""
Test suite for verifying Tienda column in Ventas/Reservas endpoints
Tests that the 'tienda' field is returned by all relevant endpoints:
- GET /api/cuentas/{id}/ventas/orders?doc_tipo=SALE
- GET /api/cuentas/{id}/ventas/orders?doc_tipo=RESERVA
- GET /api/cuentas/{id}/ventas/lines?doc_tipo=SALE
- GET /api/cuentas/{id}/ventas/lines?doc_tipo=RESERVA
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TEST_ACCOUNT_ID = "8"  # CLIENTES VARIOS - has many sales and reservas


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using login credentials"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"usuario": "eduard", "password": "cardenas"},
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "Token not in login response"
    return data["token"]


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Create a session with auth headers"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestVentasOrdersWithTienda:
    """Test that ventas/orders endpoint includes 'tienda' field for SALE doc_tipo"""

    def test_ventas_orders_sale_returns_tienda_field(self, api_client):
        """GET /api/cuentas/{id}/ventas/orders?doc_tipo=SALE returns 'tienda' field"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/orders",
            params={"doc_tipo": "SALE", "page": 1, "limit": 5}
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "rows" in data, "Response should contain 'rows' key"
        
        # If we have rows, verify tienda field exists in each row
        if len(data["rows"]) > 0:
            for i, row in enumerate(data["rows"]):
                assert "tienda" in row, f"Row {i} missing 'tienda' field: {row.keys()}"
                print(f"Row {i} - Order: {row.get('order_name')}, Tienda: {row.get('tienda')}")
        else:
            print("Note: No SALE orders found for this account, but endpoint structure is correct")


class TestReservasOrdersWithTienda:
    """Test that ventas/orders endpoint includes 'tienda' field for RESERVA doc_tipo"""

    def test_ventas_orders_reserva_returns_tienda_field(self, api_client):
        """GET /api/cuentas/{id}/ventas/orders?doc_tipo=RESERVA returns 'tienda' field"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/orders",
            params={"doc_tipo": "RESERVA", "page": 1, "limit": 5}
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "rows" in data, "Response should contain 'rows' key"
        
        # If we have rows, verify tienda field exists in each row
        if len(data["rows"]) > 0:
            for i, row in enumerate(data["rows"]):
                assert "tienda" in row, f"Row {i} missing 'tienda' field: {row.keys()}"
                print(f"Row {i} - Order: {row.get('order_name')}, Tienda: {row.get('tienda')}")
        else:
            print("Note: No RESERVA orders found for this account, but endpoint structure is correct")


class TestVentasLinesWithTienda:
    """Test that ventas/lines endpoint includes 'tienda' field for SALE doc_tipo"""

    def test_ventas_lines_sale_returns_tienda_field(self, api_client):
        """GET /api/cuentas/{id}/ventas/lines?doc_tipo=SALE returns 'tienda' field"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/lines",
            params={"doc_tipo": "SALE", "page": 1, "limit": 5}
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "rows" in data, "Response should contain 'rows' key"
        
        # If we have rows, verify tienda field exists in each row
        if len(data["rows"]) > 0:
            for i, row in enumerate(data["rows"]):
                assert "tienda" in row, f"Row {i} missing 'tienda' field: {row.keys()}"
                print(f"Row {i} - Order: {row.get('order_name')}, Line: {row.get('line_id')}, Tienda: {row.get('tienda')}")
        else:
            print("Note: No SALE lines found for this account, but endpoint structure is correct")


class TestReservasLinesWithTienda:
    """Test that ventas/lines endpoint includes 'tienda' field for RESERVA doc_tipo"""

    def test_ventas_lines_reserva_returns_tienda_field(self, api_client):
        """GET /api/cuentas/{id}/ventas/lines?doc_tipo=RESERVA returns 'tienda' field"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/lines",
            params={"doc_tipo": "RESERVA", "page": 1, "limit": 5}
        )
        assert response.status_code == 200, f"Request failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "rows" in data, "Response should contain 'rows' key"
        
        # If we have rows, verify tienda field exists in each row
        if len(data["rows"]) > 0:
            for i, row in enumerate(data["rows"]):
                assert "tienda" in row, f"Row {i} missing 'tienda' field: {row.keys()}"
                print(f"Row {i} - Order: {row.get('order_name')}, Line: {row.get('line_id')}, Tienda: {row.get('tienda')}")
        else:
            print("Note: No RESERVA lines found for this account, but endpoint structure is correct")


class TestTiendaDataQuality:
    """Additional tests for tienda data quality and completeness"""

    def test_tienda_values_are_strings_or_none(self, api_client):
        """Verify tienda values are either strings or null"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/orders",
            params={"doc_tipo": "SALE", "page": 1, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data.get("rows", []):
            tienda = row.get("tienda")
            assert tienda is None or isinstance(tienda, str), f"Tienda should be string or None, got: {type(tienda)}"

    def test_tienda_field_in_response_fields(self, api_client):
        """Verify the complete response structure includes tienda in proper position"""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_ACCOUNT_ID}/ventas/orders",
            params={"doc_tipo": "SALE", "page": 1, "limit": 1}
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("rows", [])) > 0:
            row = data["rows"][0]
            expected_fields = ["order_id", "order_name", "date_order", "state", "amount_total", "qty_total", "lines_count", "tienda"]
            for field in expected_fields:
                assert field in row, f"Missing expected field '{field}' in response"
            print(f"All expected fields present: {list(row.keys())}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
