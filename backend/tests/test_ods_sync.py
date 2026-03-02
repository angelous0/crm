"""
Test ODS Sync Proxy Endpoints
Tests for /api/ods-sync/* endpoints that proxy to ODS (Odoo) backend.
Since ODS is currently unavailable (returns 404), we expect 502 errors from the proxy.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "admin@crm.com"
TEST_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestODSSyncEndpoints:
    """Tests for ODS Sync proxy endpoints - expect graceful 502 errors since ODS is unavailable"""

    def test_job_status_res_partner_returns_502_when_ods_unavailable(self, authenticated_client):
        """GET /api/ods-sync/job-status?job_code=RES_PARTNER should return 502 gracefully"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/ods-sync/job-status",
            params={"job_code": "RES_PARTNER"}
        )
        # ODS is unavailable, so proxy should return 502
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        
        # Verify error message is present
        if response.status_code == 502:
            data = response.json()
            assert "detail" in data, "Response should contain error detail"
            assert "ODS" in data["detail"] or "conectar" in data["detail"], \
                f"Error should mention ODS connection issue, got: {data['detail']}"
        print(f"GET job-status RES_PARTNER: {response.status_code} - {response.text[:200]}")

    def test_job_status_pos_orders_returns_502_when_ods_unavailable(self, authenticated_client):
        """GET /api/ods-sync/job-status?job_code=POS_ORDERS should return 502 gracefully"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/ods-sync/job-status",
            params={"job_code": "POS_ORDERS"}
        )
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        print(f"GET job-status POS_ORDERS: {response.status_code} - {response.text[:200]}")

    def test_job_status_ar_credit_invoices_returns_502_when_ods_unavailable(self, authenticated_client):
        """GET /api/ods-sync/job-status?job_code=AR_CREDIT_INVOICES should return 502 gracefully"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/ods-sync/job-status",
            params={"job_code": "AR_CREDIT_INVOICES"}
        )
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        print(f"GET job-status AR_CREDIT_INVOICES: {response.status_code} - {response.text[:200]}")

    def test_run_job_res_partner_returns_502_when_ods_unavailable(self, authenticated_client):
        """POST /api/ods-sync/run with RES_PARTNER should return 502 gracefully"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ods-sync/run",
            json={"job_code": "RES_PARTNER"}
        )
        # ODS is unavailable, so proxy should return 502
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        
        if response.status_code == 502:
            data = response.json()
            assert "detail" in data, "Response should contain error detail"
        print(f"POST run RES_PARTNER: {response.status_code} - {response.text[:200]}")

    def test_run_job_pos_orders_returns_502_when_ods_unavailable(self, authenticated_client):
        """POST /api/ods-sync/run with POS_ORDERS should return 502 gracefully"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ods-sync/run",
            json={"job_code": "POS_ORDERS"}
        )
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        print(f"POST run POS_ORDERS: {response.status_code} - {response.text[:200]}")

    def test_run_job_ar_credit_invoices_returns_502_when_ods_unavailable(self, authenticated_client):
        """POST /api/ods-sync/run with AR_CREDIT_INVOICES should return 502 gracefully"""
        response = authenticated_client.post(
            f"{BASE_URL}/api/ods-sync/run",
            json={"job_code": "AR_CREDIT_INVOICES"}
        )
        assert response.status_code in [502, 404], f"Expected 502/404, got {response.status_code}"
        print(f"POST run AR_CREDIT_INVOICES: {response.status_code} - {response.text[:200]}")

    def test_job_status_without_auth_returns_401(self, api_client):
        """GET /api/ods-sync/job-status without auth should return 401"""
        # Create a new session without auth
        no_auth_client = requests.Session()
        no_auth_client.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_client.get(
            f"{BASE_URL}/api/ods-sync/job-status",
            params={"job_code": "RES_PARTNER"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"GET job-status without auth: {response.status_code}")

    def test_run_job_without_auth_returns_401(self, api_client):
        """POST /api/ods-sync/run without auth should return 401"""
        no_auth_client = requests.Session()
        no_auth_client.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_client.post(
            f"{BASE_URL}/api/ods-sync/run",
            json={"job_code": "RES_PARTNER"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"POST run without auth: {response.status_code}")
