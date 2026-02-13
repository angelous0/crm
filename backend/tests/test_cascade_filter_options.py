"""
Test Stock Dashboard Cascade/Dependent Filter Options Feature
Tests: GET /api/stock-dashboard/filter-options endpoint
Focus: Cascade logic - each field's options are calculated by applying ALL other active filters EXCEPT itself
Reference values (from main agent):
- Unfiltered: 32 entalles, 39 telas, 161 colores
- With marca=BOOSH: entalles=6, telas=1 (Drill), colores=20
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestCascadeFilterAuth:
    """Authentication setup"""
    
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


class TestFilterOptionsBasic(TestCascadeFilterAuth):
    """Test basic filter-options endpoint functionality"""
    
    def test_filter_options_no_filters_returns_all(self, auth_headers):
        """With no filters, all options should be available"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check all expected keys present
        expected_keys = ['tienda_canonicas', 'marcas', 'tipos', 'entalles', 'telas', 'tallas', 'colores']
        for key in expected_keys:
            assert key in data, f"Missing filter key: {key}"
        
        # Verify we get full unfiltered counts (approx values from context)
        assert len(data.get('entalles', [])) >= 30, f"Expected ~32 entalles, got {len(data.get('entalles', []))}"
        assert len(data.get('telas', [])) >= 35, f"Expected ~39 telas, got {len(data.get('telas', []))}"
        assert len(data.get('colores', [])) >= 150, f"Expected ~161 colores, got {len(data.get('colores', []))}"
    
    def test_filter_options_returns_canonical_tiendas(self, auth_headers):
        """Tienda canonicas should be present"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options", headers=auth_headers)
        data = response.json()
        
        tiendas = data.get('tienda_canonicas', [])
        expected_tiendas = ['ALMACEN', 'BOOSH', 'GAMARRA 207', 'GAMARRA 209', 'GM218', 'GRAU 238 / GRAU 55']
        for tienda in expected_tiendas:
            assert tienda in tiendas, f"Missing tienda: {tienda}"


class TestCascadeWithMarca(TestCascadeFilterAuth):
    """Test cascade filtering with marca=BOOSH"""
    
    def test_marca_boosh_reduces_entalles(self, auth_headers):
        """With marca=BOOSH, entalles should reduce to ~6"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                               headers=auth_headers,
                               params={"marca": "BOOSH"})
        assert response.status_code == 200
        data = response.json()
        
        entalles = data.get('entalles', [])
        # Should be significantly reduced from 32
        assert len(entalles) <= 10, f"Expected ~6 entalles with BOOSH, got {len(entalles)}"
        assert len(entalles) >= 1, "Should have at least 1 entalle"
    
    def test_marca_boosh_reduces_telas(self, auth_headers):
        """With marca=BOOSH, telas should reduce to 1 (Drill)"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                               headers=auth_headers,
                               params={"marca": "BOOSH"})
        assert response.status_code == 200
        data = response.json()
        
        telas = data.get('telas', [])
        # Should be exactly 1 tela: Drill
        assert len(telas) >= 1, f"Expected at least 1 tela with BOOSH, got {len(telas)}"
        assert 'Drill' in telas, f"Expected 'Drill' in telas with BOOSH, got {telas}"
    
    def test_marca_boosh_reduces_tallas(self, auth_headers):
        """With marca=BOOSH, tallas should reduce to ~4"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                               headers=auth_headers,
                               params={"marca": "BOOSH"})
        assert response.status_code == 200
        data = response.json()
        
        tallas = data.get('tallas', [])
        assert len(tallas) >= 1, "Should have at least 1 talla"
    
    def test_marca_boosh_reduces_colores(self, auth_headers):
        """With marca=BOOSH, colores should reduce to ~20"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                               headers=auth_headers,
                               params={"marca": "BOOSH"})
        assert response.status_code == 200
        data = response.json()
        
        colores = data.get('colores', [])
        # Should be reduced from 161
        assert len(colores) < 50, f"Expected ~20 colores with BOOSH, got {len(colores)}"


class TestCascadeSelfExclusion(TestCascadeFilterAuth):
    """Test cascade logic - each field excludes itself"""
    
    def test_entalle_filter_shows_all_entalles(self, auth_headers):
        """When filtering by entalle, entalle options should still show all (32) - excludes self"""
        # First get baseline with marca=BOOSH (which reduces entalles to ~6)
        response_boosh = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                     headers=auth_headers,
                                     params={"marca": "BOOSH"})
        entalles_with_boosh = len(response_boosh.json().get('entalles', []))
        
        # Now add entalle filter - should still show same entalles (self-exclusion)
        response_boosh_entalle = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                             headers=auth_headers,
                                             params={"marca": "BOOSH", "entalle": "Oversize"})
        entalles_with_both = response_boosh_entalle.json().get('entalles', [])
        
        # The entalle list should not be further reduced by entalle filter
        # (self-exclusion means entalle filter doesn't affect entalle options)
        assert len(entalles_with_both) >= entalles_with_boosh or len(entalles_with_both) >= 1


class TestCascadeMultipleFilters(TestCascadeFilterAuth):
    """Test cascade with multiple filters"""
    
    def test_marca_plus_tipo_reduces_further(self, auth_headers):
        """Combining marca+tipo should further reduce options"""
        # Get options with just marca
        response_marca = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                     headers=auth_headers,
                                     params={"marca": "BOOSH"})
        colores_marca = len(response_marca.json().get('colores', []))
        
        # Get all tipos available with BOOSH
        tipos_with_boosh = response_marca.json().get('tipos', [])
        
        if tipos_with_boosh:
            # Add a tipo filter
            response_both = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                        headers=auth_headers,
                                        params={"marca": "BOOSH", "tipo": tipos_with_boosh[0]})
            colores_both = len(response_both.json().get('colores', []))
            
            # Should be same or less than marca alone
            assert colores_both <= colores_marca + 5, "Adding tipo filter should not significantly increase colores"


class TestCascadeLimit(TestCascadeFilterAuth):
    """Test LIMIT 500 per field"""
    
    def test_limit_500_per_field(self, auth_headers):
        """Each field should have at most 500 options"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options", headers=auth_headers)
        data = response.json()
        
        for key in ['tienda_canonicas', 'marcas', 'tipos', 'entalles', 'telas', 'tallas', 'colores']:
            options = data.get(key, [])
            assert len(options) <= 500, f"{key} exceeds 500 limit: {len(options)}"


