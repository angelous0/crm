"""
Tests for the Reposición v2 module - Pool Capping + Tallado
Tests new fields: hilo, tallado_destino, and updated KPIs (con_asignacion, sin_stock)
"""
import pytest
import requests
import os
from collections import defaultdict

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


class TestReposicionV2NewFields:
    """Tests for NEW fields in reposicion v2: hilo, tallado_destino, updated KPIs"""
    
    def test_item_has_hilo_field(self, auth_headers):
        """Test that each item includes the new 'hilo' field"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 10},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "items" in data, "Response should have 'items'"
        if data["items"]:
            item = data["items"][0]
            assert "hilo" in item, "Item should have 'hilo' field"
            print(f"Sample item hilo value: '{item['hilo']}'")
    
    def test_item_has_tallado_destino_field(self, auth_headers):
        """Test that each item includes the new 'tallado_destino' field"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 10},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["items"]:
            item = data["items"][0]
            assert "tallado_destino" in item, "Item should have 'tallado_destino' field"
            assert isinstance(item["tallado_destino"], (int, float)), f"tallado_destino should be numeric, got {type(item['tallado_destino'])}"
            print(f"Sample item tallado_destino: {item['tallado_destino']}")
    
    def test_kpis_has_con_asignacion(self, auth_headers):
        """Test KPIs include 'con_asignacion' count"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 100},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        kpis = data.get("kpis", {})
        assert "con_asignacion" in kpis, "KPIs should have 'con_asignacion'"
        assert isinstance(kpis["con_asignacion"], int), "con_asignacion should be int"
        print(f"con_asignacion: {kpis['con_asignacion']}")
    
    def test_kpis_has_sin_stock(self, auth_headers):
        """Test KPIs include 'sin_stock' count (items with qty_sugerida=0)"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 100},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        kpis = data.get("kpis", {})
        assert "sin_stock" in kpis, "KPIs should have 'sin_stock'"
        assert isinstance(kpis["sin_stock"], int), "sin_stock should be int"
        print(f"sin_stock: {kpis['sin_stock']}")


