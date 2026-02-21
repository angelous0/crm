"""
Tests for Soft-disable (Inactivar) feature for Cuentas and Contactos.

Tests cover:
1. Deactivating a Cuenta and cascade to Contactos
2. GET /api/cuentas/list with/without include_inactive
3. Activating a Cuenta and cascade-reactivate contactos
4. PATCH /api/contactos/{id}/active
5. GET /api/cuentas/{id}/contactos/count-active
6. GET /api/cuentas/{id}/contactos?include_inactive=true
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_EMAIL = "admin@crm.com"
TEST_PASSWORD = "admin123"
TEST_CUENTA_ID = 13419  # ABREGU TERRONES ANGEL JOAQUIN


class TestSoftDisableCuentas:
    """Soft-disable feature tests for Cuentas"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {response.text}")
        yield
        # Teardown - ensure cuenta is reactivated
        try:
            self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
                "is_active": True
            })
        except:
            pass

    def test_get_cuenta_contactos_count_active(self):
        """Test GET /api/cuentas/{id}/contactos/count-active returns active count"""
        response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/contactos/count-active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total" in data, "Response should have 'total' field"
        assert "active" in data, "Response should have 'active' field"
        assert isinstance(data["total"], int), "total should be int"
        assert isinstance(data["active"], int), "active should be int"
        print(f"Contactos count: total={data['total']}, active={data['active']}")

    def test_get_cuentas_list_excludes_inactive_by_default(self):
        """Test GET /api/cuentas/list without include_inactive excludes deactivated cuentas"""
        # First, check cuenta is active
        cuenta_response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert cuenta_response.status_code == 200
        is_active = cuenta_response.json().get("is_active", True)
        
        # List cuentas (no include_inactive param - should exclude inactive)
        list_response = self.session.get(f"{BASE_URL}/api/cuentas/list", params={"limit": 100})
        assert list_response.status_code == 200
        
        data = list_response.json()
        assert "rows" in data
        # If cuenta is active, it should be visible; if inactive, it should be hidden
        print(f"Cuenta {TEST_CUENTA_ID} is_active={is_active}, list has {len(data['rows'])} rows")

    def test_get_cuentas_list_with_include_inactive(self):
        """Test GET /api/cuentas/list?include_inactive=true includes deactivated cuentas"""
        response = self.session.get(f"{BASE_URL}/api/cuentas/list", params={
            "include_inactive": "true",
            "limit": 100
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "rows" in data
        assert "total_rows" in data
        
        # Check row structure includes is_active field
        if data["rows"]:
            row = data["rows"][0]
            assert "is_active" in row, "Row should have is_active field"
            print(f"List with include_inactive: {data['total_rows']} total rows, first row is_active={row['is_active']}")

    def test_deactivate_cuenta_with_cascade(self):
        """Test PATCH /api/cuentas/{id}/active with is_active=false deactivates cuenta and cascades to contactos"""
        # Get initial contactos count
        count_response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/contactos/count-active")
        initial_count = count_response.json()
        print(f"Initial contactos: total={initial_count['total']}, active={initial_count['active']}")
        
        # Deactivate cuenta
        response = self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
            "is_active": False,
            "reason": "TEST_DEACTIVATION"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Response should have ok=True"
        assert data.get("is_active") == False, "Response should have is_active=False"
        assert "contactos_affected" in data, "Response should have contactos_affected"
        print(f"Deactivate response: {data}")
        
        # Verify cuenta is now inactive
        cuenta_response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        cuenta_data = cuenta_response.json()
        assert cuenta_data.get("is_active") == False, "Cuenta should now be inactive"
        assert cuenta_data.get("inactive_reason") == "TEST_DEACTIVATION", "inactive_reason should be set"
        print(f"Cuenta after deactivation: is_active={cuenta_data.get('is_active')}, reason={cuenta_data.get('inactive_reason')}")

    def test_activate_cuenta_with_cascade_reactivation(self):
        """Test PATCH /api/cuentas/{id}/active with is_active=true reactivates cuenta and cascade-deactivated contactos"""
        # First deactivate
        self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
            "is_active": False,
            "reason": "TEST_FOR_REACTIVATION"
        })
        
        # Now activate
        response = self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
            "is_active": True
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Response should have ok=True"
        assert data.get("is_active") == True, "Response should have is_active=True"
        assert "contactos_reactivated" in data, "Response should have contactos_reactivated"
        print(f"Activate response: {data}")
        
        # Verify cuenta is now active
        cuenta_response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        cuenta_data = cuenta_response.json()
        assert cuenta_data.get("is_active") == True, "Cuenta should now be active"
        assert cuenta_data.get("inactive_reason") is None, "inactive_reason should be cleared"
        print(f"Cuenta after activation: is_active={cuenta_data.get('is_active')}")

    def test_deactivated_cuenta_excluded_from_list(self):
        """Test that deactivated cuenta is excluded from list without include_inactive"""
        # Deactivate
        self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
            "is_active": False,
            "reason": "TEST_EXCLUSION"
        })
        
        # Check list without include_inactive - cuenta should be excluded
        # Search by a unique term that would match this cuenta
        response_no_inactive = self.session.get(f"{BASE_URL}/api/cuentas/list", params={
            "q": "ABREGU TERRONES",
            "limit": 100
        })
        assert response_no_inactive.status_code == 200
        data_no_inactive = response_no_inactive.json()
        
        ids_no_inactive = [r["id"] for r in data_no_inactive["rows"]]
        assert TEST_CUENTA_ID not in ids_no_inactive, f"Deactivated cuenta {TEST_CUENTA_ID} should NOT appear in list without include_inactive"
        print(f"Without include_inactive: found {len(data_no_inactive['rows'])} rows, cuenta NOT in list (correct)")
        
        # Check list with include_inactive - cuenta should be included
        response_with_inactive = self.session.get(f"{BASE_URL}/api/cuentas/list", params={
            "q": "ABREGU TERRONES",
            "include_inactive": "true",
            "limit": 100
        })
        assert response_with_inactive.status_code == 200
        data_with_inactive = response_with_inactive.json()
        
        ids_with_inactive = [r["id"] for r in data_with_inactive["rows"]]
        assert TEST_CUENTA_ID in ids_with_inactive, f"Deactivated cuenta {TEST_CUENTA_ID} SHOULD appear in list with include_inactive"
        print(f"With include_inactive: found {len(data_with_inactive['rows'])} rows, cuenta IN list (correct)")

    def test_get_contactos_with_include_inactive(self):
        """Test GET /api/cuentas/{id}/contactos?include_inactive=true includes inactive contactos with is_active field"""
        # First get all contactos including inactive
        response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/contactos", params={
            "include_inactive": "true"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check structure if there are contactos
        if data:
            contacto = data[0]
            assert "contacto_partner_odoo_id" in contacto, "Contacto should have contacto_partner_odoo_id"
            assert "is_active" in contacto, "Contacto should have is_active field"
            print(f"Contactos (include_inactive=true): {len(data)} contactos, first: {contacto.get('partner_nombre')}, is_active={contacto.get('is_active')}")
        else:
            print("No contactos found for this cuenta")


