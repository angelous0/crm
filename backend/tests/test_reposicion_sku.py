"""
Tests for Reposición SKU-level module (v3):
- GET /api/reposicion/sku-summary: SKU summary with store columns and allocation
- GET /api/reposicion/sku-models: Model drilldown for a specific SKU
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stock-reposicion.preview.emergentagent.com').rstrip('/')


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


class TestSkuSummaryEndpoint:
    """Tests for GET /api/reposicion/sku-summary"""
    
    def test_sku_summary_returns_200_with_auth(self, auth_headers):
        """Test endpoint returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 5, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        print(f"sku-summary response status: {response.status_code}")
    
    def test_sku_summary_requires_auth(self):
        """Test endpoint returns 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 5}
        )
        assert response.status_code == 401
        print(f"Unauthorized response: {response.json()}")
    
    def test_sku_summary_response_structure(self, auth_headers):
        """Test response has correct structure: items, total, kpis"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 10, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required keys
        assert "items" in data, "Response should have 'items'"
        assert "total" in data, "Response should have 'total'"
        assert "kpis" in data, "Response should have 'kpis'"
        
        # Validate items is a list
        assert isinstance(data["items"], list), "items should be a list"
        # Validate total is int
        assert isinstance(data["total"], int), "total should be int"
        # Validate kpis is dict
        assert isinstance(data["kpis"], dict), "kpis should be dict"
        
        print(f"Response structure valid - items: {len(data['items'])}, total: {data['total']}")
    
    def test_sku_summary_kpis_fields(self, auth_headers):
        """Test KPIs has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 10, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        kpis = response.json()["kpis"]
        
        required_kpi_fields = [
            "total_skus", "faltantes", "bajos", 
            "con_asignacion", "total_qty_asignada", "sin_stock"
        ]
        
        for field in required_kpi_fields:
            assert field in kpis, f"KPIs should have '{field}'"
            assert isinstance(kpis[field], (int, float)), f"{field} should be numeric"
        
        print(f"KPIs: {kpis}")
    
    def test_sku_item_structure(self, auth_headers):
        """Test each SKU item has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 5, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No items returned")
        
        item = items[0]
        required_fields = [
            "sku_key", "marca", "tipo", "entalle", "tela", "color", "talla",
            "stock_total", "stock_almacen", "destinos", "recomendaciones", 
            "rec_text", "estado"
        ]
        
        for field in required_fields:
            assert field in item, f"Item should have '{field}'"
        
        print(f"Sample item keys: {list(item.keys())}")
    
    def test_destinos_array_structure(self, auth_headers):
        """Test destinos array has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 5, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No items returned")
        
        item = items[0]
        destinos = item["destinos"]
        
        # Should have 5 destination columns
        assert len(destinos) == 5, f"Expected 5 destinos, got {len(destinos)}"
        
        # Each destino should have required fields
        for d in destinos:
            assert "tienda_group" in d
            assert "stock" in d
            assert "score_tallado" in d
            assert "es_objetivo" in d
            assert isinstance(d["stock"], int)
            assert isinstance(d["score_tallado"], (int, float))
            assert isinstance(d["es_objetivo"], bool)
        
        dest_names = [d["tienda_group"] for d in destinos]
        print(f"Destinos: {dest_names}")
    
    def test_recomendaciones_array_structure(self, auth_headers):
        """Test recomendaciones array has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 5, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No items returned")
        
        # Find item with recomendaciones
        item_with_recs = next((i for i in items if i.get("recomendaciones")), None)
        if not item_with_recs:
            pytest.skip("No items with recomendaciones")
        
        rec = item_with_recs["recomendaciones"][0]
        required_rec_fields = [
            "destino", "stock_destino", "origen", 
            "qty_sugerida", "qty_asignada", "motivo"
        ]
        
        for field in required_rec_fields:
            assert field in rec, f"Recomendacion should have '{field}'"
        
        print(f"Sample recomendacion: {rec}")


class TestPoolCapping:
    """Tests for pool capping: qty_asignada never exceeds stock_almacen"""
    
    def test_qty_asignada_never_exceeds_stock_almacen(self, auth_headers):
        """Test sum of qty_asignada <= stock_almacen per SKU"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 100, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        violations = []
        for item in items:
            total_assigned = sum(r["qty_asignada"] for r in item.get("recomendaciones", []))
            if total_assigned > item["stock_almacen"]:
                violations.append({
                    "sku": item["sku_key"],
                    "stock_almacen": item["stock_almacen"],
                    "total_assigned": total_assigned
                })
        
        assert len(violations) == 0, f"Found {len(violations)} pool cap violations: {violations[:3]}"
        print(f"Pool capping verified for {len(items)} items")
    
    def test_limited_stock_single_allocation(self, auth_headers):
        """When stock_almacen=1, only 1 unit total should be assigned"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 200, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        # Find items with stock_almacen=1
        items_with_1 = [i for i in items if i["stock_almacen"] == 1]
        
        if not items_with_1:
            pytest.skip("No items with stock_almacen=1")
        
        violations = []
        for item in items_with_1:
            total = sum(r["qty_asignada"] for r in item.get("recomendaciones", []))
            if total > 1:
                violations.append({"sku": item["sku_key"], "total": total})
        
        assert len(violations) == 0, f"Items with stock=1 assigned more than 1: {violations[:3]}"
        print(f"Verified {len(items_with_1)} items with stock_almacen=1")


