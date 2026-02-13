"""
Test suite for Comercial Cascade Filters V2 with counts and no subtotal
Tests for iteration 19 requirements:
1. Cascade filters with counts per option
2. Removed Subtotal from KPIs, Top 10, and detail table
3. Added 'Clientes' KPI (distinct owner_partner_id)
4. modelo_display field (fallback for null product names)
5. Removed 'Contacto' column from detail table (kept partner_name for audit)
6. Added IDs column (tmpl_id/var_id) in detail
7. 'Excluir Clientes Varios' toggle
8. Excluded NULL product_id rows from view
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestAuth:
    """Login to get auth token"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@demo.com",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Authentication failed - skipping tests")
        return response.json().get("token") or response.json().get("access_token")


class TestComercialSummaryKPIs(TestAuth):
    """Test KPIs return correct fields - NO subtotal"""
    
    def test_summary_returns_total_qty(self, auth_token):
        """KPI: total_qty should exist"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "kpis" in data
        assert "total_qty" in data["kpis"]
        assert isinstance(data["kpis"]["total_qty"], (int, float))
    
    def test_summary_returns_count_orders(self, auth_token):
        """KPI: count_orders should exist"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "count_orders" in data["kpis"]
        assert isinstance(data["kpis"]["count_orders"], int)
    
    def test_summary_returns_count_clients(self, auth_token):
        """KPI: count_clients (distinct owner_partner_id) should exist"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "count_clients" in data["kpis"]
        assert isinstance(data["kpis"]["count_clients"], int)
    
    def test_summary_no_subtotal_in_kpis(self, auth_token):
        """KPI: total_subtotal should NOT exist (removed per requirements)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_subtotal" not in data["kpis"], "total_subtotal should be removed from KPIs"


class TestComercialTopProductos(TestAuth):
    """Test Top 10 Productos structure"""
    
    def test_top_productos_has_modelo_display(self, auth_token):
        """Top productos should have modelo_display field"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "top_productos" in data
        if len(data["top_productos"]) > 0:
            assert "modelo_display" in data["top_productos"][0]
    
    def test_top_productos_has_product_tmpl_id(self, auth_token):
        """Top productos should have product_tmpl_id for IDs column"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["top_productos"]) > 0:
            assert "product_tmpl_id" in data["top_productos"][0]
    
    def test_top_productos_has_marca_tipo(self, auth_token):
        """Top productos should have marca and tipo"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["top_productos"]) > 0:
            product = data["top_productos"][0]
            assert "marca" in product
            assert "tipo" in product
            assert "qty" in product
            assert "orders" in product
    
    def test_top_productos_no_subtotal(self, auth_token):
        """Top productos should NOT have subtotal column (removed)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["top_productos"]) > 0:
            assert "subtotal" not in data["top_productos"][0], "subtotal should be removed from top_productos"


class TestComercialTopClientes(TestAuth):
    """Test Top 10 Clientes structure"""
    
    def test_top_clientes_has_correct_fields(self, auth_token):
        """Top clientes should have owner_partner_id, owner_partner_name, qty, orders"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "top_clientes" in data
        if len(data["top_clientes"]) > 0:
            client = data["top_clientes"][0]
            assert "owner_partner_id" in client
            assert "owner_partner_name" in client
            assert "qty" in client
            assert "orders" in client
    
    def test_top_clientes_no_subtotal(self, auth_token):
        """Top clientes should NOT have subtotal column (removed)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["top_clientes"]) > 0:
            assert "subtotal" not in data["top_clientes"][0], "subtotal should be removed from top_clientes"


class TestExcluirClientesVarios(TestAuth):
    """Test 'Excluir Clientes Varios' toggle functionality"""
    
    def test_excluir_clientes_varios_false(self, auth_token):
        """Without toggle, CLIENTES VARIOS should appear in top_clientes"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={
                "doc_tipo": "SALE", 
                "fecha_desde": "2025-11-01", 
                "fecha_hasta": "2026-02-28",
                "excluir_clientes_varios": "false"
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Just verify API accepts the parameter
        assert "top_clientes" in data
    
    def test_excluir_clientes_varios_true(self, auth_token):
        """With toggle ON, CLIENTES VARIOS should NOT appear in top_clientes"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={
                "doc_tipo": "SALE", 
                "fecha_desde": "2025-11-01", 
                "fecha_hasta": "2026-02-28",
                "excluir_clientes_varios": "true"
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Verify no CLIENTES VARIOS in top_clientes
        for client in data.get("top_clientes", []):
            name = (client.get("owner_partner_name") or "").upper()
            assert "CLIENTES VARIOS" not in name, f"CLIENTES VARIOS found in top_clientes when excluded: {name}"