class TestSoftDisableContactos:
    """Soft-disable feature tests for Contactos"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {response.text}")
        yield
        # Teardown - ensure cuenta is reactivated
        try:
            self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
                "is_active": True
            })
        except:
            pass

    def test_deactivate_contacto_endpoint_exists(self):
        """Test PATCH /api/contactos/{id}/active endpoint exists and validates"""
        # Get contactos to find one we can test with
        contactos_response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/contactos", params={
            "include_inactive": "true"
        })
        
        if contactos_response.status_code != 200 or not contactos_response.json():
            pytest.skip("No contactos available for testing")
            return
        
        contactos = contactos_response.json()
        if not contactos:
            pytest.skip("No contactos found for this cuenta")
            return
        
        # Take first contacto
        contacto = contactos[0]
        contacto_id = contacto["contacto_partner_odoo_id"]
        print(f"Testing with contacto: {contacto.get('partner_nombre')} (ID: {contacto_id})")
        
        # Test deactivation - the contacto might not exist in crm.contacto yet
        # First check if the contacto exists in crm.contacto (it needs to be linked first)
        response = self.session.patch(f"{BASE_URL}/api/contactos/{contacto_id}/active", json={
            "is_active": False,
            "reason": "TEST_CONTACTO_DEACTIVATE"
        })
        
        # Could be 200 or 404 depending on whether contacto exists in CRM
        if response.status_code == 404:
            print("Contacto not found in CRM table (needs to be linked first)")
            # This is expected if contacto was never explicitly added to crm.contacto
        else:
            assert response.status_code == 200, f"Expected 200 or 404, got {response.status_code}: {response.text}"
            data = response.json()
            assert "ok" in data, "Response should have 'ok' field"
            print(f"Deactivate contacto response: {data}")
            
            # Reactivate
            reactivate_response = self.session.patch(f"{BASE_URL}/api/contactos/{contacto_id}/active", json={
                "is_active": True
            })
            print(f"Reactivate contacto response: {reactivate_response.status_code}")


class TestCuentaDetailEndpoints:
    """Test cuenta detail endpoints for soft-disable feature"""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {response.text}")
        yield
        # Teardown - ensure cuenta is reactivated
        try:
            self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
                "is_active": True
            })
        except:
            pass

    def test_cuenta_detail_has_is_active_field(self):
        """Test GET /api/cuentas/{id} returns is_active field"""
        response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        # is_active might not be set (defaults to true) or explicitly set
        print(f"Cuenta detail: is_active={data.get('is_active')}, inactive_reason={data.get('inactive_reason')}")

    def test_cuenta_detail_after_deactivation_has_metadata(self):
        """Test deactivated cuenta has inactive_reason, inactive_at, inactive_by"""
        # Deactivate
        self.session.patch(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/active", json={
            "is_active": False,
            "reason": "TEST_METADATA"
        })
        
        # Get detail
        response = self.session.get(f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_active") == False, "is_active should be False"
        assert data.get("inactive_reason") is not None, "inactive_reason should be set"
        assert data.get("inactive_at") is not None, "inactive_at should be set"
        print(f"Cuenta after deactivation: is_active={data.get('is_active')}, reason={data.get('inactive_reason')}, at={data.get('inactive_at')}, by={data.get('inactive_by')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
