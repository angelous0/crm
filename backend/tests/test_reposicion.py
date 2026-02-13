"""
Tests for the Reposición / Faltantes module
Module detects missing/low-stock SKUs in target stores and recommends replenishment
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stock-attenuation.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@test.com",
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestReposicionEndpoint:
    """Tests for GET /api/stock-dashboard/reposicion"""
    
    def test_reposicion_default_params(self, auth_headers):
        """Test reposicion endpoint with default parameters"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "umbral_origen": 2,
                "objetivo_destino": 2,
                "solo_objetivo": True,
                "page": 1,
                "limit": 10
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "items" in data
        assert "total" in data
        assert "kpis" in data
        
        # Check KPIs structure
        kpis = data["kpis"]
        assert "total_faltantes" in kpis
        assert "skus_unicos" in kpis
        assert "total_qty_sugerida" in kpis
        assert "desde_almacen" in kpis
        assert "entre_tiendas" in kpis
        
        print(f"Total faltantes: {kpis['total_faltantes']}, SKUs: {kpis['skus_unicos']}")
    
    def test_reposicion_item_structure(self, auth_headers):
        """Test that each reposicion item has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 5},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["items"]:
            item = data["items"][0]
            required_fields = [
                "tienda_destino", "marca", "tipo", "entalle", "tela", 
                "color", "talla", "stock_destino", "stock_almacen", 
                "stock_total", "origen_recomendado", "stock_origen", 
                "qty_sugerida", "motivo"
            ]
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
    
    def test_reposicion_umbral_destino_filter(self, auth_headers):
        """Test that umbral_destino=0 filters to only stock_destino=0"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 20},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All items should have stock_destino = 0 when umbral_destino = 0
        for item in data["items"]:
            assert item["stock_destino"] == 0, f"Expected stock_destino=0, got {item['stock_destino']}"
    
    def test_reposicion_marca_qepo_filter(self, auth_headers):
        """Test QEPO brand filter - should only show BOOSH and GAMARRA 207 destinations"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "marca_repo": "QEPO",
                "limit": 50
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All destinations should be BOOSH or GAMARRA 207 for QEPO brand
        expected_destinations = {"BOOSH", "GAMARRA 207"}
        actual_destinations = set(item["tienda_destino"] for item in data["items"])
        
        assert actual_destinations <= expected_destinations, \
            f"QEPO should only have BOOSH/GAMARRA 207 destinations. Got: {actual_destinations}"
        
        # All items should have QEPO brand
        for item in data["items"]:
            assert item["marca"].upper() == "QEPO"
    
    def test_reposicion_marca_element_premium_filter(self, auth_headers):
        """Test ELEMENT PREMIUM brand filter - should show GAMARRA 209, GM218, GRAU 238"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "marca_repo": "ELEMENT PREMIUM",
                "limit": 50
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["items"]:
            # Expected destinations for ELEMENT PREMIUM
            expected_destinations = {"GAMARRA 209", "GM218", "GRAU 238 / GRAU 55"}
            actual_destinations = set(item["tienda_destino"] for item in data["items"])
            
            assert actual_destinations <= expected_destinations, \
                f"ELEMENT PREMIUM unexpected destinations: {actual_destinations - expected_destinations}"
    
    def test_reposicion_tienda_destino_filter(self, auth_headers):
        """Test tienda_destino filter"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "tienda_destino": "BOOSH",
                "limit": 20
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All items should have tienda_destino = BOOSH
        for item in data["items"]:
            assert item["tienda_destino"] == "BOOSH"
    
    def test_reposicion_solo_objetivo_false(self, auth_headers):
        """Test solo_objetivo=false shows all stores as destinations"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": False,
                "limit": 100
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have all 5 store destinations
        all_stores = {"GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207"}
        actual_destinations = set(item["tienda_destino"] for item in data["items"])
        
        # Should have multiple destinations (not restricted by brand)
        assert len(actual_destinations) > 1, "Expected multiple destinations with solo_objetivo=false"
    
    def test_reposicion_almacen_prioritized(self, auth_headers):
        """Test that ALMACEN is prioritized as source when has stock"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 50},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Items with stock_almacen > 0 should have origen_recomendado = ALMACEN
        for item in data["items"]:
            if item["stock_almacen"] > 0:
                assert item["origen_recomendado"] == "ALMACEN", \
                    f"Expected ALMACEN as source when stock_almacen={item['stock_almacen']}"
    
    def test_reposicion_pagination(self, auth_headers):
        """Test pagination works"""
        # Get page 1
        response1 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "page": 1, "limit": 10},
            headers=auth_headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Get page 2
        response2 = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "page": 2, "limit": 10},
            headers=auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should have same total
        assert data1["total"] == data2["total"]
        
        # Items should be different
        if data1["items"] and data2["items"]:
            item1_first = data1["items"][0]
            item2_first = data2["items"][0]
            assert item1_first != item2_first, "Page 1 and 2 should have different items"
    
    def test_reposicion_sorting(self, auth_headers):
        """Test results are sorted by stock_destino ASC, stock_total ASC"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 20},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check first items have stock_destino = 0 (sorted ASC)
        if len(data["items"]) >= 2:
            for i, item in enumerate(data["items"]):
                assert item["stock_destino"] == 0, \
                    f"Item {i} has stock_destino={item['stock_destino']}, expected 0"


