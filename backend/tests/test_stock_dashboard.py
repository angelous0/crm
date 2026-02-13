"""
Test suite for Stock Dashboard endpoints.
Tests:
1. GET /api/stock-dashboard/filtros - distinct filter values
2. GET /api/stock-dashboard/kpis - KPI metrics (total_stock, modelos, variantes, tiendas)
3. GET /api/stock-dashboard/kpis with filters - filtered KPIs
4. GET /api/stock-dashboard/pivot-modelo - Modelo x Talla pivot table
5. GET /api/stock-dashboard/pivot-modelo with filters - filtered pivot
6. GET /api/stock-dashboard/pivot-modelo-tienda - MAIN: Modelo x Tienda pivot (Power BI style)
7. GET /api/stock-dashboard/pivot-modelo-tienda with filters - filtered pivot  
8. GET /api/stock-dashboard/pivot-tienda?pivot_tienda=X - Color x Talla matrix for a tienda
9. GET /api/stock-dashboard/detalle - paginated detail rows
10. GET /api/stock-dashboard/detalle with filters - filtered detail
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_EMAIL = "test_cat@crm.com"
TEST_PASSWORD = "test123"


class TestAuthSetup:
    """Authentication setup for protected endpoints"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        # Try login first
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        
        # If login fails, try register
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "nombre": "Test Stock User"
        })
        if response.status_code == 200:
            return response.json().get("token")
        
        pytest.skip("Authentication failed - cannot get token")

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with authorization"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestStockDashboardFiltros(TestAuthSetup):
    """Test GET /api/stock-dashboard/filtros endpoint"""

    def test_get_filtros(self, auth_headers):
        """GET /api/stock-dashboard/filtros - returns distinct values for all filter dropdowns"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify all expected filter arrays are present
        expected_filters = ['tiendas', 'marcas', 'tipos', 'entalles', 'telas', 'tallas', 'colors', 'modelos']
        for f in expected_filters:
            assert f in data, f"Response should have '{f}'"
            assert isinstance(data[f], list), f"'{f}' should be a list"
        
        print(f"✓ Filter options loaded:")
        print(f"  - Tiendas: {len(data['tiendas'])} (expected ~11)")
        print(f"  - Marcas: {len(data['marcas'])}")
        print(f"  - Tipos: {len(data['tipos'])}")
        print(f"  - Entalles: {len(data['entalles'])}")
        print(f"  - Telas: {len(data['telas'])}")
        print(f"  - Tallas: {len(data['tallas'])}")
        print(f"  - Colors: {len(data['colors'])}")
        print(f"  - Modelos: {len(data['modelos'])}")


class TestStockDashboardKPIs(TestAuthSetup):
    """Test GET /api/stock-dashboard/kpis endpoint"""

    def test_get_kpis_no_filter(self, auth_headers):
        """GET /api/stock-dashboard/kpis - returns KPI metrics without filters"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/kpis", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify KPI fields
        assert "total_stock" in data, "Response should have 'total_stock'"
        assert "modelos" in data, "Response should have 'modelos'"
        assert "variantes" in data, "Response should have 'variantes'"
        assert "tiendas_con_stock" in data, "Response should have 'tiendas_con_stock'"
        
        # Verify types
        assert isinstance(data["total_stock"], (int, float)), "total_stock should be numeric"
        assert isinstance(data["modelos"], int), "modelos should be int"
        assert isinstance(data["variantes"], int), "variantes should be int"
        assert isinstance(data["tiendas_con_stock"], int), "tiendas_con_stock should be int"
        
        print(f"✓ KPIs (no filter):")
        print(f"  - Total Stock: {data['total_stock']} (expected ~47987)")
        print(f"  - Modelos: {data['modelos']} (expected ~1153)")
        print(f"  - Variantes: {data['variantes']} (expected ~7027)")
        print(f"  - Tiendas con Stock: {data['tiendas_con_stock']} (expected ~11)")

    def test_get_kpis_with_tienda_filter(self, auth_headers):
        """GET /api/stock-dashboard/kpis with tienda filter - KPIs should decrease"""
        # Get a tienda first
        filtros_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        if filtros_resp.status_code != 200:
            pytest.skip("Cannot get filter options")
        tiendas = filtros_resp.json().get("tiendas", [])
        if len(tiendas) == 0:
            pytest.skip("No tiendas available")
        
        test_tienda = tiendas[0]
        
        # Get filtered KPIs
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/kpis",
            params={"tienda": test_tienda},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ KPIs filtered by tienda '{test_tienda}':")
        print(f"  - Total Stock: {data['total_stock']}")
        print(f"  - Modelos: {data['modelos']}")
        print(f"  - Variantes: {data['variantes']}")
        print(f"  - Tiendas con Stock: {data['tiendas_con_stock']} (should be 1)")
        
        # Should only show 1 tienda when filtering by single tienda
        assert data["tiendas_con_stock"] == 1, "Filtered by 1 tienda should show 1 tienda"

    def test_get_kpis_with_marca_filter(self, auth_headers):
        """GET /api/stock-dashboard/kpis with marca filter"""
        # Get a marca first
        filtros_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        if filtros_resp.status_code != 200:
            pytest.skip("Cannot get filter options")
        marcas = filtros_resp.json().get("marcas", [])
        if len(marcas) == 0:
            pytest.skip("No marcas available")
        
        test_marca = marcas[0]
        
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/kpis",
            params={"marca": test_marca},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ KPIs filtered by marca '{test_marca}':")
        print(f"  - Total Stock: {data['total_stock']}")
        print(f"  - Modelos: {data['modelos']}")

    def test_get_kpis_with_es_lq_filter(self, auth_headers):
        """GET /api/stock-dashboard/kpis with es_lq=si filter"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/kpis",
            params={"es_lq": "si"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ KPIs filtered by es_lq=si (LQ products only):")
        print(f"  - Total Stock: {data['total_stock']}")
        print(f"  - Modelos: {data['modelos']}")


class TestStockDashboardPivotModelo(TestAuthSetup):
    """Test GET /api/stock-dashboard/pivot-modelo endpoint"""

    def test_pivot_modelo_no_filter(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo - Modelo x Talla pivot table"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/pivot-modelo", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "tallas" in data, "Response should have 'tallas'"
        assert "rows" in data, "Response should have 'rows'"
        assert "totals_by_talla" in data, "Response should have 'totals_by_talla'"
        assert "grand_total" in data, "Response should have 'grand_total'"
        assert "total_modelos" in data, "Response should have 'total_modelos'"
        assert "page" in data, "Response should have 'page'"
        
        # Verify rows structure
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "modelo" in row, "Row should have 'modelo'"
            assert "marca" in row, "Row should have 'marca'"
            assert "values" in row, "Row should have 'values' (talla -> qty mapping)"
            assert "total" in row, "Row should have 'total'"
        
        print(f"✓ Pivot Modelo x Talla:")
        print(f"  - Tallas: {data['tallas']}")
        print(f"  - Rows (first page): {len(data['rows'])}")
        print(f"  - Total modelos: {data['total_modelos']}")
        print(f"  - Grand total stock: {data['grand_total']}")
        
        # First model should be highest stock
        if len(data["rows"]) > 0:
            first_model = data["rows"][0]
            print(f"  - First model: {first_model['modelo']} ({first_model['marca']}) - Total: {first_model['total']}")

    def test_pivot_modelo_with_tienda_filter(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo with tienda filter"""
        # Get a tienda first
        filtros_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        if filtros_resp.status_code != 200:
            pytest.skip("Cannot get filter options")
        tiendas = filtros_resp.json().get("tiendas", [])
        if len(tiendas) == 0:
            pytest.skip("No tiendas available")
        
        test_tienda = tiendas[0]
        
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo",
            params={"tienda": test_tienda},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Pivot Modelo filtered by tienda '{test_tienda}':")
        print(f"  - Total modelos: {data['total_modelos']}")
        print(f"  - Grand total stock: {data['grand_total']}")

    def test_pivot_modelo_pagination(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo pagination"""
        # Get page 1
        response1 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo",
            params={"page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get page 2
        response2 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo",
            params={"page": 2, "limit": 10},
            headers=auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Pages should have different data (if enough data)
        if len(data1["rows"]) >= 10 and len(data2["rows"]) > 0:
            assert data1["rows"][0]["modelo"] != data2["rows"][0]["modelo"], "Page 2 should have different models"
            print(f"✓ Pagination verified - Page 1 first: {data1['rows'][0]['modelo']}, Page 2 first: {data2['rows'][0]['modelo']}")
        else:
            print(f"✓ Pagination works (limited data - page1: {len(data1['rows'])} rows, page2: {len(data2['rows'])} rows)")


class TestStockDashboardPivotModeloTienda(TestAuthSetup):
    """Test GET /api/stock-dashboard/pivot-modelo-tienda endpoint - MAIN PIVOT (Power BI style)"""

    def test_pivot_modelo_tienda_no_filter(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo-tienda - Modelo x Tienda pivot table (main dashboard view)"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/pivot-modelo-tienda", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "tiendas" in data, "Response should have 'tiendas' (column headers)"
        assert "rows" in data, "Response should have 'rows'"
        assert "totals_by_tienda" in data, "Response should have 'totals_by_tienda'"
        assert "grand_total" in data, "Response should have 'grand_total'"
        assert "total_modelos" in data, "Response should have 'total_modelos'"
        assert "page" in data, "Response should have 'page'"
        
        # Verify tiendas list - should have 11 stores
        tiendas = data["tiendas"]
        expected_tiendas = ["AP", "BOOSH", "Fallados Qepo", "GM207", "GM209", "GM218", "GR238", "GR55", "REMATE", "TALLER", "ZAP"]
        for expected in expected_tiendas:
            assert expected in tiendas, f"Tienda '{expected}' should be in columns"
        print(f"✓ All 11 tiendas present as columns: {tiendas}")
        
        # Verify rows structure
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "modelo" in row, "Row should have 'modelo'"
            assert "marca" in row, "Row should have 'marca'"
            assert "values" in row, "Row should have 'values' (tienda -> qty mapping)"
            assert "total" in row, "Row should have 'total'"
        
        print(f"✓ Pivot Modelo x Tienda (MAIN):")
        print(f"  - Tiendas (columns): {len(tiendas)}")
        print(f"  - Rows (first page): {len(data['rows'])}")
        print(f"  - Total modelos: {data['total_modelos']}")
        print(f"  - Grand total stock: {data['grand_total']}")
        
        # First model should be highest stock
        if len(data["rows"]) > 0:
            first_model = data["rows"][0]
            print(f"  - First model: {first_model['modelo']} ({first_model['marca']}) - Total: {first_model['total']}")

    def test_pivot_modelo_tienda_with_single_tienda_filter(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo-tienda with tienda=TALLER filter"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo-tienda",
            params={"tienda": "TALLER"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should only have TALLER in tiendas list
        assert "TALLER" in data["tiendas"], "TALLER should be in columns"
        assert len(data["tiendas"]) == 1, "Only 1 tienda should be shown when filtering by single tienda"
        
        print(f"✓ Pivot Modelo x Tienda filtered by tienda 'TALLER':")
        print(f"  - Total modelos: {data['total_modelos']}")
        print(f"  - Grand total stock: {data['grand_total']}")

    def test_pivot_modelo_tienda_pagination(self, auth_headers):
        """GET /api/stock-dashboard/pivot-modelo-tienda pagination"""
        # Get page 1
        response1 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo-tienda",
            params={"page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get page 2
        response2 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-modelo-tienda",
            params={"page": 2, "limit": 10},
            headers=auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Pages should have different data
        if len(data1["rows"]) >= 10 and len(data2["rows"]) > 0:
            assert data1["rows"][0]["modelo"] != data2["rows"][0]["modelo"], "Page 2 should have different models"
            print(f"✓ Pagination verified - Page 1 first: {data1['rows'][0]['modelo']}, Page 2 first: {data2['rows'][0]['modelo']}")
        else:
            print(f"✓ Pagination works (page1: {len(data1['rows'])} rows, page2: {len(data2['rows'])} rows)")




class TestStockDashboardPivotTienda(TestAuthSetup):
    """Test GET /api/stock-dashboard/pivot-tienda endpoint"""

    def test_pivot_tienda_with_tienda_param(self, auth_headers):
        """GET /api/stock-dashboard/pivot-tienda?pivot_tienda=X - Color x Talla matrix for specific tienda"""
        # Get a tienda first
        filtros_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        if filtros_resp.status_code != 200:
            pytest.skip("Cannot get filter options")
        tiendas = filtros_resp.json().get("tiendas", [])
        if len(tiendas) == 0:
            pytest.skip("No tiendas available")
        
        test_tienda = tiendas[0]
        
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-tienda",
            params={"pivot_tienda": test_tienda},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response structure (same as catalogo matrix)
        assert "tallas" in data, "Response should have 'tallas'"
        assert "colores" in data, "Response should have 'colores'"
        assert "matrix" in data, "Response should have 'matrix'"
        assert "totals" in data, "Response should have 'totals'"
        
        # Verify totals structure
        totals = data["totals"]
        assert "byColor" in totals, "Totals should have 'byColor'"
        assert "bySize" in totals, "Totals should have 'bySize'"
        assert "grandTotal" in totals, "Totals should have 'grandTotal'"
        
        print(f"✓ Pivot Tienda '{test_tienda}':")
        print(f"  - Colores: {len(data['colores'])}")
        print(f"  - Tallas: {data['tallas']}")
        print(f"  - Grand total: {totals['grandTotal']}")

    def test_pivot_tienda_ap_store(self, auth_headers):
        """GET /api/stock-dashboard/pivot-tienda?pivot_tienda=AP - specific AP store test"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/pivot-tienda",
            params={"pivot_tienda": "AP"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        totals = data.get("totals", {})
        
        print(f"✓ Pivot Tienda 'AP':")
        print(f"  - Colores: {len(data.get('colores', []))}")
        print(f"  - Tallas: {data.get('tallas', [])}")
        print(f"  - Grand total: {totals.get('grandTotal', 0)}")


class TestStockDashboardDetalle(TestAuthSetup):
    """Test GET /api/stock-dashboard/detalle endpoint"""

    def test_detalle_no_filter(self, auth_headers):
        """GET /api/stock-dashboard/detalle - paginated detail rows"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify response structure
        assert "items" in data, "Response should have 'items'"
        assert "total" in data, "Response should have 'total'"
        assert "page" in data, "Response should have 'page'"
        
        # Verify item structure
        if len(data["items"]) > 0:
            item = data["items"][0]
            expected_fields = ["tienda", "modelo", "marca", "talla", "color", "barcode", "available_qty", "es_lq", "es_negro"]
            for field in expected_fields:
                assert field in item, f"Item should have '{field}'"
        
        print(f"✓ Detail table:")
        print(f"  - Total rows: {data['total']}")
        print(f"  - Items on page: {len(data['items'])}")
        if len(data["items"]) > 0:
            print(f"  - First item: {data['items'][0]['modelo']} ({data['items'][0]['tienda']})")

    def test_detalle_with_filter(self, auth_headers):
        """GET /api/stock-dashboard/detalle with tienda filter"""
        # Get a tienda first
        filtros_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/filtros", headers=auth_headers)
        if filtros_resp.status_code != 200:
            pytest.skip("Cannot get filter options")
        tiendas = filtros_resp.json().get("tiendas", [])
        if len(tiendas) == 0:
            pytest.skip("No tiendas available")
        
        test_tienda = tiendas[0]
        
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detalle",
            params={"tienda": test_tienda},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All items should be from the filtered tienda
        for item in data["items"]:
            assert item["tienda"] == test_tienda, f"Item tienda should be {test_tienda}"
        
        print(f"✓ Detail filtered by tienda '{test_tienda}':")
        print(f"  - Total rows: {data['total']}")

    def test_detalle_pagination(self, auth_headers):
        """GET /api/stock-dashboard/detalle pagination"""
        # Get page 1
        response1 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detalle",
            params={"page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get page 2
        response2 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detalle",
            params={"page": 2, "limit": 10},
            headers=auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        print(f"✓ Detail pagination: Page 1 has {len(data1['items'])} items, Page 2 has {len(data2['items'])} items")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
