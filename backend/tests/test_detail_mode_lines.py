"""
Test suite for Detail Mode (Lines) Feature - Modo Detalle/Lineas Toggle

Tests the paginated line-item endpoints for:
- GET /api/comercial/lines - Global order lines (ventas/reservas)
- GET /api/creditos/lines - Global invoice lines (creditos)
- GET /api/cuentas/{id}/ventas/lines - Account-level order lines
- GET /api/cuentas/{id}/creditos/lines - Account-level invoice lines

KPI consistency: metrics should be same in header and lines mode
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pendientes-crm.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@crm.com",
        "password": "admin123"
    })
    if resp.status_code == 200:
        return resp.json().get("token")
    # Try alternate credentials
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@stockdash.com",
        "password": "admin123"
    })
    if resp.status_code == 200:
        return resp.json().get("token")
    pytest.skip("Authentication failed - skipping tests")

@pytest.fixture
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestComercialLinesEndpoint:
    """Tests for GET /api/comercial/lines endpoint (global order lines)"""
    
    def test_comercial_lines_requires_auth(self):
        """Lines endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/comercial/lines")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    
    def test_comercial_lines_returns_paginated_data(self, api_client):
        """Lines endpoint returns paginated line-level data"""
        resp = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"limit": 10})
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "metrics" in data, "Response must include metrics"
        assert "rows" in data, "Response must include rows"
        assert "page" in data, "Response must include page"
        assert "limit" in data, "Response must include limit"
        assert "has_next" in data, "Response must include has_next"
    
    def test_comercial_lines_row_structure(self, api_client):
        """Lines rows should have expected line-level fields"""
        resp = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        
        if data["rows"]:
            row = data["rows"][0]
            # Line-level fields
            assert "line_id" in row or "qty" in row, "Row should have line-level fields"
            assert "modelo_display" in row, "Row should have modelo_display"
            assert "qty" in row, "Row should have qty"
            assert "price_unit" in row, "Row should have price_unit"
            assert "subtotal" in row, "Row should have subtotal"
            # Product attributes
            assert "talla" in row, "Row should have talla"
            assert "color" in row, "Row should have color"
    
    def test_comercial_lines_metrics_match_headers(self, api_client):
        """KPI metrics should be consistent between headers and lines mode"""
        # Get header mode metrics
        resp_headers = api_client.get(f"{BASE_URL}/api/comercial/orders", params={"doc_tipo": "SALE", "limit": 1})
        assert resp_headers.status_code == 200
        header_metrics = resp_headers.json().get("metrics", {})
        
        # Get lines mode metrics
        resp_lines = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"doc_tipo": "SALE", "limit": 1})
        assert resp_lines.status_code == 200
        lines_metrics = resp_lines.json().get("metrics", {})
        
        # KPIs should match
        assert header_metrics.get("orders_count") == lines_metrics.get("orders_count"), \
            f"orders_count mismatch: headers={header_metrics.get('orders_count')} vs lines={lines_metrics.get('orders_count')}"
        assert header_metrics.get("qty_total") == lines_metrics.get("qty_total"), \
            f"qty_total mismatch: headers={header_metrics.get('qty_total')} vs lines={lines_metrics.get('qty_total')}"
    
    def test_comercial_lines_doc_tipo_filter(self, api_client):
        """Lines endpoint should filter by doc_tipo (SALE/RESERVA)"""
        # Test SALE
        resp_sale = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"doc_tipo": "SALE", "limit": 5})
        assert resp_sale.status_code == 200
        sale_data = resp_sale.json()
        
        # Test RESERVA
        resp_reserva = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"doc_tipo": "RESERVA", "limit": 5})
        assert resp_reserva.status_code == 200
        reserva_data = resp_reserva.json()
        
        # Both should return valid responses
        assert "rows" in sale_data
        assert "rows" in reserva_data
    
    def test_comercial_lines_date_filter(self, api_client):
        """Lines endpoint should filter by date range"""
        resp = api_client.get(f"{BASE_URL}/api/comercial/lines", params={
            "fecha_desde": "2025-01-01",
            "fecha_hasta": "2025-12-31",
            "limit": 5
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "rows" in data
    
    def test_comercial_lines_pagination(self, api_client):
        """Lines endpoint pagination should work correctly"""
        # Get page 1
        resp1 = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"page": 1, "limit": 5})
        assert resp1.status_code == 200
        data1 = resp1.json()
        
        if data1["has_next"]:
            # Get page 2
            resp2 = api_client.get(f"{BASE_URL}/api/comercial/lines", params={"page": 2, "limit": 5})
            assert resp2.status_code == 200
            data2 = resp2.json()
            assert data2["page"] == 2


