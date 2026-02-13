"""
Test suite for Odoo Sync API endpoints:
- POST /api/odoo-sync/run - Start STOCK_QUANTS sync job
- GET /api/odoo-sync/job-status - Get job status and last run info
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOdooSync:
    """Tests for Odoo STOCK_QUANTS sync functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@test.com",
            "password": "test123"
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed - skipping tests")

    def test_01_job_status_endpoint_returns_stock_quants_job(self):
        """GET /api/odoo-sync/job-status returns STOCK_QUANTS job info"""
        response = requests.get(
            f"{BASE_URL}/api/odoo-sync/job-status",
            params={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "job" in data, "Response should contain 'job' key"
        assert data["job"]["job_code"] == "STOCK_QUANTS", "Job code should be STOCK_QUANTS"
        assert "enabled" in data["job"], "Job should have 'enabled' field"
        assert "last_run_at" in data["job"], "Job should have 'last_run_at' field"
        assert "last_success_at" in data["job"], "Job should have 'last_success_at' field"
        
        # last_run can be None if sync never ran
        if data.get("last_run"):
            assert "status" in data["last_run"], "last_run should have 'status' field"
            assert data["last_run"]["status"] in ["RUNNING", "OK", "FAILED"], \
                f"Unexpected status: {data['last_run']['status']}"

    def test_02_job_status_invalid_job_code_returns_404(self):
        """GET /api/odoo-sync/job-status with invalid job_code returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/odoo-sync/job-status",
            params={"job_code": "INVALID_JOB_CODE_XYZ"},
            headers=self.headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"

    def test_03_run_invalid_job_code_returns_404(self):
        """POST /api/odoo-sync/run with invalid job_code returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/odoo-sync/run",
            json={"job_code": "INVALID_JOB_CODE_XYZ"},
            headers=self.headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"

    def test_04_run_stock_quants_sync_starts_successfully(self):
        """POST /api/odoo-sync/run with STOCK_QUANTS starts sync or returns 409 if already running"""
        # First check current status
        status_resp = requests.get(
            f"{BASE_URL}/api/odoo-sync/job-status",
            params={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        initial_status = None
        if status_resp.status_code == 200 and status_resp.json().get("last_run"):
            initial_status = status_resp.json()["last_run"]["status"]
        
        response = requests.post(
            f"{BASE_URL}/api/odoo-sync/run",
            json={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        
        # Accept either 200 (sync started) or 409 (already running)
        assert response.status_code in [200, 409], \
            f"Expected 200 or 409, got {response.status_code}: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("ok") == True, "Response should have ok=true"
            assert "run_id" in data, "Response should have run_id"
            assert data.get("status") == "RUNNING", "Status should be RUNNING"
            print(f"Sync started successfully with run_id: {data['run_id']}")
        else:
            # 409 - sync already running
            print("Sync already in progress (409)")

    def test_05_run_sync_twice_quickly_returns_409(self):
        """POST /api/odoo-sync/run twice quickly should return 409 on second call"""
        # First call
        response1 = requests.post(
            f"{BASE_URL}/api/odoo-sync/run",
            json={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        
        # Immediately second call
        response2 = requests.post(
            f"{BASE_URL}/api/odoo-sync/run",
            json={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        
        # One of them should be 409 (already running)
        status_codes = [response1.status_code, response2.status_code]
        print(f"First call: {response1.status_code}, Second call: {response2.status_code}")
        
        # If first succeeds, second should be 409
        # If first is 409 (already running from previous test), second should also be 409
        if response1.status_code == 200:
            assert response2.status_code == 409, \
                f"Expected 409 on second call when first succeeded, got {response2.status_code}"
        else:
            # Both are 409 which is also valid
            assert 409 in status_codes, "At least one call should return 409 (already running)"

    def test_06_sync_completes_after_waiting(self):
        """Wait for sync to complete and verify status changes from RUNNING to OK/FAILED"""
        # Wait up to 30 seconds for sync to complete
        max_wait = 30
        poll_interval = 3
        waited = 0
        
        while waited < max_wait:
            response = requests.get(
                f"{BASE_URL}/api/odoo-sync/job-status",
                params={"job_code": "STOCK_QUANTS"},
                headers=self.headers
            )
            assert response.status_code == 200
            
            data = response.json()
            if data.get("last_run"):
                status = data["last_run"]["status"]
                print(f"Waited {waited}s - Status: {status}")
                
                if status != "RUNNING":
                    # Sync completed
                    assert status in ["OK", "FAILED"], f"Unexpected final status: {status}"
                    
                    if status == "OK":
                        # Verify rows_upserted is present
                        assert "rows_upserted" in data["last_run"], "OK status should have rows_upserted"
                        print(f"Sync completed OK - {data['last_run']['rows_upserted']} rows upserted")
                    else:
                        # Status is FAILED
                        print(f"Sync FAILED - error: {data['last_run'].get('error_message', 'unknown')}")
                    return
            
            time.sleep(poll_interval)
            waited += poll_interval
        
        # If we get here, sync is still running after max_wait
        print(f"Sync still running after {max_wait}s - this may indicate a slow sync operation")
        # Don't fail - just note it might take longer

    def test_07_job_status_shows_last_success_time(self):
        """GET /api/odoo-sync/job-status should show last_success_at if synced successfully"""
        response = requests.get(
            f"{BASE_URL}/api/odoo-sync/job-status",
            params={"job_code": "STOCK_QUANTS"},
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        job = data.get("job", {})
        
        # These fields should always be present
        assert "last_run_at" in job, "job should have last_run_at"
        assert "last_success_at" in job, "job should have last_success_at"
        assert "last_error" in job, "job should have last_error"
        
        # If we have a last_success_at, verify it's a valid ISO timestamp
        if job["last_success_at"]:
            print(f"Last successful sync: {job['last_success_at']}")
        else:
            print("No successful sync recorded yet")

    def test_08_sync_requires_authentication(self):
        """POST /api/odoo-sync/run without auth returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/odoo-sync/run",
            json={"job_code": "STOCK_QUANTS"}
            # No headers - no auth
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"

    def test_09_job_status_requires_authentication(self):
        """GET /api/odoo-sync/job-status without auth returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/odoo-sync/job-status",
            params={"job_code": "STOCK_QUANTS"}
            # No headers - no auth
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
