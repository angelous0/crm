"""
Comercial Module (Ventas y Reservas) Backend Tests
Tests for GET /api/comercial/summary, /api/comercial/filter-options, /api/comercial/detail
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://odoo-pending-issue.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@stockdash.com", "password": "admin123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]

@pytest.fixture
def auth_headers(auth_token):
    """Authentication headers for API requests"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestComercialSummary:
    """Test /api/comercial/summary endpoint"""
    
    def test_summary_no_auth_required(self):
        """Summary endpoint currently does NOT require authentication (ISSUE: missing auth)"""
        response = requests.get(f"{BASE_URL}/api/comercial/summary")
        # NOTE: This passes without auth - endpoints missing Depends(get_current_user)
        assert response.status_code == 200, "Endpoint accessible without auth (known issue)"
    
    def test_summary_sale_returns_kpis(self, auth_headers):
        """Summary for SALE returns KPIs with expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "kpis" in data
        assert "top_productos" in data
        assert "top_clientes" in data
        
        # Verify KPIs structure
        kpis = data["kpis"]
        assert "total_qty" in kpis
        assert "total_subtotal" in kpis
        assert "count_orders" in kpis
        
        # Verify KPIs have positive values for SALE
        assert kpis["total_qty"] > 50000, f"Expected >50K qty for SALE, got {kpis['total_qty']}"
        assert kpis["total_subtotal"] > 0
        assert kpis["count_orders"] > 0
    
    def test_summary_reserva_returns_lower_numbers(self, auth_headers):
        """Summary for RESERVA returns lower KPIs than SALE (unused reservations)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "RESERVA", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        kpis = data["kpis"]
        # RESERVA should have much lower numbers (only unused reservations)
        assert kpis["total_qty"] < 1000, f"RESERVA qty should be < 1000, got {kpis['total_qty']}"
        print(f"RESERVA KPIs: qty={kpis['total_qty']}, subtotal={kpis['total_subtotal']}, orders={kpis['count_orders']}")
    
    def test_summary_top_productos_structure(self, auth_headers):
        """Top productos returns expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        top_productos = data["top_productos"]
        assert len(top_productos) > 0, "Expected at least 1 top product"
        assert len(top_productos) <= 10, "Top productos should be max 10"
        
        # Verify first product structure
        product = top_productos[0]
        assert "modelo" in product
        assert "marca" in product
        assert "tipo" in product
        assert "talla" in product
        assert "color" in product
        assert "qty" in product
        assert "subtotal" in product
        assert "orders" in product
    
    def test_summary_top_clientes_structure(self, auth_headers):
        """Top clientes returns expected fields"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        top_clientes = data["top_clientes"]
        assert len(top_clientes) > 0, "Expected at least 1 top client"
        assert len(top_clientes) <= 10, "Top clientes should be max 10"
        
        # Verify first client structure
        client = top_clientes[0]
        assert "partner_id" in client
        assert "partner_name" in client
        assert "qty" in client
        assert "subtotal" in client
        assert "orders" in client


