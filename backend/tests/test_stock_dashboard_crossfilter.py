"""
Test Stock Dashboard Cross-Filtering Feature
Tests: /api/stock-dashboard/filters, /panels, /modelo-talla, /detalle endpoints
Focus: Cross-filter functionality with modelo, talla, color, es_lq, es_negro filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestStockDashboardAuth:
    """Authentication setup for stock dashboard tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        assert token, "No token returned"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestFiltersEndpoint(TestStockDashboardAuth):
    """Test GET /api/stock-dashboard/filters"""
    
    def test_filters_returns_all_filter_types(self, auth_headers):
        """Filters endpoint returns all filter arrays"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filters", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check all filter types present
        expected_keys = ['tienda_canonicas', 'marcas', 'tipos', 'entalles', 'telas', 'tallas', 'colores']
        for key in expected_keys:
            assert key in data, f"Missing filter key: {key}"
    
    def test_filters_returns_canonical_tiendas(self, auth_headers):
        """Tienda_canonicas contains correct store names"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filters", headers=auth_headers)
        data = response.json()
        
        expected_tiendas = ['ALMACEN', 'BOOSH', 'GAMARRA 207', 'GAMARRA 209', 'GM218', 'GRAU 238 / GRAU 55']
        for tienda in expected_tiendas:
            assert tienda in data['tienda_canonicas'], f"Missing tienda: {tienda}"
    
    def test_filters_tallas_are_sorted(self, auth_headers):
        """Tallas should be sorted by size order"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filters", headers=auth_headers)
        data = response.json()
        
        # Check S, M, L order
        tallas = data.get('tallas', [])
        assert len(tallas) > 0, "No tallas returned"
        if 'S' in tallas and 'M' in tallas and 'L' in tallas:
            assert tallas.index('S') < tallas.index('M') < tallas.index('L'), "Tallas not sorted correctly"


class TestPanelsEndpoint(TestStockDashboardAuth):
    """Test GET /api/stock-dashboard/panels - Cross-filtering"""
    
    def test_panels_unfiltered(self, auth_headers):
        """Unfiltered panels returns all stores and KPIs"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check KPIs
        assert 'kpis' in data
        assert data['kpis']['total_stock'] == 44229.0
        assert data['kpis']['modelos'] == 879
        
        # Check all stores present (6 real + TOTAL)
        stores = list(data.get('stores', {}).keys())
        expected_stores = ['GRAU 238 / GRAU 55', 'GAMARRA 209', 'GM218', 'BOOSH', 'GAMARRA 207', 'TOTAL', 'ALMACEN']
        for store in expected_stores:
            assert store in stores, f"Missing store: {store}"
        
        # Check TOTAL equals sum of real stores
        total_grand = data['stores']['TOTAL']['totals']['grandTotal']
        assert total_grand == 44229, f"TOTAL grandTotal mismatch: {total_grand}"
    
    def test_panels_crossfilter_by_modelo(self, auth_headers):
        """Cross-filter by modelo=CLASIC reduces stock to ~837"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", 
                               headers=auth_headers, 
                               params={"modelo": "CLASIC"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify filtered KPIs
        assert data['kpis']['total_stock'] == 837.0, f"Expected 837, got {data['kpis']['total_stock']}"
        assert data['kpis']['modelos'] == 2, f"Expected 2 modelos, got {data['kpis']['modelos']}"
    
    def test_panels_crossfilter_by_talla(self, auth_headers):
        """Cross-filter by talla=M filters correctly"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels",
                               headers=auth_headers,
                               params={"talla": "M"})
        assert response.status_code == 200
        data = response.json()
        
        # Check stock reduced
        assert data['kpis']['total_stock'] < 44229.0
        assert data['kpis']['total_stock'] == 3992.0, f"Expected 3992, got {data['kpis']['total_stock']}"
    
    def test_panels_crossfilter_by_es_negro(self, auth_headers):
        """Cross-filter by es_negro=si reduces stock to ~16832"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels",
                               headers=auth_headers,
                               params={"es_negro": "si"})
        assert response.status_code == 200
        data = response.json()
        
        assert data['kpis']['total_stock'] == 16832.0, f"Expected 16832, got {data['kpis']['total_stock']}"
    
    def test_panels_crossfilter_by_es_lq(self, auth_headers):
        """Cross-filter by es_lq=si reduces stock to ~1464"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels",
                               headers=auth_headers,
                               params={"es_lq": "si"})
        assert response.status_code == 200
        data = response.json()
        
        assert data['kpis']['total_stock'] == 1464.0, f"Expected 1464, got {data['kpis']['total_stock']}"
    
    def test_panels_multiple_filters(self, auth_headers):
        """Multiple filters combine correctly"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels",
                               headers=auth_headers,
                               params={"modelo": "CLASIC", "talla": "M"})
        assert response.status_code == 200
        data = response.json()
        
        # Should be less than either filter alone
        assert data['kpis']['total_stock'] < 837.0
        assert data['kpis']['total_stock'] < 3992.0
    
    def test_panels_store_structure(self, auth_headers):
        """Each store has Color x Talla matrix structure"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/panels", headers=auth_headers)
        data = response.json()
        
        for store_name, store_data in data['stores'].items():
            assert 'colores' in store_data, f"{store_name} missing colores"
            assert 'matrix' in store_data, f"{store_name} missing matrix"
            assert 'totals' in store_data, f"{store_name} missing totals"
            assert 'byColor' in store_data['totals'], f"{store_name} missing byColor totals"
            assert 'bySize' in store_data['totals'], f"{store_name} missing bySize totals"
            assert 'grandTotal' in store_data['totals'], f"{store_name} missing grandTotal"


