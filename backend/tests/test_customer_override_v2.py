"""
Backend tests for Customer Override feature - Iteration 28
Tests soft-delete, active flag, updated_at/updated_by, original_partner_name

Key features tested:
- POST /api/orders/{order_id}/override-customer returns active, updated_at, updated_by
- GET /api/orders/{order_id}/override-customer returns ONLY active=true overrides
- DELETE soft-deletes (sets active=false, returns deactivated=true NOT deleted=true)
- After soft-delete, GET returns null
- After soft-delete, views show has_override=false
- POST after soft-delete re-activates existing record
- GET /api/comercial/orders returns original_partner_name
- GET /api/comercial/lines returns original_partner_name
- GET /api/cuentas/list still works (regression)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for authenticated requests"""
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@crm.com",
        "password": "admin123"
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token = login_resp.json().get("token")
    assert token, "No token in login response"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get auth headers for authenticated requests"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def sample_order_id(auth_headers):
    """Get a real order ID from comercial/orders endpoint"""
    resp = requests.get(f"{BASE_URL}/api/comercial/orders?limit=1", headers=auth_headers)
    assert resp.status_code == 200, f"Failed to get orders: {resp.text}"
    rows = resp.json().get("rows", [])
    if rows:
        return rows[0]["order_id"]
    pytest.skip("No orders available to test override")


@pytest.fixture(scope="module")
def sample_customer_id(auth_headers):
    """Get a real customer ID from search-customers endpoint"""
    resp = requests.get(f"{BASE_URL}/api/orders/search-customers?q=cli&limit=1", headers=auth_headers)
    assert resp.status_code == 200, f"Failed to search customers: {resp.text}"
    items = resp.json().get("items", [])
    if items:
        return items[0]["id"]
    pytest.skip("No customers found for override test")


