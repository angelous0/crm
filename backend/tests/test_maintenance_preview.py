"""
Test maintenance endpoint: GET /api/maintenance/inactivate-no-sales/preview
- Tests preview functionality for bulk inactivation of accounts/contacts without sales
- DOES NOT test POST endpoint to avoid destructive operations on real data
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMaintenancePreview:
    """Test the inactivation preview endpoint (read-only operations)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for protected endpoints"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@crm.com",
            "password": "admin123"
        })
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")

    def test_preview_scope_ambos_returns_correct_structure(self):
        """Test 1: Preview with scope=ambos returns correct counts and structure"""
        response = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "ambos"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "cuentas_candidates" in data, "Missing cuentas_candidates field"
        assert "contactos_candidates" in data, "Missing contactos_candidates field"
        assert "sample_cuentas" in data, "Missing sample_cuentas field"
        assert "sample_contactos" in data, "Missing sample_contactos field"
        assert "scope" in data, "Missing scope field"
        assert data["scope"] == "ambos", f"Expected scope 'ambos', got {data['scope']}"
        
        # Verify counts are integers
        assert isinstance(data["cuentas_candidates"], int), "cuentas_candidates should be an integer"
        assert isinstance(data["contactos_candidates"], int), "contactos_candidates should be an integer"
        
        # Verify sample arrays
        assert isinstance(data["sample_cuentas"], list), "sample_cuentas should be a list"
        assert isinstance(data["sample_contactos"], list), "sample_contactos should be a list"
        
        # Based on context: ~2238 cuentas have 0 sales all-time, all contactos are linked
        assert data["cuentas_candidates"] >= 2000, f"Expected >= 2000 cuentas candidates, got {data['cuentas_candidates']}"
        assert data["contactos_candidates"] == 0, f"Expected 0 contactos (all linked), got {data['contactos_candidates']}"
        
        print(f"PASS: Preview scope=ambos - Cuentas: {data['cuentas_candidates']}, Contactos: {data['contactos_candidates']}")

    def test_preview_with_months_12_returns_more_candidates(self):
        """Test 2: Preview with months=12 returns more candidates than all-time (more accounts without recent sales)"""
        # Get all-time counts first
        resp_all = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "ambos"
        })
        assert resp_all.status_code == 200
        all_time_data = resp_all.json()
        
        # Get last 12 months counts
        resp_12m = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "ambos",
            "months": 12
        })
        assert resp_12m.status_code == 200
        months_12_data = resp_12m.json()
        
        # Verify months parameter is returned
        assert months_12_data.get("months") == 12, f"Expected months=12, got {months_12_data.get('months')}"
        
        # More cuentas should be candidates when looking at last 12 months vs all-time
        # (accounts with older sales but no recent sales will be included)
        all_time_cuentas = all_time_data["cuentas_candidates"]
        months_12_cuentas = months_12_data["cuentas_candidates"]
        
        assert months_12_cuentas >= all_time_cuentas, \
            f"Expected months=12 ({months_12_cuentas}) >= all-time ({all_time_cuentas}) cuentas candidates"
        
        print(f"PASS: months=12 cuentas ({months_12_cuentas}) >= all-time cuentas ({all_time_cuentas})")

    def test_preview_scope_cuentas_only_returns_cuentas(self):
        """Test 3: Preview with scope=cuentas only returns cuentas data"""
        response = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "cuentas"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        # Should have cuentas data
        assert data["cuentas_candidates"] > 0, "Expected positive cuentas count"
        assert len(data["sample_cuentas"]) > 0, "Expected sample cuentas"
        
        # Should NOT have contactos data (scope is cuentas only)
        # Note: API may return 0 or omit contactos - check implementation
        assert data.get("contactos_candidates", 0) == 0, "contactos_candidates should be 0 for scope=cuentas"
        assert len(data.get("sample_contactos", [])) == 0, "sample_contactos should be empty for scope=cuentas"
        
        print(f"PASS: scope=cuentas - Cuentas: {data['cuentas_candidates']}, Contactos: {data.get('contactos_candidates', 0)}")

    def test_preview_scope_contactos_returns_zero(self):
        """Test 4: Preview with scope=contactos returns 0 contactos (all are linked in this DB)"""
        response = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "contactos"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        # Based on context: all contactos are linked (cuenta_partner_odoo_id NOT NULL)
        # So 0 contactos should be candidates for inactivation
        assert data["contactos_candidates"] == 0, \
            f"Expected 0 contactos (all linked), got {data['contactos_candidates']}"
        
        # Should NOT have cuentas data
        assert data.get("cuentas_candidates", 0) == 0, "cuentas_candidates should be 0 for scope=contactos"
        
        print(f"PASS: scope=contactos - Contactos: {data['contactos_candidates']} (all linked)")

    def test_preview_sample_cuentas_structure(self):
        """Test 5: Verify sample_cuentas has correct fields (id, nombre, vat, ciudad)"""
        response = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "cuentas"
        })
        assert response.status_code == 200
        
        data = response.json()
        
        if data["sample_cuentas"]:
            sample = data["sample_cuentas"][0]
            
            # Verify required fields
            assert "id" in sample, "sample_cuentas missing 'id' field"
            assert "nombre" in sample, "sample_cuentas missing 'nombre' field"
            assert "vat" in sample or sample.get("vat") == "", "sample_cuentas missing 'vat' field"
            assert "ciudad" in sample or sample.get("ciudad") == "", "sample_cuentas missing 'ciudad' field"
            
            # Verify sample limit (max 20)
            assert len(data["sample_cuentas"]) <= 20, "sample_cuentas should be limited to 20"
            
            print(f"PASS: sample_cuentas structure validated, {len(data['sample_cuentas'])} samples returned")
        else:
            pytest.skip("No sample cuentas returned")

    def test_preview_invalid_scope_returns_400(self):
        """Test 6: Invalid scope parameter returns 400"""
        response = self.session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "invalid_scope"
        })
        assert response.status_code == 400, f"Expected 400 for invalid scope, got {response.status_code}"
        
        print("PASS: Invalid scope returns 400")

    def test_preview_unauthenticated_returns_401(self):
        """Test 7: Unauthenticated request returns 401"""
        # Create session without auth
        unauth_session = requests.Session()
        response = unauth_session.get(f"{BASE_URL}/api/maintenance/inactivate-no-sales/preview", params={
            "scope": "ambos"
        })
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated, got {response.status_code}"
        
        print("PASS: Unauthenticated request returns 401/403")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