class TestModeloTallaEndpoint(TestStockDashboardAuth):
    """Test GET /api/stock-dashboard/modelo-talla"""
    
    def test_modelo_talla_unfiltered(self, auth_headers):
        """Unfiltered returns top modelos with tallas"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla",
                               headers=auth_headers,
                               params={"limit": 50})
        assert response.status_code == 200
        data = response.json()
        
        assert 'tallas' in data
        assert 'rows' in data
        assert 'totals_by_talla' in data
        assert 'grand_total' in data
        assert 'total_modelos' in data
        
        assert data['total_modelos'] == 879
    
    def test_modelo_talla_row_structure(self, auth_headers):
        """Each row has modelo, cells, total"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla",
                               headers=auth_headers,
                               params={"limit": 10})
        data = response.json()
        
        for row in data['rows']:
            assert 'modelo' in row, "Row missing modelo"
            assert 'cells' in row, "Row missing cells"
            assert 'total' in row, "Row missing total"
    
    def test_modelo_talla_crossfilter(self, auth_headers):
        """Cross-filter by modelo=CLASIC"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/modelo-talla",
                               headers=auth_headers,
                               params={"modelo": "CLASIC"})
        assert response.status_code == 200
        data = response.json()
        
        assert data['total_modelos'] == 2  # CLASIC and CLASIC-LQ
        assert data['grand_total'] == 837


class TestDetalleEndpoint(TestStockDashboardAuth):
    """Test GET /api/stock-dashboard/detalle - Detail table"""
    
    def test_detalle_unfiltered(self, auth_headers):
        """Detalle returns paginated items"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle",
                               headers=auth_headers,
                               params={"limit": 10})
        assert response.status_code == 200
        data = response.json()
        
        assert 'items' in data
        assert 'total' in data
        assert 'page' in data
        assert data['total'] > 0
    
    def test_detalle_item_structure(self, auth_headers):
        """Detalle items have required fields"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle",
                               headers=auth_headers,
                               params={"limit": 5})
        data = response.json()
        
        if data['items']:
            item = data['items'][0]
            required_fields = ['tienda', 'modelo', 'talla', 'color', 'available_qty']
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
    
    def test_detalle_crossfilter_modelo(self, auth_headers):
        """Detalle filtered by modelo"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle",
                               headers=auth_headers,
                               params={"modelo": "CLASIC", "limit": 10})
        assert response.status_code == 200
        data = response.json()
        
        # All items should be CLASIC variants
        for item in data['items']:
            assert 'CLASIC' in item['modelo'], f"Non-CLASIC item: {item['modelo']}"
    
    def test_detalle_pagination(self, auth_headers):
        """Detalle pagination works"""
        response_p1 = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle",
                                  headers=auth_headers,
                                  params={"page": 1, "limit": 10})
        response_p2 = requests.get(f"{BASE_URL}/api/stock-dashboard/detalle",
                                  headers=auth_headers,
                                  params={"page": 2, "limit": 10})
        
        assert response_p1.status_code == 200
        assert response_p2.status_code == 200
        
        data_p1 = response_p1.json()
        data_p2 = response_p2.json()
        
        # Different pages should have different items
        if data_p1['items'] and data_p2['items']:
            assert data_p1['items'][0] != data_p2['items'][0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
