"""
Stock Dashboard Power BI Layout Tests
Tests the redesigned stock dashboard endpoints with canonical tienda mapping
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test_cat@crm.com",
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed")

@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}

class TestFiltersEndpoint:
    """Tests for GET /api/stock-dashboard/filters"""
    
    def test_filters_returns_tienda_canonicas(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filters", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify tienda_canonicas with correct names
        assert "tienda_canonicas" in data
        expected_tiendas = ["ALMACEN", "BOOSH", "GAMARRA 207", "GAMARRA 209", "GM218", "GRAU 238 / GRAU 55"]
        for tienda in expected_tiendas:
            assert tienda in data["tienda_canonicas"], f"Missing tienda: {tienda}"
        
        # PROBADOR should NOT be in the list (excluded per design)
        assert "PROBADOR" not in data["tienda_canonicas"]
    
    def test_filters_returns_all_filter_types(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filters", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # All filter categories should be present
        expected_keys = ["tienda_canonicas", "marcas", "tipos", "entalles", "telas", "tallas", "colores"]
        for key in expected_keys:
            assert key in data, f"Missing filter key: {key}"
            assert isinstance(data[key], list), f"{key} should be a list"

class TestPanelsEndpoint:
    """Tests for GET /api/stock-dashboard/panels - Power BI style panels"""
    
    def test_panels_returns_all_seven_stores(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "stores" in data
        # Should have 6 real stores + TOTAL = 7 panels
        expected_stores = ["ALMACEN", "BOOSH", "GAMARRA 207", "GAMARRA 209", "GM218", "GRAU 238 / GRAU 55", "TOTAL"]
        for store in expected_stores:
            assert store in data["stores"], f"Missing store panel: {store}"
    
    def test_panels_total_equals_sum_of_real_stores(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        stores = data["stores"]
        real_stores = ["ALMACEN", "BOOSH", "GAMARRA 207", "GAMARRA 209", "GM218", "GRAU 238 / GRAU 55"]
        
        # Calculate sum of real stores
        real_sum = sum(stores[s]["totals"]["grandTotal"] for s in real_stores)
        total_grand = stores["TOTAL"]["totals"]["grandTotal"]
        
        assert total_grand == real_sum, f"TOTAL ({total_grand}) should equal sum of stores ({real_sum})"
    
    def test_panels_kpis_returned(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "kpis" in data
        kpis = data["kpis"]
        assert "total_stock" in kpis
        assert "modelos" in kpis
        assert "variantes" in kpis
        assert kpis["total_stock"] > 0
    
    def test_panels_tallas_returned(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "tallas" in data
        assert isinstance(data["tallas"], list)
        assert len(data["tallas"]) > 0
    
    def test_panels_store_structure_has_color_talla_matrix(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check ALMACEN panel structure (should have most data)
        almacen = data["stores"]["ALMACEN"]
        assert "colores" in almacen
        assert "matrix" in almacen
        assert "totals" in almacen
        assert "byColor" in almacen["totals"]
        assert "bySize" in almacen["totals"]
        assert "grandTotal" in almacen["totals"]
    
    def test_panels_canonical_mapping_almacen_from_taller(self, auth_headers):
        """ALMACEN should have data (maps from TALLER in the DB)"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        almacen = data["stores"]["ALMACEN"]
        # Based on context: ALMACEN=31223
        assert almacen["totals"]["grandTotal"] > 30000, "ALMACEN should have ~31223 stock"
    
    def test_panels_canonical_mapping_gamarra_209_from_gm209(self, auth_headers):
        """GAMARRA 209 should have data (maps from GM209 in the DB)"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        gamarra209 = data["stores"]["GAMARRA 209"]
        # Based on context: GAMARRA 209=3182
        assert gamarra209["totals"]["grandTotal"] > 3000, "GAMARRA 209 should have ~3182 stock"
    
    def test_panels_with_es_negro_filter(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels?es_negro=si", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Filtered result should have less stock
        assert data["kpis"]["total_stock"] < 44229, "es_negro=si filter should reduce total stock"

class TestModeloTallaEndpoint:
    """Tests for GET /api/stock-dashboard/modelo-talla"""
    
    def test_modelo_talla_returns_pivot_data(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "tallas" in data
        assert "rows" in data
        assert "totals_by_talla" in data
        assert "grand_total" in data
        assert "total_modelos" in data
    
    def test_modelo_talla_rows_structure(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["rows"]) > 0
        first_row = data["rows"][0]
        assert "modelo" in first_row
        assert "cells" in first_row
        assert "total" in first_row
    
    def test_modelo_talla_with_marca_filter(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla?marca=BOOSH", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Filter should reduce results
        assert data["total_modelos"] < 879, "marca=BOOSH filter should reduce modelos"
        assert data["total_modelos"] > 0, "Should still have some BOOSH modelos"
    
    def test_modelo_talla_probador_excluded(self, auth_headers):
        """PROBADOR model should be excluded from results"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla?limit=1000", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        modelo_names = [r["modelo"].upper() for r in data["rows"]]
        for name in modelo_names:
            assert "PROBADOR" not in name, f"PROBADOR should be excluded but found: {name}"

class TestExpectedDataValues:
    """Tests to verify expected data matches context notes"""
    
    def test_total_stock_is_44229(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["kpis"]["total_stock"] == 44229, "Total stock should be 44229"
    
    def test_modelos_count_is_879(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["kpis"]["modelos"] == 879, "Modelos count should be 879"
    
    def test_six_canonical_tiendas(self, auth_headers):
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["kpis"]["tiendas"] == 6, "Should have 6 canonical tiendas"
    
    def test_store_totals_match_expected(self, auth_headers):
        """Verify individual store totals match expected values"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        stores = response.json()["stores"]
        
        expected = {
            "ALMACEN": 31223,
            "GAMARRA 209": 3182,
            "GRAU 238 / GRAU 55": 2856,
            "GM218": 2644,
            "GAMARRA 207": 2422,
            "BOOSH": 1902
        }
        
        for store, expected_total in expected.items():
            actual = stores[store]["totals"]["grandTotal"]
            assert actual == expected_total, f"{store}: expected {expected_total}, got {actual}"