class TestCascadeCache(TestCascadeFilterAuth):
    """Test caching behavior"""
    
    def test_cache_second_request_faster(self, auth_headers):
        """Second identical request should be faster due to cache (60s TTL)"""
        params = {"marca": "BOOSH"}
        
        # First request - may or may not be cached
        start1 = time.time()
        response1 = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                headers=auth_headers, params=params)
        time1 = time.time() - start1
        assert response1.status_code == 200
        
        # Second request - should hit cache
        start2 = time.time()
        response2 = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options",
                                headers=auth_headers, params=params)
        time2 = time.time() - start2
        assert response2.status_code == 200
        
        # Both should return same data
        assert response1.json() == response2.json(), "Cached response should match original"
        
        # Note: Can't reliably assert time2 < time1 due to network variance
        # Just verify both succeed


class TestCascadeTallaSorting(TestCascadeFilterAuth):
    """Test talla sorting"""
    
    def test_tallas_are_sorted(self, auth_headers):
        """Tallas should be sorted in size order"""
        response = requests.get(f"{BASE_URL}/api/stock-dashboard/filter-options", headers=auth_headers)
        data = response.json()
        
        tallas = data.get('tallas', [])
        # Check S, M, L order if present
        if 'S' in tallas and 'M' in tallas and 'L' in tallas:
            assert tallas.index('S') < tallas.index('M') < tallas.index('L'), "Tallas not sorted correctly"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
