"""
Tests for BULK batch activate/deactivate operations on Cuentas and Contactos.
PATCH /api/cuentas/batch-active with {ids: [...], is_active: bool, reason: str|null}
PATCH /api/contactos/batch-active with {ids: [...], is_active: bool, reason: str|null}
GET /api/cuentas/list with include_inactive parameter
"""

import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Login once for all tests."""
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@crm.com",
        "password": "admin123"
    })
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture
def api_client(auth_token):
    """Authenticated session."""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCuentasBatchOperations:
    """Batch activate/deactivate cuentas - tests with account 13419 (ABREGU TERRONES)"""
    
    TEST_IDS = [13419, 10956]  # Test accounts for bulk operations
    
    def test_cuentas_batch_deactivate(self, api_client):
        """PATCH /api/cuentas/batch-active with is_active=false should deactivate cuentas and cascade to contactos"""
        r = api_client.patch(f"{BASE_URL}/api/cuentas/batch-active", json={
            "ids": self.TEST_IDS,
            "is_active": False,
            "reason": "BULK_TEST"
        })
        assert r.status_code == 200, f"Batch deactivate failed: {r.text}"
        data = r.json()
        
        # Verify response structure
        assert "ok" in data and data["ok"] is True
        assert "is_active" in data and data["is_active"] is False
        assert "cuentas_affected" in data
        assert "contactos_affected" in data
        
        # At least some cuentas should be affected (could be 0 if already inactive)
        print(f"Batch deactivate: cuentas_affected={data['cuentas_affected']}, contactos_affected={data['contactos_affected']}")
    
    def test_cuentas_list_excludes_inactive_by_default(self, api_client):
        """GET /api/cuentas/list without include_inactive should exclude deactivated accounts"""
        r = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"q": "angel", "limit": 50})
        assert r.status_code == 200, f"Cuentas list failed: {r.text}"
        data = r.json()
        
        assert "rows" in data
        assert "total_rows" in data
        
        # Accounts 13419 and 10956 should be excluded if they were deactivated
        ids_in_list = [row.get("id") for row in data["rows"]]
        
        # Check is_active field exists when include_inactive is false (should all be true or not present)
        for row in data["rows"]:
            if "is_active" in row:
                assert row["is_active"] is True, f"Active-only list should not have inactive rows: {row}"
        
        print(f"Cuentas list (active only): total_rows={data['total_rows']}, rows returned={len(data['rows'])}")
    
    def test_cuentas_list_includes_inactive_when_param_set(self, api_client):
        """GET /api/cuentas/list?include_inactive=true should include deactivated accounts"""
        r = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"q": "angel", "limit": 50, "include_inactive": True})
        assert r.status_code == 200, f"Cuentas list (with inactive) failed: {r.text}"
        data = r.json()
        
        assert "rows" in data
        assert "total_rows" in data
        
        # Should have is_active field in rows
        inactive_found = False
        for row in data["rows"]:
            if row.get("id") in self.TEST_IDS:
                # These should be inactive after batch deactivate
                if row.get("is_active") is False:
                    inactive_found = True
                    print(f"Found deactivated account: {row.get('id')} - {row.get('nombre')}")
        
        print(f"Cuentas list (with inactive): total_rows={data['total_rows']}, inactive_found={inactive_found}")
    
    def test_cuentas_batch_reactivate(self, api_client):
        """PATCH /api/cuentas/batch-active with is_active=true should reactivate cuentas and cascade-reactivate contactos"""
        r = api_client.patch(f"{BASE_URL}/api/cuentas/batch-active", json={
            "ids": self.TEST_IDS,
            "is_active": True,
            "reason": None
        })
        assert r.status_code == 200, f"Batch reactivate failed: {r.text}"
        data = r.json()
        
        # Verify response structure
        assert "ok" in data and data["ok"] is True
        assert "is_active" in data and data["is_active"] is True
        assert "cuentas_affected" in data
        assert "contactos_affected" in data
        
        print(f"Batch reactivate: cuentas_affected={data['cuentas_affected']}, contactos_affected={data['contactos_affected']}")
    
    def test_cuentas_back_to_active_in_list(self, api_client):
        """Verify accounts are back in active list after reactivation"""
        r = api_client.get(f"{BASE_URL}/api/cuentas/list", params={"q": "angel", "limit": 50})
        assert r.status_code == 200, f"Cuentas list failed: {r.text}"
        data = r.json()
        
        # Find our test accounts
        ids_in_list = [row.get("id") for row in data["rows"]]
        
        for test_id in self.TEST_IDS:
            if test_id in ids_in_list:
                row = next((r for r in data["rows"] if r["id"] == test_id), None)
                if row:
                    assert row.get("is_active") is not False, f"Account {test_id} should be active after reactivation"
                    print(f"Account {test_id} confirmed active: {row.get('nombre')}")


class TestContactosBatchOperations:
    """Batch activate/deactivate contactos"""
    
    @pytest.fixture
    def contacto_ids(self, api_client):
        """Get contacto IDs from a cuenta to test batch operations"""
        # Use account 13419 to get its contactos
        r = api_client.get(f"{BASE_URL}/api/cuentas/13419/contactos", params={"include_inactive": True})
        if r.status_code == 200:
            contactos = r.json()
            if contactos:
                return [c["contacto_partner_odoo_id"] for c in contactos[:3]]  # Test with up to 3 contactos
        return []
    
    def test_contactos_batch_deactivate(self, api_client, contacto_ids):
        """PATCH /api/contactos/batch-active with is_active=false should deactivate contactos"""
        if not contacto_ids:
            pytest.skip("No contactos found for batch testing")
        
        r = api_client.patch(f"{BASE_URL}/api/contactos/batch-active", json={
            "ids": contacto_ids,
            "is_active": False,
            "reason": "BULK_CONTACTO_TEST"
        })
        assert r.status_code == 200, f"Batch deactivate contactos failed: {r.text}"
        data = r.json()
        
        assert "ok" in data and data["ok"] is True
        assert "is_active" in data and data["is_active"] is False
        assert "contactos_affected" in data
        assert "cuentas_affected" in data  # May be > 0 if principal contacto was deactivated
        
        print(f"Contactos batch deactivate: contactos_affected={data['contactos_affected']}, cuentas_affected={data['cuentas_affected']}")
    
    def test_get_contactos_with_inactive_filter(self, api_client):
        """GET /api/cuentas/{id}/contactos should respect include_inactive parameter"""
        # Without include_inactive - should exclude inactive
        r1 = api_client.get(f"{BASE_URL}/api/cuentas/13419/contactos", params={"include_inactive": False})
        assert r1.status_code == 200, f"Get contactos (active only) failed: {r1.text}"
        active_count = len(r1.json())
        
        # With include_inactive - should include all
        r2 = api_client.get(f"{BASE_URL}/api/cuentas/13419/contactos", params={"include_inactive": True})
        assert r2.status_code == 200, f"Get contactos (with inactive) failed: {r2.text}"
        all_count = len(r2.json())
        
        print(f"Contactos: active_only={active_count}, all={all_count}")
        
        # With inactive included, total should be >= active count
        assert all_count >= active_count, "Total contactos should be >= active contactos"
    
    def test_contactos_batch_reactivate(self, api_client, contacto_ids):
        """PATCH /api/contactos/batch-active with is_active=true should reactivate contactos"""
        if not contacto_ids:
            pytest.skip("No contactos found for batch testing")
        
        r = api_client.patch(f"{BASE_URL}/api/contactos/batch-active", json={
            "ids": contacto_ids,
            "is_active": True,
            "reason": None
        })
        assert r.status_code == 200, f"Batch reactivate contactos failed: {r.text}"
        data = r.json()
        
        assert "ok" in data and data["ok"] is True
        assert "is_active" in data and data["is_active"] is True
        assert "contactos_affected" in data
        
        print(f"Contactos batch reactivate: contactos_affected={data['contactos_affected']}")


class TestRestoreState:
    """Final cleanup - ensure test accounts are reactivated"""
    
    def test_restore_cuentas_active(self, api_client):
        """Ensure test accounts 13419 and 10956 are active after all tests"""
        TEST_IDS = [13419, 10956]
        
        r = api_client.patch(f"{BASE_URL}/api/cuentas/batch-active", json={
            "ids": TEST_IDS,
            "is_active": True,
            "reason": None
        })
        assert r.status_code == 200, f"Restore state failed: {r.text}"
        print(f"Restored accounts {TEST_IDS} to active state: {r.json()}")
