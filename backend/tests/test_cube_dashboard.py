"""
Test cases for Stock Dashboard CUBE-based approach (Power BI style)
Tests: /cube, /detail, /filter-options-v2 endpoints
Key features: modelo_base normalization, local cross-filtering, TOP 300 modelos
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCubeEndpoint:
    """Tests for GET /api/stock-dashboard/cube - Returns pre-aggregated cube data"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for all tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cube_returns_aggregated_data(self):
        """Cube endpoint returns aggregated rows with compact keys"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "cube" in data
        assert "kpis" in data
        
        cube = data["cube"]
        assert len(cube) > 0, "Cube should have data"
        
        # Check compact keys structure
        sample = cube[0]
        assert "t" in sample, "Should have 't' (tienda)"
        assert "m" in sample, "Should have 'm' (modelo)"
        assert "lq" in sample, "Should have 'lq' (flag_lq)"
        assert "c" in sample, "Should have 'c' (color)"
        assert "z" in sample, "Should have 'z' (talla)"
        assert "q" in sample, "Should have 'q' (qty)"
    
    def test_cube_kpis_structure(self):
        """Cube KPIs contain expected fields"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        assert response.status_code == 200
        
        kpis = response.json()["kpis"]
        assert "total_stock" in kpis
        assert "modelos" in kpis
        assert "variantes" in kpis
        assert "tiendas" in kpis
        
        # Validate reasonable values
        assert kpis["total_stock"] > 0
        assert kpis["modelos"] > 0
        assert kpis["tiendas"] > 0
    
    def test_cube_modelo_base_normalization(self):
        """Cube uses modelo_base with LQ suffixes stripped"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        assert response.status_code == 200
        
        cube = response.json()["cube"]
        modelos = set(r["m"] for r in cube)
        
        # No modelo should have raw LQ suffix pattern (like VANDROS-LQ or MODEL LQ2)
        lq_pattern_modelos = [m for m in modelos if "-LQ" in m.upper() or " LQ" in m.upper()]
        assert len(lq_pattern_modelos) == 0, f"Modelos with LQ suffix found: {lq_pattern_modelos[:5]}"
    
    def test_cube_top_300_modelos_without_filter(self):
        """Without modelo filter, cube returns TOP 300 modelos by stock"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        assert response.status_code == 200
        
        cube = response.json()["cube"]
        modelos = set(r["m"] for r in cube)
        
        # Should be limited to ~300 distinct modelos
        assert len(modelos) <= 300, f"Should have max 300 modelos, got {len(modelos)}"
        assert len(modelos) >= 100, f"Should have reasonable modelos count, got {len(modelos)}"
    
    def test_cube_accepts_bar_filters(self):
        """Cube endpoint accepts bar filters (marca, tipo, etc.)"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/cube?marca=BOOSH",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        kpis = data["kpis"]
        
        # BOOSH filter should reduce stock significantly
        assert kpis["total_stock"] < 10000, "BOOSH filter should reduce total"
        assert kpis["modelos"] < 20, "BOOSH should have fewer modelos"
    
    def test_cube_lq_filter_yes_no(self):
        """Cube accepts lq=yes/no params (not es_lq=si/no)"""
        # Test lq=yes
        response_yes = requests.get(
            f"{BASE_URL}/api/stock-dashboard/cube?lq=yes",
            headers=self.headers
        )
        assert response_yes.status_code == 200
        kpis_yes = response_yes.json()["kpis"]
        
        # Test lq=no
        response_no = requests.get(
            f"{BASE_URL}/api/stock-dashboard/cube?lq=no",
            headers=self.headers
        )
        assert response_no.status_code == 200
        kpis_no = response_no.json()["kpis"]
        
        # Both should return data, and be mutually exclusive
        assert kpis_yes["total_stock"] > 0, "lq=yes should return data"
        assert kpis_no["total_stock"] > 0, "lq=no should return data"
    
    def test_cube_negro_filter_expanded(self):
        """Cube negro filter includes carbon/grafito patterns"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/cube?negro=yes",
            headers=self.headers
        )
        assert response.status_code == 200
        
        cube = response.json()["cube"]
        colors = set(r["c"] for r in cube)
        
        # Should include colors matching negro pattern (negro, plomo, carbon, grafito)
        negro_keywords = ["negro", "plomo", "carbon", "carbón", "grafito"]
        has_negro_colors = any(
            any(kw in c.lower() for kw in negro_keywords) for c in colors
        )
        assert has_negro_colors, f"Negro filter should include negro-like colors. Got: {list(colors)[:10]}"


class TestDetailEndpoint:
    """Tests for GET /api/stock-dashboard/detail - Paginated detail with selections"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_detail_paginated_response(self):
        """Detail endpoint returns paginated items with total count"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?page=1&limit=50",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) <= 50
        assert data["total"] > 0
    
    def test_detail_item_structure(self):
        """Detail items have expected fields including modelo and modelo_raw"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?page=1&limit=5",
            headers=self.headers
        )
        assert response.status_code == 200
        
        items = response.json()["items"]
        assert len(items) > 0
        
        item = items[0]
        assert "tienda" in item
        assert "modelo" in item, "Should have normalized modelo (modelo_base)"
        assert "modelo_raw" in item, "Should have original modelo_raw"
        assert "lq" in item
        assert "talla" in item
        assert "color" in item
        assert "barcode" in item
        assert "qty" in item
        assert "es_negro" in item
        assert "marca" in item
    
    def test_detail_selection_params(self):
        """Detail accepts sel_modelo, sel_talla, sel_color, sel_tienda params"""
        # First get a valid modelo from cube
        cube_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        cube = cube_resp.json()["cube"]
        test_modelo = cube[0]["m"]
        
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?sel_modelo={test_modelo}&limit=10",
            headers=self.headers
        )
        assert response.status_code == 200
        
        items = response.json()["items"]
        # All items should have the selected modelo
        for item in items:
            assert item["modelo"] == test_modelo, f"Expected {test_modelo}, got {item['modelo']}"
    
    def test_detail_combined_bar_and_selection(self):
        """Detail works with both bar filters and selection params"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?marca=BOOSH&sel_talla=M&limit=10",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        # Should return filtered results
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)


