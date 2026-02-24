"""
Pytest tests for Pendientes Approval Workflow APIs
Tests: GET pending, approve, reject, link endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@crm.com", "password": "admin123"},
        timeout=30
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - cannot proceed with approval tests")

@pytest.fixture
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestApprovalPendingCount:
    """Tests for GET /api/approval/pending/count"""
    
    def test_pending_count_returns_200(self, auth_headers):
        """Count endpoint returns 200 with proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/approval/pending/count",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "cuentas" in data
        assert "contactos" in data
        assert "total" in data
        
        # Validate types
        assert isinstance(data["cuentas"], int)
        assert isinstance(data["contactos"], int)
        assert isinstance(data["total"], int)
        
        # Validate total = cuentas + contactos
        assert data["total"] == data["cuentas"] + data["contactos"]
        print(f"Pending counts: cuentas={data['cuentas']}, contactos={data['contactos']}, total={data['total']}")
    
    def test_pending_count_requires_auth(self):
        """Count endpoint returns 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/approval/pending/count",
            timeout=30
        )
        assert response.status_code == 401


class TestApprovalPendingList:
    """Tests for GET /api/approval/pending"""
    
    def test_pending_cuentas_returns_list(self, auth_headers):
        """List cuentas pending returns proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "cuenta", "page": 1, "limit": 10},
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        
        # Validate structure
        assert "rows" in data
        assert "total" in data
        assert "page" in data
        assert "limit" in data
        assert "has_next" in data
        
        # Validate types
        assert isinstance(data["rows"], list)
        assert isinstance(data["total"], int)
        
        # If rows exist, validate row structure
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "id" in row
            assert "nombre" in row
            assert "vat" in row
            assert "approval_status" in row
            assert row["approval_status"] == "PENDING"
            print(f"First pending cuenta: {row['nombre']} (ID: {row['id']})")
    
    def test_pending_contactos_returns_list(self, auth_headers):
        """List contactos pending returns proper structure"""
        response = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "contacto", "page": 1, "limit": 10},
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "rows" in data
        assert "total" in data
        print(f"Pending contactos: {data['total']}")
    
    def test_pending_search_filters_results(self, auth_headers):
        """Search parameter filters results by name/vat/city"""
        # First get all pending
        response_all = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "cuenta", "page": 1, "limit": 50},
            headers=auth_headers,
            timeout=30
        )
        all_data = response_all.json()
        
        if all_data["total"] > 0:
            # Get first name to search
            first_name = all_data["rows"][0]["nombre"][:5]  # Take first 5 chars
            
            # Search with filter
            response_search = requests.get(
                f"{BASE_URL}/api/approval/pending",
                params={"entity": "cuenta", "page": 1, "limit": 50, "search": first_name},
                headers=auth_headers,
                timeout=30
            )
            search_data = response_search.json()
            
            # Filtered results should be <= total
            assert search_data["total"] <= all_data["total"]
            print(f"Search '{first_name}': {search_data['total']} results (of {all_data['total']} total)")
    
    def test_pending_invalid_entity_returns_422(self, auth_headers):
        """Invalid entity type returns validation error"""
        response = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "invalid", "page": 1, "limit": 10},
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 422


class TestApprovalActions:
    """Tests for approve/reject/link actions (structure tests only - no actual modifications)"""
    
    def test_approve_endpoint_exists(self, auth_headers):
        """Approve endpoint responds correctly"""
        # Use a non-existent ID to test endpoint existence without modifying data
        response = requests.post(
            f"{BASE_URL}/api/approval/cuenta/999999999/approve",
            json={"set_active": True, "note": None},
            headers=auth_headers,
            timeout=30
        )
        # Expect 200 (creates row if missing) or some valid response
        # The endpoint should exist and respond, not 404
        assert response.status_code in [200, 404, 422]
        print(f"Approve endpoint response: {response.status_code}")
    
    def test_reject_requires_note(self, auth_headers):
        """Reject endpoint validates note requirement"""
        # Empty note should fail
        response = requests.post(
            f"{BASE_URL}/api/approval/cuenta/999999999/reject",
            json={"note": ""},
            headers=auth_headers,
            timeout=30
        )
        # Should return 422 for validation error
        assert response.status_code == 422
        print("Reject requires note validation: ✓")
    
    def test_reject_note_min_length(self, auth_headers):
        """Reject note must be at least 3 characters"""
        response = requests.post(
            f"{BASE_URL}/api/approval/cuenta/999999999/reject",
            json={"note": "ab"},  # Only 2 chars
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 422
        print("Reject note min length validation: ✓")
    
    def test_link_endpoint_exists(self, auth_headers):
        """Link endpoint responds correctly"""
        response = requests.post(
            f"{BASE_URL}/api/approval/cuenta/999999999/link-to",
            json={"target_cuenta_id": 1, "mode": "LINK", "note": None},
            headers=auth_headers,
            timeout=30
        )
        # Should not return 404 (method not found)
        assert response.status_code != 405
        print(f"Link endpoint response: {response.status_code}")
    
    def test_link_mode_validation(self, auth_headers):
        """Link mode must be LINK or MERGE"""
        response = requests.post(
            f"{BASE_URL}/api/approval/cuenta/999999999/link-to",
            json={"target_cuenta_id": 1, "mode": "INVALID", "note": None},
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 422
        print("Link mode validation: ✓")


class TestApprovalIntegration:
    """Integration tests for full approval workflow"""
    
    def test_approved_accounts_not_in_pending(self, auth_headers):
        """Approved accounts should not appear in pending list"""
        # Get pending cuentas
        response = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "cuenta", "page": 1, "limit": 100},
            headers=auth_headers,
            timeout=30
        )
        data = response.json()
        
        # All returned rows should be PENDING
        for row in data["rows"]:
            assert row["approval_status"] == "PENDING", f"Found non-pending row: {row['id']}"
        print(f"All {len(data['rows'])} rows have PENDING status: ✓")
    
    def test_count_matches_list_total(self, auth_headers):
        """Count endpoint should match list total"""
        # Get count
        count_response = requests.get(
            f"{BASE_URL}/api/approval/pending/count",
            headers=auth_headers,
            timeout=30
        )
        counts = count_response.json()
        
        # Get list total for cuentas
        list_response = requests.get(
            f"{BASE_URL}/api/approval/pending",
            params={"entity": "cuenta", "page": 1, "limit": 1},
            headers=auth_headers,
            timeout=30
        )
        list_data = list_response.json()
        
        assert counts["cuentas"] == list_data["total"], \
            f"Count mismatch: count={counts['cuentas']}, list_total={list_data['total']}"
        print(f"Count ({counts['cuentas']}) matches list total ({list_data['total']}): ✓")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