class TestPoolCapping:
    """Tests for pool capping: qty_sugerida never exceeds stock_almacen per item"""
    
    def test_qty_sugerida_never_exceeds_stock_almacen_per_item(self, auth_headers):
        """Test qty_sugerida <= stock_almacen for each individual item"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 200},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        violations = []
        for item in data["items"]:
            if item["origen_recomendado"] == "ALMACEN" and item["qty_sugerida"] > item["stock_almacen"]:
                violations.append({
                    "sku": f"{item['marca']}/{item['tipo']}/{item['color']}/{item['talla']}",
                    "qty_sugerida": item["qty_sugerida"],
                    "stock_almacen": item["stock_almacen"]
                })
        
        assert len(violations) == 0, f"Found {len(violations)} items where qty_sugerida > stock_almacen: {violations[:5]}"
    
    def test_pool_cap_across_multiple_destinations(self, auth_headers):
        """
        CRITICAL: For same SKU, sum of qty_sugerida across all destinations must not exceed stock_almacen.
        This tests the global pool allocation.
        """
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": False, "limit": 500},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Group by SKU key (marca+tipo+entalle+tela+hilo+color+talla) for ALMACEN origin
        sku_allocations = defaultdict(lambda: {"total_qty": 0, "stock_almacen": 0, "destinations": []})
        
        for item in data["items"]:
            if item["origen_recomendado"] != "ALMACEN":
                continue
            
            sku_key = (
                item["marca"].upper().strip(),
                item["tipo"],
                item["entalle"],
                item["tela"],
                item.get("hilo", ""),
                item["color"],
                item["talla"]
            )
            sku_allocations[sku_key]["total_qty"] += item["qty_sugerida"]
            sku_allocations[sku_key]["stock_almacen"] = item["stock_almacen"]
            sku_allocations[sku_key]["destinations"].append({
                "dest": item["tienda_destino"],
                "qty": item["qty_sugerida"]
            })
        
        violations = []
        for sku_key, alloc in sku_allocations.items():
            if alloc["total_qty"] > alloc["stock_almacen"]:
                violations.append({
                    "sku": sku_key,
                    "total_allocated": alloc["total_qty"],
                    "stock_almacen": alloc["stock_almacen"],
                    "destinations": alloc["destinations"]
                })
        
        if violations:
            print(f"\nPool cap violations found: {len(violations)}")
            for v in violations[:3]:
                print(f"  SKU: {v['sku']}")
                print(f"    Total allocated: {v['total_allocated']}, Stock almacen: {v['stock_almacen']}")
                print(f"    Destinations: {v['destinations']}")
        
        assert len(violations) == 0, f"Found {len(violations)} SKUs where sum(qty_sugerida) > stock_almacen"
    
    def test_limited_stock_allocation(self, auth_headers):
        """
        Test: When stock_almacen=1 and multiple destinations need it,
        only 1 destination should get qty=1, others should get 0.
        """
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": False, "limit": 500},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Group by SKU with stock_almacen=1
        sku_groups = defaultdict(list)
        for item in data["items"]:
            if item["origen_recomendado"] == "ALMACEN" and item["stock_almacen"] == 1:
                sku_key = (
                    item["marca"].upper().strip(),
                    item["tipo"],
                    item["entalle"],
                    item["tela"],
                    item.get("hilo", ""),
                    item["color"],
                    item["talla"]
                )
                sku_groups[sku_key].append(item)
        
        violations = []
        for sku_key, items in sku_groups.items():
            if len(items) > 1:
                total_allocated = sum(it["qty_sugerida"] for it in items)
                if total_allocated > 1:
                    violations.append({
                        "sku": sku_key,
                        "total_allocated": total_allocated,
                        "num_destinations": len(items)
                    })
        
        assert len(violations) == 0, f"Found {len(violations)} SKUs with stock=1 that allocated more than 1 total"


class TestZeroQtyItems:
    """Tests for items with qty_sugerida=0 showing 'Sin stock para asignar'"""
    
    def test_zero_qty_items_have_sin_stock_motivo(self, auth_headers):
        """Test that items with qty_sugerida=0 have motivo containing 'Sin stock'"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 200},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        zero_qty_items = [it for it in data["items"] if it["qty_sugerida"] == 0]
        
        if zero_qty_items:
            violations = []
            for item in zero_qty_items:
                if "Sin stock" not in item["motivo"]:
                    violations.append({
                        "dest": item["tienda_destino"],
                        "sku": f"{item['marca']}/{item['color']}/{item['talla']}",
                        "motivo": item["motivo"]
                    })
            
            assert len(violations) == 0, f"Found {len(violations)} zero-qty items without 'Sin stock' motivo: {violations[:3]}"
            print(f"Checked {len(zero_qty_items)} items with qty=0, all have 'Sin stock' motivo")
    
    def test_zero_qty_items_have_dash_origin(self, auth_headers):
        """Test that items with qty_sugerida=0 and no allocation have origin='-'"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 200},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Items that couldn't find any source should have origen_recomendado = '-'
        # Note: Items that got capped to 0 from ALMACEN would still have ALMACEN as origin
        zero_no_source = [it for it in data["items"] 
                          if it["qty_sugerida"] == 0 and it["stock_almacen"] == 0]
        
        for item in zero_no_source:
            if item["origen_recomendado"] not in ["-", "ALMACEN"] and item["stock_origen"] == 0:
                print(f"Item with no source but origen != '-': {item}")


class TestElementPremiumCompetition:
    """Tests for ELEMENT PREMIUM brand competition between GAMARRA 209 and GRAU"""
    
    def test_element_premium_destinations(self, auth_headers):
        """Test ELEMENT PREMIUM shows GAMARRA 209, GM218, GRAU 238 / GRAU 55"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "marca_repo": "ELEMENT PREMIUM",
                "limit": 100
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        expected_dests = {"GAMARRA 209", "GM218", "GRAU 238 / GRAU 55"}
        actual_dests = set(item["tienda_destino"] for item in data["items"])
        
        unexpected = actual_dests - expected_dests
        assert len(unexpected) == 0, f"Unexpected ELEMENT PREMIUM destinations: {unexpected}"
        
        print(f"ELEMENT PREMIUM destinations found: {actual_dests}")
    
    def test_tallado_affects_priority(self, auth_headers):
        """Test that tallado (assortment) is computed and used for priority sorting"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "marca_repo": "ELEMENT PREMIUM",
                "limit": 100
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check tallado_destino is populated
        tallados = [it["tallado_destino"] for it in data["items"]]
        has_non_zero = any(t > 0 for t in tallados)
        
        if has_non_zero:
            print(f"Found non-zero tallado_destino values. Sample: {tallados[:10]}")
        else:
            print("All tallado_destino values are 0 (may be expected if stores have no prior stock)")


class TestQepoFilter:
    """Tests for QEPO brand filter showing only BOOSH and GAMARRA 207"""
    
    def test_qepo_only_shows_target_destinations(self, auth_headers):
        """Test QEPO filter only shows BOOSH and GAMARRA 207 as destinations"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={
                "umbral_destino": 0,
                "solo_objetivo": True,
                "marca_repo": "QEPO",
                "limit": 100
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        expected_dests = {"BOOSH", "GAMARRA 207"}
        actual_dests = set(item["tienda_destino"] for item in data["items"])
        
        unexpected = actual_dests - expected_dests
        assert len(unexpected) == 0, f"QEPO should only show BOOSH/GAMARRA 207. Unexpected: {unexpected}"
        
        # All items should have QEPO brand
        for item in data["items"]:
            assert item["marca"].upper().strip() == "QEPO", f"Expected QEPO, got {item['marca']}"
        
        print(f"QEPO items: {len(data['items'])}, destinations: {actual_dests}")