class TestCreditosLinesEndpoint:
    """Tests for GET /api/creditos/lines endpoint (global invoice lines)"""
    
    def test_creditos_lines_requires_auth(self):
        """Lines endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/creditos/lines")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    
    def test_creditos_lines_returns_paginated_data(self, api_client):
        """Lines endpoint returns paginated line-level data"""
        resp = api_client.get(f"{BASE_URL}/api/creditos/lines", params={"limit": 10})
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "metrics" in data, "Response must include metrics"
        assert "rows" in data, "Response must include rows"
        assert "page" in data, "Response must include page"
    
    def test_creditos_lines_row_structure(self, api_client):
        """Lines rows should have expected line-level fields"""
        resp = api_client.get(f"{BASE_URL}/api/creditos/lines", params={"limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        
        if data["rows"]:
            row = data["rows"][0]
            # Invoice-level fields
            assert "invoice_id" in row, "Row should have invoice_id"
            assert "invoice_number" in row, "Row should have invoice_number"
            assert "date_invoice" in row, "Row should have date_invoice"
            # Line-level fields
            assert "qty" in row, "Row should have qty"
            assert "price_unit" in row, "Row should have price_unit"
            assert "price_subtotal" in row, "Row should have price_subtotal"
    
    def test_creditos_lines_metrics_match_headers(self, api_client):
        """KPI metrics should be consistent between headers and lines mode"""
        # Get header mode metrics
        resp_headers = api_client.get(f"{BASE_URL}/api/creditos/invoices", params={"limit": 1})
        assert resp_headers.status_code == 200
        header_metrics = resp_headers.json().get("metrics", {})
        
        # Get lines mode metrics
        resp_lines = api_client.get(f"{BASE_URL}/api/creditos/lines", params={"limit": 1})
        assert resp_lines.status_code == 200
        lines_metrics = resp_lines.json().get("metrics", {})
        
        # KPIs should match
        assert header_metrics.get("invoices_count") == lines_metrics.get("invoices_count"), \
            f"invoices_count mismatch"
        assert header_metrics.get("saldo_total") == lines_metrics.get("saldo_total"), \
            f"saldo_total mismatch"
    
    def test_creditos_lines_state_filter(self, api_client):
        """Lines endpoint should filter by invoice state"""
        resp = api_client.get(f"{BASE_URL}/api/creditos/lines", params={"state": "open", "limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert "rows" in data


class TestCuentaVentasLinesEndpoint:
    """Tests for GET /api/cuentas/{id}/ventas/lines endpoint"""
    
    def test_cuenta_ventas_lines_requires_auth(self):
        """Cuenta ventas lines endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/1/ventas/lines")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    
    def test_cuenta_ventas_lines_returns_data(self, api_client):
        """Cuenta ventas lines endpoint returns line-level data"""
        # First get a cuenta ID from the cuentas list
        resp_cuentas = api_client.get(f"{BASE_URL}/api/cuentas", params={"limit": 1})
        if resp_cuentas.status_code != 200 or not resp_cuentas.json().get("items"):
            pytest.skip("No cuentas available for testing")
        
        cuenta = resp_cuentas.json()["items"][0]
        cuenta_id = cuenta.get("cuenta_partner_odoo_id")
        
        resp = api_client.get(f"{BASE_URL}/api/cuentas/{cuenta_id}/ventas/lines", params={
            "doc_tipo": "SALE",
            "limit": 10
        })
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "rows" in data, "Response must include rows"
        assert "page" in data, "Response must include page"
        assert "has_next" in data, "Response must include has_next"


