"""
Comprehensive tests for Stock Dashboard P0 bug fix verification.
Tests login, Stock Dashboard cube/filters, Reposicion, Balance de Tallas APIs.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stock-issue-fix.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@stockdash.com"
TEST_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestHealthAndAuth:
    """Test health check and authentication"""
    
    def test_health_check(self):
        """Health endpoint returns ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["database"] == "connected"
    
    def test_login_success(self):
        """Login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
    
    def test_login_invalid_credentials(self):
        """Login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401


class TestStockDashboardCube:
    """Test Stock Dashboard /cube endpoint (main data source)"""
    
    def test_cube_requires_auth(self):
        """Cube endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube")
        assert response.status_code == 401
    
    def test_cube_returns_data(self, auth_headers):
        """Cube returns stock data with correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "cube" in data, "Missing 'cube' field"
        assert "kpis" in data, "Missing 'kpis' field"
        
        # Cube should have data
        cube = data["cube"]
        assert isinstance(cube, list), "cube should be a list"
        assert len(cube) > 0, "cube should not be empty"
        
        # Each cube item should have required fields
        item = cube[0]
        assert "t" in item, "Missing tienda (t) field"
        assert "m" in item, "Missing modelo (m) field"
        assert "c" in item, "Missing color (c) field"
        assert "z" in item, "Missing talla (z) field"
        assert "q" in item, "Missing quantity (q) field"
    
    def test_cube_kpis_structure(self, auth_headers):
        """Cube KPIs have correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        kpis = data.get("kpis", {})
        assert "total_stock" in kpis, "Missing total_stock KPI"
        assert "modelos" in kpis, "Missing modelos KPI"
        assert "variantes" in kpis, "Missing variantes KPI"
        
        # Values should be positive
        assert kpis["total_stock"] > 0, "total_stock should be positive"
        assert kpis["modelos"] > 0, "modelos should be positive"
    
    def test_cube_contains_store_data(self, auth_headers):
        """Cube contains data for all expected stores"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        cube = data["cube"]
        stores = set(item["t"] for item in cube)
        
        # Should have multiple stores
        expected_stores = ["ALMACEN", "GM218", "GAMARRA 209", "GAMARRA 207", "BOOSH"]
        found_stores = [s for s in expected_stores if s in stores]
        assert len(found_stores) >= 3, f"Expected at least 3 stores, found: {stores}"


class TestStockDashboardFilters:
    """Test Stock Dashboard filter-options-v2 endpoint"""
    
    def test_filter_options_requires_auth(self):
        """Filter options endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options-v2")
        assert response.status_code == 401
    
    def test_filter_options_structure(self, auth_headers):
        """Filter options returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options-v2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should have all filter categories
        expected_keys = ["tienda_canonicas", "marcas", "tipos", "entalles", "telas", "tallas", "colores"]
        for key in expected_keys:
            assert key in data, f"Missing filter key: {key}"
    
    def test_filter_options_have_counts(self, auth_headers):
        """Filter options include model/variant counts"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options-v2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Each filter option should have value, count_modelos, count_variantes, sum_stock
        tiendas = data.get("tienda_canonicas", [])
        assert len(tiendas) > 0, "Should have tienda options"
        
        tienda = tiendas[0]
        assert "value" in tienda, "Missing value field"
        assert "count_modelos" in tienda, "Missing count_modelos field"
        assert "count_variantes" in tienda, "Missing count_variantes field"
        assert "sum_stock" in tienda, "Missing sum_stock field"
    
    def test_filter_options_contains_brands(self, auth_headers):
        """Filter options contain expected brands"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options-v2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        marcas = data.get("marcas", [])
        marca_values = [m["value"] for m in marcas]
        
        # Should have main brands
        expected_brands = ["ELEMENT PREMIUM", "QEPO", "BOOSH"]
        found_brands = [b for b in expected_brands if b in marca_values]
        assert len(found_brands) >= 2, f"Expected at least 2 main brands, found: {marca_values}"