class TestFilterOptionsV2:
    """Tests for GET /api/stock-dashboard/filter-options-v2 - Cascade with modelo_base + flag_lq"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_filter_options_v2_structure(self):
        """filter-options-v2 returns all filter option arrays"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "tienda_canonicas" in data
        assert "marcas" in data
        assert "tipos" in data
        assert "entalles" in data
        assert "telas" in data
        assert "tallas" in data
        assert "colores" in data
        
        # All should be arrays
        assert isinstance(data["tienda_canonicas"], list)
        assert isinstance(data["marcas"], list)
    
    def test_filter_options_v2_lq_param(self):
        """filter-options-v2 uses lq=yes/no params (not es_lq=si/no)"""
        response_yes = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2?lq=yes",
            headers=self.headers
        )
        assert response_yes.status_code == 200
        data_yes = response_yes.json()
        
        response_no = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2?lq=no",
            headers=self.headers
        )
        assert response_no.status_code == 200
        data_no = response_no.json()
        
        # Both should return options but potentially different counts
        assert len(data_yes.get("marcas", [])) > 0 or len(data_no.get("marcas", [])) > 0
    
    def test_filter_options_v2_negro_param(self):
        """filter-options-v2 uses negro=yes/no params"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2?negro=yes",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return negro-filtered options
        assert "colores" in data
    
    def test_filter_options_v2_cascade_works(self):
        """Cascade filtering: selecting marca reduces other options"""
        # Get baseline
        baseline = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2",
            headers=self.headers
        ).json()
        
        # Get with marca filter
        filtered = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2?marca=BOOSH",
            headers=self.headers
        ).json()
        
        # Filtered should have fewer options in other fields
        assert len(filtered.get("telas", [])) <= len(baseline.get("telas", []))
        assert len(filtered.get("entalles", [])) <= len(baseline.get("entalles", []))
    
    def test_filter_options_v2_talla_sorting(self):
        """Tallas should be sorted correctly (numeric then S/M/L order)"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/filter-options-v2",
            headers=self.headers
        )
        assert response.status_code == 200
        
        tallas = response.json().get("tallas", [])
        
        # Check sorting pattern (numeric first, then letter sizes)
        # Numeric tallas should come before letter sizes
        found_letter = False
        for t in tallas:
            if t in ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']:
                found_letter = True
            elif found_letter and t.isdigit():
                # If we've seen letter sizes, shouldn't see numeric after
                assert False, f"Numeric talla '{t}' found after letter sizes"


class TestIntegration:
    """Integration tests for cube-based dashboard flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_cube_count_matches_expected(self):
        """Unfiltered cube has ~11K rows and ~300 modelos"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        assert response.status_code == 200
        
        cube = response.json()["cube"]
        kpis = response.json()["kpis"]
        
        # ~11K rows expected
        assert len(cube) > 5000, f"Expected ~11K cube rows, got {len(cube)}"
        assert len(cube) < 20000, f"Cube rows too high: {len(cube)}"
        
        # KPIs: 44,895 stock, 703 total modelos
        assert kpis["total_stock"] > 40000, f"Expected ~45K stock, got {kpis['total_stock']}"
        assert kpis["modelos"] > 500, f"Expected 700+ modelos in KPI, got {kpis['modelos']}"
    
    def test_detail_total_reasonable(self):
        """Detail total should be > cube rows (more granular)"""
        cube_resp = requests.get(f"{BASE_URL}/api/stock-dashboard/cube", headers=self.headers)
        detail_resp = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?limit=1",
            headers=self.headers
        )
        
        cube_rows = len(cube_resp.json()["cube"])
        detail_total = detail_resp.json()["total"]
        
        # Detail is less aggregated, should have more rows
        assert detail_total >= cube_rows, f"Detail {detail_total} should be >= cube {cube_rows}"
    
    def test_workflow_bar_filter_then_selection(self):
        """Simulates dashboard workflow: bar filter → cube → selection → detail"""
        # Step 1: Get cube with bar filter
        cube_resp = requests.get(
            f"{BASE_URL}/api/stock-dashboard/cube?marca=BOOSH",
            headers=self.headers
        )
        assert cube_resp.status_code == 200
        cube = cube_resp.json()["cube"]
        
        # Step 2: Pick first modelo from cube (simulates click)
        test_modelo = cube[0]["m"]
        
        # Step 3: Get detail with both bar filter and selection
        detail_resp = requests.get(
            f"{BASE_URL}/api/stock-dashboard/detail?marca=BOOSH&sel_modelo={test_modelo}",
            headers=self.headers
        )
        assert detail_resp.status_code == 200
        
        items = detail_resp.json()["items"]
        # All items should match the selection
        for item in items:
            assert item["modelo"] == test_modelo


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