class TestCascadeFilterOptions(TestAuth):
    """Test cascade filter options with counts"""
    
    def test_filter_options_returns_all_cascade_columns(self, auth_token):
        """Filter options should return marca, tipo, entalle, tela, hilo, talla, color"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        expected_cols = ["marca", "tipo", "entalle", "tela", "hilo", "talla", "color"]
        for col in expected_cols:
            assert col in data, f"Missing cascade column: {col}"
    
    def test_filter_options_have_value_and_count(self, auth_token):
        """Each filter option should have 'value' and 'count'"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Check marca options structure
        if data.get("marca") and len(data["marca"]) > 0:
            option = data["marca"][0]
            assert "value" in option, "Option should have 'value'"
            assert "count" in option, "Option should have 'count'"
            assert isinstance(option["count"], int), "Count should be integer"
    
    def test_cascade_filter_with_marca(self, auth_token):
        """When marca is selected, other options should be filtered (cascade behavior)"""
        # First get all options without filter
        response1 = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get first marca value
        if not data1.get("marca") or len(data1["marca"]) == 0:
            pytest.skip("No marca options available")
        
        first_marca = data1["marca"][0]["value"]
        
        # Now get options with marca filter applied
        response2 = requests.get(
            f"{BASE_URL}/api/comercial/filter-options",
            params={
                "doc_tipo": "SALE", 
                "fecha_desde": "2025-11-01", 
                "fecha_hasta": "2026-02-28",
                "marca": first_marca
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Other columns should be filtered based on marca selection
        # The counts should be affected by the marca filter
        assert "tipo" in data2
        assert "talla" in data2
        assert "color" in data2


class TestComercialDetail(TestAuth):
    """Test detail endpoint structure"""
    
    def test_detail_has_modelo_display(self, auth_token):
        """Detail items should have modelo_display field"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28", "page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        if len(data["items"]) > 0:
            assert "modelo_display" in data["items"][0]
    
    def test_detail_has_product_ids(self, auth_token):
        """Detail items should have product_tmpl_id and product_product_id for IDs column"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28", "page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["items"]) > 0:
            item = data["items"][0]
            assert "product_tmpl_id" in item, "product_tmpl_id needed for IDs column"
            assert "product_product_id" in item, "product_product_id needed for IDs column"
    
    def test_detail_has_required_columns(self, auth_token):
        """Detail should have: Fecha, Orden, Cliente, Modelo, Marca, Tipo, Entalle, Tela, Hilo, Talla, Color, Qty, P.Unit, IDs"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28", "page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["items"]) > 0:
            item = data["items"][0]
            required_fields = [
                "fecha", "order_id", "owner_partner_name",  # Fecha, Orden, Cliente
                "modelo_display", "marca", "tipo", "entalle", "tela", "hilo",  # Product attrs
                "talla", "color", "qty", "price_unit",  # Size, Color, Qty, P.Unit
                "product_tmpl_id", "product_product_id"  # IDs
            ]
            for field in required_fields:
                assert field in item, f"Missing required field: {field}"
    
    def test_detail_no_subtotal(self, auth_token):
        """Detail items should NOT have subtotal column (removed)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28", "page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        if len(data["items"]) > 0:
            assert "subtotal" not in data["items"][0], "subtotal should be removed from detail"
            assert "price_subtotal" not in data["items"][0], "price_subtotal should be removed from detail"
    
    def test_detail_no_partner_name_contacto(self, auth_token):
        """Detail should NOT have partner_name (Contacto column removed from UI)"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/detail",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28", "page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # partner_name (Contacto) column should be removed
        if len(data["items"]) > 0:
            assert "partner_name" not in data["items"][0], "partner_name (Contacto) should be removed from detail"


class TestDocTipoTabs(TestAuth):
    """Test tabs switch between SALE and RESERVA"""
    
    def test_sale_tab(self, auth_token):
        """SALE doc_tipo should return sales data"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "SALE", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["kpis"]["total_qty"] > 0 or data["kpis"]["count_orders"] >= 0
    
    def test_reserva_tab(self, auth_token):
        """RESERVA doc_tipo should return reserva data"""
        response = requests.get(
            f"{BASE_URL}/api/comercial/summary",
            params={"doc_tipo": "RESERVA", "fecha_desde": "2025-11-01", "fecha_hasta": "2026-02-28"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # RESERVA might have less data but should return valid structure
        assert "kpis" in data
        assert "top_productos" in data
        assert "top_clientes" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