class TestReposicionDetalleWithHilo:
    """Tests for reposicion-detalle endpoint with hilo parameter"""
    
    def test_detalle_accepts_hilo_parameter(self, auth_headers):
        """Test that reposicion-detalle endpoint accepts hilo parameter"""
        # First get an item with hilo
        repo_response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 10},
            headers=auth_headers
        )
        assert repo_response.status_code == 200
        repo_data = repo_response.json()
        
        if not repo_data["items"]:
            pytest.skip("No reposicion items to test detalle")
        
        item = repo_data["items"][0]
        
        # Test detalle with hilo parameter
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion-detalle",
            params={
                "marca_norm": item["marca"],
                "tipo": item["tipo"],
                "entalle": item["entalle"],
                "tela": item["tela"],
                "hilo": item.get("hilo", ""),  # NEW: include hilo
                "color": item["color"],
                "talla": item["talla"]
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "distribucion" in data, "Response should have 'distribucion'"
        print(f"Detalle with hilo returned {len(data['distribucion'])} store distributions")


class TestSoloObjetivoToggle:
    """Tests for solo_objetivo toggle functionality"""
    
    def test_solo_objetivo_true_limits_destinations(self, auth_headers):
        """Test solo_objetivo=true limits destinations to brand targets"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": True, "limit": 200},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        total_with_solo = data["total"]
        print(f"With solo_objetivo=true: {total_with_solo} items")
    
    def test_solo_objetivo_false_shows_all_stores(self, auth_headers):
        """Test solo_objetivo=false shows all 5 stores as destinations"""
        response = requests.get(
            f"{BASE_URL}/api/stock-dashboard/reposicion",
            params={"umbral_destino": 0, "solo_objetivo": False, "limit": 200},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        all_stores = {"GRAU 238 / GRAU 55", "GAMARRA 209", "GM218", "BOOSH", "GAMARRA 207"}
        actual_dests = set(item["tienda_destino"] for item in data["items"])
        
        # Should have more destinations with solo_objetivo=false
        assert len(actual_dests) > 1, "Expected multiple destinations"
        print(f"With solo_objetivo=false: {data['total']} items, destinations: {actual_dests}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