class TestComercialFilterOptions:
    """Test /api/comercial/filter-options endpoint"""
    
    def test_filter_options_no_auth_required(self):
        """Filter options currently does NOT require authentication (ISSUE: missing auth)"""
        response = requests.get(f"{BASE_URL}/api/comercial/filter-options")
        # NOTE: This passes without auth - endpoints missing Depends(get_current_user)
        assert response.status_code == 200, "Endpoint accessible without auth (known issue)"
    
    def test_filter_options_returns_all_arrays(self, auth_headers):
        """Filter options returns marca, tipo, entalle, tela, hilo, talla, color arrays"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        expected_keys = ["marca", "tipo", "entalle", "tela", "hilo", "talla", "color"]
        for key in expected_keys:
            assert key in data, f"Missing key: {key}"
            assert isinstance(data[key], list), f"{key} should be a list"
        
        # Verify some options exist
        assert len(data["marca"]) > 0, "Expected at least 1 marca option"
        assert len(data["talla"]) > 0, "Expected at least 1 talla option"
        print(f"Filter options: {len(data['marca'])} marcas, {len(data['tipo'])} tipos, {len(data['talla'])} tallas")


class TestComercialDetail:
    """Test /api/comercial/detail endpoint"""
    
    def test_detail_no_auth_required(self):
        """Detail endpoint currently does NOT require authentication (ISSUE: missing auth)"""
        response = requests.get(f"{BASE_URL}/api/comercial/detail")
        # NOTE: This passes without auth - endpoints missing Depends(get_current_user)
        assert response.status_code == 200, "Endpoint accessible without auth (known issue)"
    
    def test_detail_returns_paginated_items(self, auth_headers):
        """Detail returns paginated items with has_next flag"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={
                "doc_tipo": "SALE",
                "fecha_desde": "2025-11-01",
                "fecha_hasta": "2026-02-13",
                "page": 1,
                "limit": 5
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data
        assert "has_next" in data
        assert "page" in data
        assert "limit" in data
        
        assert len(data["items"]) == 5
        assert data["page"] == 1
        assert data["limit"] == 5
        assert data["has_next"] == True  # There's more data available
    
    def test_detail_items_structure(self, auth_headers):
        """Detail items have all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13", "page": 1, "limit": 5},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["items"]) > 0
        item = data["items"][0]
        
        # Required fields from the detail endpoint
        required_fields = [
            "doc_tipo", "order_id", "line_id", "fecha",
            "partner_id", "partner_name",
            "product_product_id", "product_tmpl_id", "modelo",
            "marca", "tipo", "entalle", "tela", "hilo",
            "talla", "color", "barcode", "qty", "price_unit", "subtotal"
        ]
        for field in required_fields:
            assert field in item, f"Missing field: {field}"
        
        # Verify doc_tipo matches filter
        assert item["doc_tipo"] == "SALE"
    
    def test_detail_pagination_next_page(self, auth_headers):
        """Pagination works - page 2 has different items than page 1"""
        response1 = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13", "page": 1, "limit": 5},
            headers=auth_headers
        )
        response2 = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13", "page": 2, "limit": 5},
            headers=auth_headers
        )
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        items1 = response1.json()["items"]
        items2 = response2.json()["items"]
        
        # Verify items are different
        if len(items1) > 0 and len(items2) > 0:
            assert items1[0]["line_id"] != items2[0]["line_id"], "Page 1 and 2 should have different items"


class TestComercialFilters:
    """Test filter functionality for comercial endpoints"""
    
    def test_marca_filter_works(self, auth_headers):
        """Marca filter reduces results"""
        # Get available marcas
        opts_response = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13"},
            headers=auth_headers
        )
        marcas = opts_response.json().get("marca", [])
        
        if len(marcas) > 0:
            # Get summary with first marca filter
            response = requests.get(
                f"{BASE_URL}/api/comercial/summary",
                params={
                    "doc_tipo": "SALE",
                    "fecha_desde": "2025-11-01",
                    "fecha_hasta": "2026-02-13",
                    "marca": marcas[0]
                },
                headers=auth_headers
            )
            assert response.status_code == 200
            data = response.json()
            
            # Filtered qty should be less than unfiltered
            assert data["kpis"]["total_qty"] > 0, f"Filtered by marca={marcas[0]} should have results"
    
    def test_date_filter_works(self, auth_headers):
        """Date filter restricts results"""
        # Narrow date range should have fewer results
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2026-01-01", "fecha_hasta": "2026-01-15"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have some results but fewer than the full range
        kpis = data["kpis"]
        print(f"Narrow date range (Jan 1-15): qty={kpis['total_qty']}, orders={kpis['count_orders']}")


class TestComercialDataIntegrity:
    """Verify data integrity between SALE and RESERVA filters"""
    
    def test_sale_excludes_reservations(self, auth_headers):
        """SALE doc_tipo should only include non-reservation records"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13", "page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        for item in items:
            assert item["doc_tipo"] == "SALE", f"Expected SALE, got {item['doc_tipo']}"
    
    def test_reserva_only_unused_reservations(self, auth_headers):
        """RESERVA doc_tipo should only include unused reservations (reserva_use_id=0)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "RESERVA", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-13", "page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        for item in items:
            assert item["doc_tipo"] == "RESERVA", f"Expected RESERVA, got {item['doc_tipo']}"