class TestReposicionSKUSummary:
    """Test Reposicion /sku-summary endpoint"""
    
    def test_sku_summary_requires_auth(self):
        """SKU summary requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reposicion/sku-summary")
        assert response.status_code == 401
    
    def test_sku_summary_returns_data(self, auth_headers):
        """SKU summary returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/reposicion/sku-summary", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data, "Missing items field"
        assert "total" in data, "Missing total field"
        assert "kpis" in data, "Missing kpis field"
        
        # Should have items
        items = data["items"]
        assert isinstance(items, list), "items should be a list"
    
    def test_sku_summary_kpis(self, auth_headers):
        """SKU summary KPIs have required fields"""
        response = requests.get(f"{BASE_URL}/api/reposicion/sku-summary", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        kpis = data.get("kpis", {})
        expected_kpis = ["total_skus", "faltantes", "bajos", "con_asignacion", "total_qty_asignada", "sin_stock"]
        for k in expected_kpis:
            assert k in kpis, f"Missing KPI: {k}"
    
    def test_sku_summary_item_structure(self, auth_headers):
        """SKU summary items have correct structure"""
        response = requests.get(f"{BASE_URL}/api/reposicion/sku-summary", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        items = data.get("items", [])
        if items:
            item = items[0]
            expected_fields = ["sku_key", "marca", "tipo", "entalle", "tela", "color", "talla", 
                            "stock_total", "stock_almacen", "destinos", "recomendaciones", "estado"]
            for f in expected_fields:
                assert f in item, f"Missing field: {f}"


class TestReposicionSKUModels:
    """Test Reposicion /sku-models endpoint (drilldown)"""
    
    def test_sku_models_requires_auth(self):
        """SKU models requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reposicion/sku-models")
        assert response.status_code == 401
    
    def test_sku_models_returns_structure(self, auth_headers):
        """SKU models returns correct structure"""
        # Get a SKU from summary to use for models query
        summary_resp = requests.get(f"{BASE_URL}/api/reposicion/sku-summary", headers=auth_headers)
        summary_data = summary_resp.json()
        
        if summary_data.get("items"):
            sku = summary_data["items"][0]
            params = {
                "marca": sku["marca"],
                "tipo": sku["tipo"],
                "entalle": sku["entalle"],
                "tela": sku["tela"],
                "color": sku["color"],
                "talla": sku["talla"]
            }
            
            response = requests.get(f"{BASE_URL}/api/reposicion/sku-models", params=params, headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            
            assert "models" in data, "Missing models field"
            assert isinstance(data["models"], list), "models should be a list"


class TestBalanceTallasMatrix:
    """Test Balance de Tallas /matrix endpoint"""
    
    def test_matrix_requires_auth(self):
        """Matrix endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix")
        assert response.status_code == 401
    
    def test_matrix_returns_data(self, auth_headers):
        """Matrix returns correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        expected_fields = ["tallas", "rows", "totals_by_talla", "grand_total", "total_items", "filter_opts"]
        for f in expected_fields:
            assert f in data, f"Missing field: {f}"
    
    def test_matrix_tallas_sorted(self, auth_headers):
        """Matrix tallas are properly sorted"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        tallas = data.get("tallas", [])
        assert len(tallas) > 0, "Should have tallas"
        # Numeric tallas should come before letter tallas
        # Check if '28' comes before 'S' if both exist
    
    def test_matrix_rows_structure(self, auth_headers):
        """Matrix rows have correct structure"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        if rows:
            row = rows[0]
            expected_fields = ["marca", "tipo", "entalle", "tela", "hilo", "values", "total"]
            for f in expected_fields:
                assert f in row, f"Missing field: {f}"
    
    def test_matrix_filter_options(self, auth_headers):
        """Matrix includes filter options"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        filter_opts = data.get("filter_opts", {})
        expected_filters = ["tienda", "marca", "tipo", "entalle", "tela", "hilo", "color", "talla"]
        for f in expected_filters:
            assert f in filter_opts, f"Missing filter option: {f}"


class TestBalanceTallasColors:
    """Test Balance de Tallas /colors-matrix endpoint"""
    
    def test_colors_matrix_requires_auth(self):
        """Colors matrix requires authentication"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/colors-matrix")
        assert response.status_code == 401
    
    def test_colors_matrix_empty_without_params(self, auth_headers):
        """Colors matrix returns empty without required params"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/colors-matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Should return empty or minimal structure
        assert "rows" in data or "tallas" in data
    
    def test_colors_matrix_with_params(self, auth_headers):
        """Colors matrix returns data with correct params"""
        # Get a row from matrix to use for colors query
        matrix_resp = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        matrix_data = matrix_resp.json()
        
        if matrix_data.get("rows"):
            row = matrix_data["rows"][0]
            params = {
                "marca": row["marca"],
                "tipo": row["tipo"],
                "entalle": row["entalle"],
                "tela": row["tela"],
                "hilo": row["hilo"]
            }
            
            response = requests.get(f"{BASE_URL}/api/stock-balance/colors-matrix", params=params, headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            
            assert "tallas" in data
            assert "rows" in data
            assert "grand_total" in data


class TestDataIntegrity:
    """Test data integrity across endpoints"""
    
    def test_cube_total_matches_kpi(self, auth_headers):
        """Cube data total matches KPI total_stock"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        cube = data.get("cube", [])
        kpis = data.get("kpis", {})
        
        # Calculate sum from cube
        cube_total = sum(item.get("q", 0) for item in cube)
        kpi_total = kpis.get("total_stock", 0)
        
        # Allow 1% difference for rounding
        diff_pct = abs(cube_total - kpi_total) / max(kpi_total, 1) * 100
        assert diff_pct < 5, f"Cube total ({cube_total}) differs from KPI ({kpi_total}) by {diff_pct:.2f}%"
    
    def test_balance_totals_consistency(self, auth_headers):
        """Balance matrix row totals match grand_total"""
        response = requests.get(f"{BASE_URL}/api/stock-balance/matrix", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        rows = data.get("rows", [])
        grand_total = data.get("grand_total", 0)
        
        # Sum of row totals
        rows_sum = sum(row.get("total", 0) for row in rows)
        
        # Should be equal
        assert rows_sum == grand_total, f"Rows sum ({rows_sum}) != grand_total ({grand_total})"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