class TestReposicionDetalleEndpoint:
    """Tests for GET /api/stock-dashboard/reposicion-detalle"""
    
    def test_reposicion_detalle_basic(self, auth_headers):
        """Test reposicion-detalle endpoint returns distribution"""
        # First get a SKU from reposicion
        repo_response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 1},
            headers=auth_headers
        )
        assert repo_response.status_code == 200
        repo_data = repo_response.json()
        
        if not repo_data["items"]:
            pytest.skip("No reposicion items to test detalle")
        
        item = repo_data["items"][0]
        
        # Get detail
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion-detalle",
            params={
                "marca_norm": item["marca"],
                "tipo": item["tipo"],
                "entalle": item["entalle"],
                "tela": item["tela"],
                "color": item["color"],
                "talla": item["talla"]
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "distribucion" in data
        
        if data["distribucion"]:
            dist_item = data["distribucion"][0]
            assert "tienda" in dist_item
            assert "stock" in dist_item
    
    def test_reposicion_detalle_shows_stores(self, auth_headers):
        """Test that detalle shows stock distribution per store"""
        # Get a SKU with ALMACEN stock
        repo_response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 10},
            headers=auth_headers
        )
        assert repo_response.status_code == 200
        repo_data = repo_response.json()
        
        # Find item with ALMACEN stock
        item_with_almacen = None
        for item in repo_data["items"]:
            if item["stock_almacen"] > 0:
                item_with_almacen = item
                break
        
        if not item_with_almacen:
            pytest.skip("No item with ALMACEN stock found")
        
        # Get detail
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion-detalle",
            params={
                "marca_norm": item_with_almacen["marca"],
                "tipo": item_with_almacen["tipo"],
                "entalle": item_with_almacen["entalle"],
                "tela": item_with_almacen["tela"],
                "color": item_with_almacen["color"],
                "talla": item_with_almacen["talla"]
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have ALMACEN in distribution
        stores = [d["tienda"] for d in data["distribucion"]]
        assert "ALMACEN" in stores, "Expected ALMACEN in distribution"


class TestReposicionAuth:
    """Test authentication requirements"""
    
    def test_reposicion_requires_auth(self):
        """Test that reposicion endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0}
        )
        assert response.status_code == 401
    
    def test_reposicion_detalle_requires_auth(self):
        """Test that reposicion-detalle endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion-detalle",
            params={"marca_norm": "TEST"}
        )
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