class TestSorting:
    """Tests for sorting: FALTANTE first, then stock_total ASC"""
    
    def test_faltantes_come_first(self, auth_headers):
        """Test FALTANTE estado items come before BAJO"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 100, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No items")
        
        # Once we see BAJO, we shouldn't see FALTANTE again
        seen_bajo = False
        for item in items:
            if item["estado"] == "BAJO":
                seen_bajo = True
            elif item["estado"] == "FALTANTE" and seen_bajo:
                pytest.fail("Found FALTANTE after BAJO - sorting incorrect")
        
        print("FALTANTE before BAJO: verified")


class TestSoloObjetivoFilter:
    """Tests for solo_objetivo filter"""
    
    def test_solo_objetivo_true_limits_to_brand_targets(self, auth_headers):
        """Test solo_objetivo=true only shows brand target destinations"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"marca": "ELEMENT PREMIUM", "limit": 10, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No ELEMENT PREMIUM items")
        
        # For ELEMENT PREMIUM, targets are GM209, GM218, GRAU 238 / GRAU 55
        expected_targets = {"GM209", "GM218", "GRAU 238 / GRAU 55"}
        
        for item in items:
            for rec in item.get("recomendaciones", []):
                if rec["qty_asignada"] > 0:
                    assert rec["destino"] in expected_targets, f"Unexpected dest: {rec['destino']}"
        
        print(f"ELEMENT PREMIUM targets verified: {expected_targets}")
    
    def test_qepo_targets_boosh_gm207(self, auth_headers):
        """Test QEPO brand only targets BOOSH and GM207"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"marca": "QEPO", "limit": 10, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        items = response.json()["items"]
        
        if not items:
            pytest.skip("No QEPO items")
        
        expected_targets = {"BOOSH", "GM207"}
        
        for item in items:
            for destino in item["destinos"]:
                if destino["es_objetivo"]:
                    assert destino["tienda_group"] in expected_targets, \
                        f"QEPO unexpected target: {destino['tienda_group']}"
        
        print(f"QEPO targets verified: {expected_targets}")
    
    def test_solo_objetivo_false_shows_more_results(self, auth_headers):
        """Test solo_objetivo=false returns more items"""
        # With solo_objetivo=true
        resp_true = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 1, "solo_objetivo": True},
            headers=auth_headers
        )
        # With solo_objetivo=false
        resp_false = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 1, "solo_objetivo": False},
            headers=auth_headers
        )
        
        total_true = resp_true.json()["total"]
        total_false = resp_false.json()["total"]
        
        assert total_false >= total_true, "solo_objetivo=false should have >= items"
        print(f"solo_objetivo=true: {total_true}, solo_objetivo=false: {total_false}")


class TestSkuModelsEndpoint:
    """Tests for GET /api/reposicion/sku-models"""
    
    def test_sku_models_returns_200_with_auth(self, auth_headers):
        """Test endpoint returns 200 with valid auth"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-models",
            params={
                "marca": "ELEMENT PREMIUM",
                "tipo": "Pantalon Denim",
                "entalle": "Semipitillo",
                "tela": "Comfort",
                "color": "Cenizo Claro",
                "talla": "32"
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        print(f"sku-models response status: {response.status_code}")
    
    def test_sku_models_requires_auth(self):
        """Test endpoint returns 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-models",
            params={"marca": "ELEMENT PREMIUM"}
        )
        assert response.status_code == 401
    
    def test_sku_models_response_structure(self, auth_headers):
        """Test response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-models",
            params={
                "marca": "ELEMENT PREMIUM",
                "tipo": "Pantalon Denim",
                "entalle": "Semipitillo",
                "tela": "Comfort",
                "color": "Cenizo Claro",
                "talla": "32"
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "models" in data, "Response should have 'models'"
        assert isinstance(data["models"], list), "models should be list"
    
    def test_model_item_structure(self, auth_headers):
        """Test each model item has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-models",
            params={
                "marca": "ELEMENT PREMIUM",
                "tipo": "Pantalon Denim",
                "entalle": "Semipitillo",
                "tela": "Comfort",
                "color": "Cenizo Claro",
                "talla": "32"
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        models = response.json()["models"]
        
        if not models:
            pytest.skip("No models found for this SKU")
        
        model = models[0]
        required_fields = ["modelo", "stock_total", "stock_almacen", "por_tienda"]
        
        for field in required_fields:
            assert field in model, f"Model should have '{field}'"
        
        # Verify por_tienda structure
        assert isinstance(model["por_tienda"], list), "por_tienda should be list"
        if model["por_tienda"]:
            pt = model["por_tienda"][0]
            assert "tienda_group" in pt
            assert "stock" in pt
        
        print(f"Model structure valid: {model}")
    
    def test_sku_models_empty_without_required_params(self, auth_headers):
        """Test returns empty if no marca/tipo/color/talla"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-models",
            params={},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["models"] == []


class TestKPITotals:
    """Tests for KPI accuracy"""
    
    def test_expected_sku_count_approx_2575(self, auth_headers):
        """Test total SKUs is approximately 2575 as expected"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 1, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        total = response.json()["total"]
        
        # Allow some variance due to live data
        assert total > 2000, f"Expected ~2575 SKUs, got {total}"
        print(f"Total SKUs: {total}")
    
    def test_con_asignacion_count_approx_1526(self, auth_headers):
        """Test con_asignacion is approximately 1526 as expected"""
        response = requests.get(
            f"{BASE_URL}/api/reposicion/sku-summary",
            params={"limit": 1, "solo_objetivo": True},
            headers=auth_headers
        )
        assert response.status_code == 200
        con_asig = response.json()["kpis"]["con_asignacion"]
        
        # Allow some variance
        assert con_asig > 1000, f"Expected ~1526 with allocation, got {con_asig}"
        print(f"SKUs with allocation: {con_asig}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
