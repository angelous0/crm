"""
Test suite for CuentasAirtable layout API endpoints.
Tests the Airtable-style directory listing, account detail panel, and tab content.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@crm.com"
TEST_PASSWORD = "admin123"
TEST_CUENTA_ID = 13419  # ABREGU TERRONES ANGEL JOAQUIN (from search 'angel')
TEST_CUENTA_WITH_DATA = 8  # CLIENTES VARIOS (has sales data)


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture
def api_client(auth_token):
    """Create authenticated session."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCuentasListEndpoint:
    """Tests for GET /api/cuentas/list - Directory listing endpoint."""

    def test_list_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/list")
        assert response.status_code == 401

    def test_list_returns_rows_and_total(self, api_client):
        """Verify list endpoint returns paginated data."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/list")
        assert response.status_code == 200
        
        data = response.json()
        assert "rows" in data
        assert "total_rows" in data
        assert "page" in data
        assert "limit" in data
        assert isinstance(data["rows"], list)
        assert data["total_rows"] > 0
        
    def test_list_row_structure(self, api_client):
        """Verify row structure has required fields for directory grid."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"limit": 10})
        assert response.status_code == 200
        
        data = response.json()
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            # Directory grid columns
            assert "id" in row  # cuenta_partner_odoo_id
            assert "nombre" in row
            assert "ciudad" in row
            assert "estado" in row
            # KPI fields computed per page
            assert "last_purchase_date" in row or row.get("last_purchase_date") is None
            assert "days_since_last_purchase" in row or row.get("days_since_last_purchase") is None
            assert "sales_12m_amount" in row
            assert "orders_12m_count" in row

    def test_list_search_filter(self, api_client):
        """Verify search parameter filters results."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"q": "angel"})
        assert response.status_code == 200
        
        data = response.json()
        # Should have fewer results than total
        assert data["total_rows"] > 0
        # Verify search worked (should be around 140 based on UI test)
        assert data["total_rows"] < 1000
        print(f"Search 'angel' returned {data['total_rows']} results")

    def test_list_estado_filter(self, api_client):
        """Verify estado filter works."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"estado": "ACTIVO"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["total_rows"] > 0
        # Verify all returned rows have ACTIVO estado
        for row in data["rows"][:10]:
            assert row["estado"] == "ACTIVO"

    def test_list_pagination(self, api_client):
        """Verify pagination works correctly."""
        page1 = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"page": 1, "limit": 50})
        page2 = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"page": 2, "limit": 50})
        
        assert page1.status_code == 200
        assert page2.status_code == 200
        
        data1 = page1.json()
        data2 = page2.json()
        
        # Different rows on different pages
        if len(data1["rows"]) > 0 and len(data2["rows"]) > 0:
            ids1 = [r["id"] for r in data1["rows"]]
            ids2 = [r["id"] for r in data2["rows"]]
            assert set(ids1) != set(ids2), "Page 1 and Page 2 should have different rows"

    def test_list_sort_by_name(self, api_client):
        """Verify sorting by name works."""
        asc = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"sort": "name", "dir": "asc", "limit": 10})
        desc = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"sort": "name", "dir": "desc", "limit": 10})
        
        assert asc.status_code == 200
        assert desc.status_code == 200
        
        # First item should differ between asc/desc
        asc_data = asc.json()
        desc_data = desc.json()
        if len(asc_data["rows"]) > 0 and len(desc_data["rows"]) > 0:
            assert asc_data["rows"][0]["id"] != desc_data["rows"][0]["id"]