class TestAuthLogin:
    """Test authentication flow"""
    
    def test_login_success(self):
        """Login with valid credentials"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@crm.com",
            "password": "admin123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "admin@crm.com"
        print("✓ Login successful")


class TestCreateOverrideReturnsActiveFields:
    """Test POST override returns active, updated_at, updated_by"""
    
    def test_create_override_returns_active_flag(self, auth_headers, sample_order_id, sample_customer_id):
        """POST /api/orders/{order_id}/override-customer returns active=true"""
        # First soft-delete any existing override
        requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        
        resp = requests.post(
            f"{BASE_URL}/api/orders/{sample_order_id}/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id, "reason": "TEST_active_flag"}
        )
        assert resp.status_code == 200, f"Create override failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True
        assert "override" in data
        
        override = data["override"]
        # Verify active field
        assert "active" in override, "Missing 'active' field in POST response"
        assert override["active"] == True, f"Expected active=True, got {override['active']}"
        
        # Verify updated_at field
        assert "updated_at" in override, "Missing 'updated_at' field in POST response"
        assert override["updated_at"] is not None
        
        # Verify updated_by field
        assert "updated_by" in override, "Missing 'updated_by' field in POST response"
        assert override["updated_by"] is not None
        
        print(f"✓ POST returns active={override['active']}, updated_at={override['updated_at'][:19]}, updated_by={override['updated_by']}")


class TestGetOverrideReturnsOnlyActive:
    """Test GET override returns ONLY active=true records"""
    
    def test_get_active_override_returns_active_flag(self, auth_headers, sample_order_id):
        """GET /api/orders/{order_id}/override-customer returns active=true"""
        resp = requests.get(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        override = data.get("override")
        if override:
            assert "active" in override, "Missing 'active' field in GET response"
            assert override["active"] == True, "GET should only return active=True overrides"
            print(f"✓ GET returns active override with active={override['active']}")
        else:
            print("⚠ No active override exists for this order")


class TestSoftDeleteOverride:
    """Test DELETE performs soft-delete (sets active=false)"""
    
    def test_delete_soft_deletes_returns_deactivated(self, auth_headers, sample_order_id, sample_customer_id):
        """DELETE /api/orders/{order_id}/override-customer sets active=false, returns deactivated=true"""
        # First ensure override exists
        requests.post(
            f"{BASE_URL}/api/orders/{sample_order_id}/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id, "reason": "TEST_soft_delete"}
        )
        
        # Soft-delete
        resp = requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200, f"Soft-delete failed: {resp.text}"
        data = resp.json()
        
        assert data.get("ok") == True
        assert data.get("deactivated") == True, f"Expected deactivated=True, got {data}"
        # Should NOT have 'deleted' key (that was the old behavior)
        assert "deleted" not in data or data.get("deleted") != True, "Should return deactivated, not deleted"
        print(f"✓ DELETE returns deactivated=true (soft-delete)")
    
    def test_get_after_soft_delete_returns_null(self, auth_headers, sample_order_id):
        """After soft-delete, GET returns override=null"""
        resp = requests.get(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert data.get("override") is None, f"Expected override=null after soft-delete, got {data.get('override')}"
        print("✓ GET returns null after soft-delete (only active=true returned)")


class TestViewsFilterActiveOverrides:
    """Test that views correctly filter AND ov.active=true"""
    
    def test_comercial_orders_has_override_false_after_soft_delete(self, auth_headers, sample_order_id):
        """After soft-delete, comercial/orders shows has_override=false"""
        resp = requests.get(f"{BASE_URL}/api/comercial/orders?limit=100", headers=auth_headers)
        assert resp.status_code == 200
        
        rows = resp.json().get("rows", [])
        matching = [r for r in rows if r["order_id"] == sample_order_id]
        
        if matching:
            order = matching[0]
            assert order["has_override"] == False, f"Expected has_override=False after soft-delete, got {order['has_override']}"
            assert order.get("original_partner_name") is None, "original_partner_name should be null when no active override"
            print(f"✓ comercial/orders shows has_override=false for order {sample_order_id}")
        else:
            print(f"⚠ Order {sample_order_id} not in first 100 results")


class TestReactivationAfterSoftDelete:
    """Test POST after soft-delete re-activates existing record"""
    
    def test_post_after_soft_delete_reactivates(self, auth_headers, sample_order_id, sample_customer_id):
        """POST after soft-delete should re-activate existing row (same ID)"""
        # Ensure soft-deleted state
        requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        
        # Re-create (should re-activate)
        resp = requests.post(
            f"{BASE_URL}/api/orders/{sample_order_id}/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id, "reason": "TEST_reactivation"}
        )
        assert resp.status_code == 200, f"Reactivation failed: {resp.text}"
        data = resp.json()
        
        assert data.get("ok") == True
        override = data["override"]
        assert override["active"] == True, "Re-activated override should have active=True"
        assert override["reason"] == "TEST_reactivation", "Reason should be updated on reactivation"
        print(f"✓ POST after soft-delete re-activates with active=True, id={override['id'][:8]}")


class TestOriginalPartnerNameInViews:
    """Test original_partner_name appears in comercial views"""
    
    def test_comercial_orders_includes_original_partner_name(self, auth_headers, sample_order_id, sample_customer_id):
        """GET /api/comercial/orders returns original_partner_name for overridden orders"""
        # Ensure override exists
        requests.post(
            f"{BASE_URL}/api/orders/{sample_order_id}/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id, "reason": "TEST_original_name"}
        )
        
        resp = requests.get(f"{BASE_URL}/api/comercial/orders?limit=100", headers=auth_headers)
        assert resp.status_code == 200
        
        rows = resp.json().get("rows", [])
        matching = [r for r in rows if r["order_id"] == sample_order_id]
        
        if matching:
            order = matching[0]
            assert "original_partner_name" in order, "Missing original_partner_name field"
            assert order["has_override"] == True
            assert order["original_partner_name"] is not None, "original_partner_name should be set for overridden orders"
            print(f"✓ comercial/orders returns original_partner_name='{order['original_partner_name']}' for overridden order")
        else:
            print(f"⚠ Order {sample_order_id} not in first 100 results")
    
    def test_comercial_lines_includes_original_partner_name(self, auth_headers, sample_order_id, sample_customer_id):
        """GET /api/comercial/lines returns original_partner_name for overridden orders"""
        resp = requests.get(f"{BASE_URL}/api/comercial/lines?limit=100", headers=auth_headers)
        assert resp.status_code == 200
        
        rows = resp.json().get("rows", [])
        matching = [r for r in rows if r["order_id"] == sample_order_id]
        
        if matching:
            line = matching[0]
            assert "original_partner_name" in line, "Missing original_partner_name field in lines"
            if line["has_override"]:
                assert line["original_partner_name"] is not None
                print(f"✓ comercial/lines returns original_partner_name='{line['original_partner_name']}'")
        else:
            print(f"⚠ Order {sample_order_id} not in first 100 line results")


class TestCuentasListRegression:
    """Test cuentas/list still works (regression)"""
    
    def test_cuentas_list_returns_rows(self, auth_headers):
        """GET /api/cuentas/list returns rows with expected fields"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?limit=3", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "rows" in data
        assert "total_rows" in data
        assert data["total_rows"] > 0, "Expected some cuentas in the system"
        
        if data["rows"]:
            first = data["rows"][0]
            assert "id" in first
            assert "nombre" in first
            assert "is_active" in first
            print(f"✓ cuentas/list works: {len(data['rows'])} rows, total={data['total_rows']}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_override(self, auth_headers, sample_order_id):
        """Cleanup: soft-delete test override"""
        resp = requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        # May return 404 if already deleted, that's OK
        if resp.status_code == 200:
            print(f"✓ Test override cleaned up for order {sample_order_id}")
        else:
            print(f"⚠ Cleanup returned {resp.status_code} (may already be deleted)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
