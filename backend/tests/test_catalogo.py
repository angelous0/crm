"""
Test suite for Catalogo endpoints - verifying new stock matrix and filter features.
Tests:
1. GET /api/catalogo - products with stock, filters (marca, tipo, tela, entalle)
2. GET /api/catalogo/telas - distinct tela values
3. GET /api/catalogo/entalles - distinct entalle values
4. GET /api/catalogo/marcas - distinct marca values
5. GET /api/catalogo/tipos - distinct tipo values
6. GET /api/catalogo/{tmpl_id}/matriz?location_id=ALL - matrix data
7. GET /api/catalogo/{tmpl_id}/matriz?location_id={id} - location-filtered matrix
8. GET /api/catalogo/{tmpl_id}/variantes - variant detail rows
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
TEST_EMAIL = "test_cat@crm.com"
TEST_PASSWORD = "test123"
KNOWN_TMPL_ID = 4102  # CLASIC product mentioned in review request


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
            "nombre": "Test Catalog User"
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


class TestCatalogoFilterEndpoints(TestAuthSetup):
    """Test distinct value endpoints for dropdown filters"""

    def test_get_marcas(self, auth_headers):
        """GET /api/catalogo/marcas - returns distinct marca values"""
        response = requests.get(f"{BASE_URL}/api/catalogo/marcas", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} marca values: {data[:5]}...")

    def test_get_tipos(self, auth_headers):
        """GET /api/catalogo/tipos - returns distinct tipo values"""
        response = requests.get(f"{BASE_URL}/api/catalogo/tipos", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} tipo values: {data[:5]}...")

    def test_get_telas(self, auth_headers):
        """GET /api/catalogo/telas - returns distinct tela values"""
        response = requests.get(f"{BASE_URL}/api/catalogo/telas", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} tela values: {data[:5]}...")

    def test_get_entalles(self, auth_headers):
        """GET /api/catalogo/entalles - returns distinct entalle values"""
        response = requests.get(f"{BASE_URL}/api/catalogo/entalles", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Found {len(data)} entalle values: {data[:5]}...")


class TestCatalogoCRUD(TestAuthSetup):
    """Test main catalog listing and filtering"""

    def test_get_catalogo_basic(self, auth_headers):
        """GET /api/catalogo - returns products with stock"""
        response = requests.get(f"{BASE_URL}/api/catalogo", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "items" in data, "Response should have 'items'"
        assert "total" in data, "Response should have 'total'"
        assert isinstance(data["items"], list), "Items should be a list"
        
        if len(data["items"]) > 0:
            item = data["items"][0]
            # Verify expected fields
            assert "product_tmpl_id" in item, "Item should have product_tmpl_id"
            assert "nombre" in item, "Item should have nombre"
            assert "stock_total_disponible" in item, "Item should have stock_total_disponible"
            # Verify price field exists for S/ formatting in frontend
            assert "list_price" in item, "Item should have list_price"
        
        print(f"✓ Catalog has {data['total']} products with stock")

    def test_filter_by_marca(self, auth_headers):
        """GET /api/catalogo?marca=X - filters by marca"""
        # First get available marcas
        marcas_resp = requests.get(f"{BASE_URL}/api/catalogo/marcas", headers=auth_headers)
        marcas = marcas_resp.json() if marcas_resp.status_code == 200 else []
        
        if len(marcas) > 0:
            test_marca = marcas[0]
            response = requests.get(f"{BASE_URL}/api/catalogo", 
                                    params={"marca": test_marca}, 
                                    headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Filtering by marca '{test_marca}' returned {data['total']} products")
        else:
            pytest.skip("No marcas available to test")

    def test_filter_by_tela(self, auth_headers):
        """GET /api/catalogo?tela=X - filters by tela"""
        # First get available telas
        telas_resp = requests.get(f"{BASE_URL}/api/catalogo/telas", headers=auth_headers)
        telas = telas_resp.json() if telas_resp.status_code == 200 else []
        
        if len(telas) > 0:
            test_tela = telas[0]
            response = requests.get(f"{BASE_URL}/api/catalogo", 
                                    params={"tela": test_tela}, 
                                    headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Filtering by tela '{test_tela}' returned {data['total']} products")
        else:
            pytest.skip("No telas available to test")

    def test_filter_by_entalle(self, auth_headers):
        """GET /api/catalogo?entalle=X - filters by entalle"""
        # First get available entalles
        entalles_resp = requests.get(f"{BASE_URL}/api/catalogo/entalles", headers=auth_headers)
        entalles = entalles_resp.json() if entalles_resp.status_code == 200 else []
        
        if len(entalles) > 0:
            test_entalle = entalles[0]
            response = requests.get(f"{BASE_URL}/api/catalogo", 
                                    params={"entalle": test_entalle}, 
                                    headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            print(f"✓ Filtering by entalle '{test_entalle}' returned {data['total']} products")
        else:
            pytest.skip("No entalles available to test")


class TestMatrizEndpoint(TestAuthSetup):
    """Test stock matrix endpoint"""

    def test_matriz_all_locations(self, auth_headers):
        """GET /api/catalogo/{tmpl_id}/matriz?location_id=ALL - matrix for all locations"""
        response = requests.get(
            f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/matriz",
            params={"location_id": "ALL"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify matrix structure
        assert "tallas" in data, "Response should have 'tallas'"
        assert "colores" in data, "Response should have 'colores'"
        assert "matrix" in data, "Response should have 'matrix'"
        assert "totals" in data, "Response should have 'totals'"
        assert "locations" in data, "Response should have 'locations'"
        
        # Verify totals structure
        totals = data["totals"]
        assert "byColor" in totals, "Totals should have 'byColor'"
        assert "bySize" in totals, "Totals should have 'bySize'"
        assert "grandTotal" in totals, "Totals should have 'grandTotal'"
        
        print(f"✓ Matrix has {len(data['colores'])} colors, {len(data['tallas'])} sizes")
        print(f"✓ Grand total stock: {totals['grandTotal']}")
        print(f"✓ Available locations: {len(data['locations'])}")

    def test_matriz_with_location_filter(self, auth_headers):
        """GET /api/catalogo/{tmpl_id}/matriz?location_id={id} - matrix filtered by location"""
        # First get locations from ALL query
        response = requests.get(
            f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/matriz",
            params={"location_id": "ALL"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        locations = data.get("locations", [])
        if len(locations) > 0:
            test_location = locations[0]
            loc_id = test_location["id"]
            
            response = requests.get(
                f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/matriz",
                params={"location_id": str(loc_id)},
                headers=auth_headers
            )
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            
            filtered_data = response.json()
            # Verify structure is same
            assert "tallas" in filtered_data
            assert "colores" in filtered_data
            assert "matrix" in filtered_data
            assert "totals" in filtered_data
            
            print(f"✓ Location '{test_location['nombre']}' (id={loc_id})")
            print(f"✓ Filtered grand total: {filtered_data['totals']['grandTotal']}")
        else:
            pytest.skip("No locations available to test")

    def test_matriz_totals_by_color(self, auth_headers):
        """Verify totals per color row are calculated correctly"""
        response = requests.get(
            f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/matriz",
            params={"location_id": "ALL"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        matrix = data.get("matrix", {})
        totals = data.get("totals", {})
        tallas = data.get("tallas", [])
        
        # Verify byColor totals
        for color, color_total in totals.get("byColor", {}).items():
            calculated_total = sum(matrix.get(color, {}).get(t, 0) for t in tallas)
            assert abs(calculated_total - color_total) < 0.01, f"Color {color} total mismatch"
        
        print(f"✓ Color row totals verified")

    def test_matriz_totals_by_size(self, auth_headers):
        """Verify totals per talla column are calculated correctly"""
        response = requests.get(
            f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/matriz",
            params={"location_id": "ALL"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        matrix = data.get("matrix", {})
        totals = data.get("totals", {})
        colores = data.get("colores", [])
        
        # Verify bySize totals
        for talla, talla_total in totals.get("bySize", {}).items():
            calculated_total = sum(matrix.get(c, {}).get(talla, 0) for c in colores)
            assert abs(calculated_total - talla_total) < 0.01, f"Talla {talla} total mismatch"
        
        print(f"✓ Size column totals verified")


class TestVariantesEndpoint(TestAuthSetup):
    """Test variant detail endpoint"""

    def test_variantes_detail(self, auth_headers):
        """GET /api/catalogo/{tmpl_id}/variantes - returns variant detail rows"""
        response = requests.get(
            f"{BASE_URL}/api/catalogo/{KNOWN_TMPL_ID}/variantes",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            variant = data[0]
            # Verify expected fields
            assert "product_tmpl_id" in variant, "Variant should have product_tmpl_id"
            assert "talla" in variant, "Variant should have talla"
            assert "color" in variant, "Variant should have color"
            assert "available_qty" in variant, "Variant should have available_qty"
        
        print(f"✓ Found {len(data)} variant rows for product {KNOWN_TMPL_ID}")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
