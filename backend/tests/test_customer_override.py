"""
Backend tests for Customer Override feature - Sales Order Customer Reassignment
Tests the ability to reassign POS orders to a different customer account
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


class TestSearchCustomers:
    """Test customer search for override modal"""
    
    def test_search_customers_returns_results(self, auth_headers):
        """GET /api/orders/search-customers returns accounts list"""
        resp = requests.get(f"{BASE_URL}/api/orders/search-customers?q=cli&limit=20", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        print(f"Found {len(data['items'])} customers matching 'cli'")
        if data["items"]:
            first = data["items"][0]
            assert "id" in first
            assert "nombre" in first
            print(f"First customer: {first['nombre']} (id={first['id']})")
    
    def test_search_customers_short_query(self, auth_headers):
        """GET /api/orders/search-customers with <2 chars returns empty"""
        resp = requests.get(f"{BASE_URL}/api/orders/search-customers?q=c", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("items") == []


class TestComercialEndpoints:
    """Test comercial endpoints still work with has_override field"""
    
    def test_comercial_orders_with_has_override(self, auth_headers):
        """GET /api/comercial/orders returns has_override field"""
        resp = requests.get(f"{BASE_URL}/api/comercial/orders?limit=5", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "rows" in data
        assert "metrics" in data
        print(f"Comercial orders: {len(data['rows'])} rows, metrics: {data['metrics']}")
        if data["rows"]:
            first = data["rows"][0]
            assert "has_override" in first, "has_override field missing from comercial/orders"
            assert "owner_partner_id" in first
            assert "owner_partner_name" in first
            print(f"First order has_override={first['has_override']}, owner={first['owner_partner_name']}")
    
    def test_comercial_lines_with_has_override(self, auth_headers):
        """GET /api/comercial/lines returns has_override field"""
        resp = requests.get(f"{BASE_URL}/api/comercial/lines?limit=5", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "rows" in data
        if data["rows"]:
            first = data["rows"][0]
            assert "has_override" in first, "has_override field missing from comercial/lines"
            print(f"First line has_override={first['has_override']}")


class TestCuentasList:
    """Test cuentas list endpoint"""
    
    def test_cuentas_list(self, auth_headers):
        """GET /api/cuentas/list returns rows"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?limit=3", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "rows" in data
        assert "total_rows" in data
        print(f"Cuentas list: {len(data['rows'])} rows, total={data['total_rows']}")
        if data["rows"]:
            first = data["rows"][0]
            assert "id" in first
            assert "nombre" in first


class TestOverrideCRUD:
    """Test override CRUD operations"""
    
    def test_create_override(self, auth_headers, sample_order_id, sample_customer_id):
        """POST /api/orders/{order_id}/override-customer creates override"""
        resp = requests.post(
            f"{BASE_URL}/api/orders/{sample_order_id}/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id, "reason": "TEST: Automated testing"}
        )
        assert resp.status_code == 200, f"Create override failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True
        assert "override" in data
        override = data["override"]
        assert override["order_id"] == sample_order_id
        assert override["new_owner_partner_id"] == sample_customer_id
        print(f"Created override: {override['original_partner_name']} -> {override['new_owner_partner_name']}")
    
    def test_get_existing_override(self, auth_headers, sample_order_id):
        """GET /api/orders/{order_id}/override-customer returns existing override"""
        resp = requests.get(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "override" in data
        override = data["override"]
        if override:
            assert "order_id" in override
            assert "new_owner_partner_id" in override
            assert "original_partner_name" in override
            assert "new_owner_partner_name" in override
            print(f"Override found: {override['original_partner_name']} -> {override['new_owner_partner_name']}")
    
    def test_override_shows_in_comercial_orders(self, auth_headers, sample_order_id):
        """After override, comercial/orders shows order under new owner"""
        # First get the override details
        override_resp = requests.get(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        override = override_resp.json().get("override")
        
        if override:
            new_owner = override["new_owner_partner_name"]
            # Check if we can find the order with the new owner filter
            resp = requests.get(
                f"{BASE_URL}/api/comercial/orders?limit=50&cliente={new_owner[:10]}", 
                headers=auth_headers
            )
            assert resp.status_code == 200
            data = resp.json()
            # The order should appear in results with has_override=True
            matching = [r for r in data["rows"] if r["order_id"] == sample_order_id]
            if matching:
                assert matching[0]["has_override"] == True
                print(f"Order {sample_order_id} correctly shows has_override=True")
    
    def test_delete_override(self, auth_headers, sample_order_id):
        """DELETE /api/orders/{order_id}/override-customer removes override"""
        resp = requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200, f"Delete override failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True
        assert data.get("deleted") == True
        print(f"Override deleted for order {sample_order_id}")
    
    def test_get_after_delete(self, auth_headers, sample_order_id):
        """GET /api/orders/{order_id}/override-customer returns null after delete"""
        resp = requests.get(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("override") is None
        print(f"Override correctly removed for order {sample_order_id}")
    
    def test_delete_nonexistent_override(self, auth_headers, sample_order_id):
        """DELETE /api/orders/{order_id}/override-customer returns 404 when no override"""
        resp = requests.delete(f"{BASE_URL}/api/orders/{sample_order_id}/override-customer", headers=auth_headers)
        assert resp.status_code == 404


class TestOverrideNotFound:
    """Test error handling for override operations"""
    
    def test_create_override_invalid_order(self, auth_headers, sample_customer_id):
        """POST with invalid order_id returns 404"""
        resp = requests.post(
            f"{BASE_URL}/api/orders/999999999/override-customer",
            headers=auth_headers,
            json={"new_owner_partner_id": sample_customer_id}
        )
        assert resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