class TestCuentaCreditosLinesEndpoint:
    """Tests for GET /api/cuentas/{id}/creditos/lines endpoint"""
    
    def test_cuenta_creditos_lines_requires_auth(self):
        """Cuenta creditos lines endpoint should require authentication"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/1/creditos/lines")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"
    
    def test_cuenta_creditos_lines_returns_data(self, api_client):
        """Cuenta creditos lines endpoint returns line-level data"""
        # First get a cuenta ID from the cuentas list
        resp_cuentas = api_client.get(f"{BASE_URL}/api/cuentas", params={"limit": 1})
        if resp_cuentas.status_code != 200 or not resp_cuentas.json().get("items"):
            pytest.skip("No cuentas available for testing")
        
        cuenta = resp_cuentas.json()["items"][0]
        cuenta_id = cuenta.get("cuenta_partner_odoo_id")
        
        resp = api_client.get(f"{BASE_URL}/api/cuentas/{cuenta_id}/creditos/lines", params={
            "limit": 10
        })
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify response structure
        assert "rows" in data, "Response must include rows"
        assert "page" in data, "Response must include page"
        assert "has_next" in data, "Response must include has_next"


class TestKPIConsistency:
    """Tests to verify KPIs remain consistent between header and detail modes"""
    
    def test_comercial_kpi_consistency_with_filters(self, api_client):
        """KPIs should be consistent with filters applied"""
        # Apply some filters
        filters = {
            "doc_tipo": "SALE",
            "fecha_desde": "2025-01-01",
            "limit": 1
        }
        
        # Header mode
        resp_headers = api_client.get(f"{BASE_URL}/api/comercial/orders", params=filters)
        assert resp_headers.status_code == 200
        header_metrics = resp_headers.json().get("metrics", {})
        
        # Lines mode with same filters
        resp_lines = api_client.get(f"{BASE_URL}/api/comercial/lines", params=filters)
        assert resp_lines.status_code == 200
        lines_metrics = resp_lines.json().get("metrics", {})
        
        # Orders count should match
        assert header_metrics.get("orders_count") == lines_metrics.get("orders_count"), \
            "orders_count should be consistent between modes"
        
        # Qty total should match
        assert header_metrics.get("qty_total") == lines_metrics.get("qty_total"), \
            "qty_total should be consistent between modes"
        
        # Clientes count should match
        assert header_metrics.get("clientes_count") == lines_metrics.get("clientes_count"), \
            "clientes_count should be consistent between modes"
    
    def test_creditos_kpi_consistency_with_filters(self, api_client):
        """Creditos KPIs should be consistent with filters applied"""
        filters = {"limit": 1}
        
        # Header mode
        resp_headers = api_client.get(f"{BASE_URL}/api/creditos/invoices", params=filters)
        assert resp_headers.status_code == 200
        header_metrics = resp_headers.json().get("metrics", {})
        
        # Lines mode with same filters
        resp_lines = api_client.get(f"{BASE_URL}/api/creditos/lines", params=filters)
        assert resp_lines.status_code == 200
        lines_metrics = resp_lines.json().get("metrics", {})
        
        # Invoices count should match
        assert header_metrics.get("invoices_count") == lines_metrics.get("invoices_count"), \
            "invoices_count should be consistent between modes"
        
        # Saldo total should match
        assert header_metrics.get("saldo_total") == lines_metrics.get("saldo_total"), \
            "saldo_total should be consistent between modes"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