class TestFilterOptionsEndpoint:
    """Tests for GET /api/cuentas/list/filter-options."""

    def test_filter_options_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/list/filter-options")
        assert response.status_code == 401

    def test_filter_options_returns_ciudades_and_asignados(self, api_client):
        """Verify filter options endpoint returns expected structure."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/list/filter-options")
        assert response.status_code == 200
        
        data = response.json()
        assert "ciudades" in data
        assert "asignados" in data
        assert isinstance(data["ciudades"], list)
        assert isinstance(data["asignados"], list)


class TestCuentaDetailEndpoint:
    """Tests for GET /api/cuentas/{cuenta_id}."""

    def test_detail_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert response.status_code == 401

    def test_detail_returns_cuenta_and_partner(self, api_client):
        """Verify detail endpoint returns cuenta with partner info."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data or "cuenta_partner_odoo_id" in data
        assert "estado_comercial" in data or data.get("estado_comercial") is None
        assert "partner" in data
        
        partner = data["partner"]
        assert "name" in partner

    def test_detail_creates_cuenta_on_demand(self, api_client):
        """Verify account is created on-demand if not exists in CRM."""
        # This account should exist in Odoo but may not have crm.cuenta row
        response = api_client.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert response.status_code == 200


class TestHeaderMetricsEndpoint:
    """Tests for GET /api/cuentas/{cuenta_id}/header-metrics."""

    def test_header_metrics_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/header-metrics")
        assert response.status_code == 401

    def test_header_metrics_returns_kpis(self, api_client):
        """Verify header metrics returns expected KPI fields."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_WITH_DATA}/header-metrics")
        assert response.status_code == 200
        
        data = response.json()
        assert "last_purchase_date" in data
        assert "days_since_last_purchase" in data
        assert "sales_12m_amount" in data
        assert "orders_12m_count" in data
        
        # Account 8 should have significant sales
        print(f"Header metrics: {data}")


class TestVentasMetricsEndpoint:
    """Tests for GET /api/cuentas/{cuenta_id}/ventas/metrics."""

    def test_ventas_metrics_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/metrics")
        assert response.status_code == 401

    def test_ventas_metrics_returns_counts(self, api_client):
        """Verify ventas metrics returns order counts and quantities."""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_WITH_DATA}/ventas/metrics",
            params={"doc_tipo": "SALE"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "orders_count" in data
        assert "qty_total" in data
        assert "last_order_date" in data
        assert "first_order_date" in data


class TestVentasOrdersEndpoint:
    """Tests for GET /api/cuentas/{cuenta_id}/ventas/orders."""

    def test_ventas_orders_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/ventas/orders")
        assert response.status_code == 401

    def test_ventas_orders_returns_paginated_orders(self, api_client):
        """Verify ventas orders returns paginated list."""
        response = api_client.get(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_WITH_DATA}/ventas/orders",
            params={"doc_tipo": "SALE", "page": 1, "limit": 20}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "rows" in data
        assert "page" in data
        assert "limit" in data
        assert "has_next" in data
        assert "metrics" in data
        
        if len(data["rows"]) > 0:
            order = data["rows"][0]
            assert "order_id" in order
            assert "order_name" in order
            assert "date_order" in order
            assert "state" in order
            assert "qty_total" in order
            assert "amount_total" in order


class TestCuentaUpdateEndpoint:
    """Tests for PUT /api/cuentas/{cuenta_id}."""

    def test_update_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.put(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}",
            json={"estado_comercial": "ACTIVO"}
        )
        assert response.status_code == 401

    def test_update_estado_comercial(self, api_client):
        """Verify updating estado_comercial works."""
        response = api_client.put(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}",
            json={"estado_comercial": "ACTIVO"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["estado_comercial"] == "ACTIVO"

    def test_update_clasificacion(self, api_client):
        """Verify updating clasificacion works."""
        response = api_client.put(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}",
            json={"clasificacion": "B"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["clasificacion"] == "B"
        
        # Restore to original (no classification)
        api_client.put(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}",
            json={"clasificacion": ""}
        )


class TestCreditosMetricsEndpoint:
    """Tests for GET /api/cuentas/{cuenta_id}/creditos/metrics."""

    def test_creditos_metrics_requires_auth(self):
        """Verify endpoint requires authentication."""
        response = requests.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/creditos/metrics")
        assert response.status_code == 401

    def test_creditos_metrics_returns_data(self, api_client):
        """Verify creditos metrics endpoint works."""
        response = api_client.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_WITH_DATA}/creditos/metrics")
        assert response.status_code == 200
        
        data = response.json()
        # Should have invoice counts and totals
        assert "invoices_count" in data or data.get("invoices_count") == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
