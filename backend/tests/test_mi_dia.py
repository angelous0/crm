"""
Test Mi Día (My Day) Page Endpoints
Tests for /api/my-day, /api/tareas, /api/interacciones, /api/interaction-templates, /api/users
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials - uses 'usuario' field not 'email'
TEST_USUARIO = "eduard"
TEST_PASSWORD = "cardenas"

# Test account UUID for creating test data
TEST_CUENTA_ID = "bfbb0f46-d34c-4c1e-b763-1676bd927de7"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token using usuario field"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "usuario": TEST_USUARIO,
        "password": TEST_PASSWORD
    })
    print(f"Login response: {response.status_code} - {response.text[:300]}")
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed - {response.status_code}: {response.text}")


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestMyDayEndpoint:
    """Tests for GET /api/my-day endpoint"""

    def test_my_day_returns_correct_structure(self, authenticated_client):
        """GET /api/my-day should return date, tasks_overdue, tasks_today, next_actions_today, risk_accounts, stats"""
        response = authenticated_client.get(f"{BASE_URL}/api/my-day")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify all required fields are present
        required_fields = ["date", "tasks_overdue", "tasks_today", "next_actions_today", "risk_accounts", "stats"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify date format (ISO format)
        assert isinstance(data["date"], str), "date should be a string"
        
        # Verify arrays
        assert isinstance(data["tasks_overdue"], list), "tasks_overdue should be a list"
        assert isinstance(data["tasks_today"], list), "tasks_today should be a list"
        assert isinstance(data["next_actions_today"], list), "next_actions_today should be a list"
        assert isinstance(data["risk_accounts"], list), "risk_accounts should be a list"
        
        # Verify stats object has expected fields
        stats = data["stats"]
        assert isinstance(stats, dict), "stats should be a dict"
        stats_fields = ["tareas_abiertas", "tareas_vencidas", "llamadas_hoy", "whatsapps_hoy"]
        for field in stats_fields:
            assert field in stats, f"Missing stats field: {field}"
        
        print(f"GET /api/my-day: {response.status_code}")
        print(f"  date: {data['date']}")
        print(f"  tasks_overdue: {len(data['tasks_overdue'])} items")
        print(f"  tasks_today: {len(data['tasks_today'])} items")
        print(f"  next_actions_today: {len(data['next_actions_today'])} items")
        print(f"  risk_accounts: {len(data['risk_accounts'])} items")
        print(f"  stats: {stats}")

    def test_my_day_without_auth_returns_401(self):
        """GET /api/my-day without auth should return 401"""
        no_auth_client = requests.Session()
        no_auth_client.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_client.get(f"{BASE_URL}/api/my-day")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"GET /api/my-day without auth: {response.status_code}")


class TestTareasEndpoint:
    """Tests for /api/tareas CRUD endpoints"""

    def test_create_tarea_success(self, authenticated_client):
        """POST /api/tareas should create a task and return it with correct fields"""
        # Due date is tomorrow
        due_date = (datetime.now() + timedelta(days=1)).isoformat()
        
        payload = {
            "cuenta_id": TEST_CUENTA_ID,
            "title": "TEST_Mi_Dia_Tarea",
            "due_at": due_date,
            "priority": 2,
            "note": "Test note for Mi Dia testing"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/tareas", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields in response
        required_fields = ["id", "cuenta_id", "title", "due_at", "priority", "note", "status", "created_at"]
        for field in required_fields:
            assert field in data, f"Missing field in response: {field}"
        
        # Verify field values
        assert data["title"] == "TEST_Mi_Dia_Tarea", f"Title mismatch: {data['title']}"
        assert data["cuenta_id"] == TEST_CUENTA_ID, f"cuenta_id mismatch: {data['cuenta_id']}"
        assert data["priority"] == 2, f"Priority mismatch: {data['priority']}"
        assert data["status"] == "OPEN", f"Status should be OPEN, got: {data['status']}"
        
        # Store the task ID for cleanup
        pytest.created_tarea_id = data["id"]
        
        print(f"POST /api/tareas: {response.status_code}")
        print(f"  Created task: {data['id']}, title: {data['title']}, status: {data['status']}")

    def test_mark_tarea_done(self, authenticated_client):
        """POST /api/tareas/{id}/done should mark task as DONE"""
        # First create a new task to mark as done
        due_date = (datetime.now() + timedelta(days=1)).isoformat()
        
        create_response = authenticated_client.post(f"{BASE_URL}/api/tareas", json={
            "cuenta_id": TEST_CUENTA_ID,
            "title": "TEST_Tarea_To_Complete",
            "due_at": due_date,
            "priority": 1
        })
        
        assert create_response.status_code == 200, f"Failed to create task: {create_response.text}"
        task_id = create_response.json()["id"]
        
        # Now mark it as done
        response = authenticated_client.post(f"{BASE_URL}/api/tareas/{task_id}/done")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "DONE", f"Status should be DONE, got: {data['status']}"
        assert data["id"] == task_id, f"ID mismatch"
        assert data["done_at"] is not None, "done_at should be set"
        
        print(f"POST /api/tareas/{task_id}/done: {response.status_code}")
        print(f"  Task marked done: status={data['status']}, done_at={data['done_at']}")

    def test_list_tareas(self, authenticated_client):
        """GET /api/tareas should return list of tasks"""
        response = authenticated_client.get(f"{BASE_URL}/api/tareas")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # API returns 'items' not 'rows'
        items_key = "items" if "items" in data else "rows"
        assert items_key in data, "Response should have 'items' or 'rows' field"
        assert "total" in data, "Response should have 'total' field"
        assert "page" in data, "Response should have 'page' field"
        
        print(f"GET /api/tareas: {response.status_code}")
        print(f"  Total tasks: {data['total']}, Page: {data['page']}, Items returned: {len(data[items_key])}")


class TestInteraccionesEndpoint:
    """Tests for /api/interacciones CRUD endpoints"""

    def test_create_interaccion_success(self, authenticated_client):
        """POST /api/interacciones should create an interaction and return it"""
        payload = {
            "cuenta_id": TEST_CUENTA_ID,
            "channel": "WHATSAPP",
            "outcome": "CONTESTO",
            "note": "TEST_Mi_Dia_Interaccion"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/interacciones", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields in response
        required_fields = ["id", "cuenta_id", "channel", "outcome", "note", "happened_at", "created_at"]
        for field in required_fields:
            assert field in data, f"Missing field in response: {field}"
        
        # Verify field values
        assert data["cuenta_id"] == TEST_CUENTA_ID, f"cuenta_id mismatch: {data['cuenta_id']}"
        assert data["channel"] == "WHATSAPP", f"Channel mismatch: {data['channel']}"
        assert data["outcome"] == "CONTESTO", f"Outcome mismatch: {data['outcome']}"
        assert data["note"] == "TEST_Mi_Dia_Interaccion", f"Note mismatch: {data['note']}"
        
        print(f"POST /api/interacciones: {response.status_code}")
        print(f"  Created interaction: {data['id']}, channel: {data['channel']}, outcome: {data['outcome']}")

    def test_list_interacciones(self, authenticated_client):
        """GET /api/interacciones should return list of interactions"""
        response = authenticated_client.get(f"{BASE_URL}/api/interacciones")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data, "Response should have 'rows' field"
        assert "total" in data, "Response should have 'total' field"
        
        print(f"GET /api/interacciones: {response.status_code}")
        print(f"  Total interactions: {data['total']}, Rows returned: {len(data['rows'])}")


class TestInteractionTemplates:
    """Tests for /api/interaction-templates endpoint"""

    def test_get_interaction_templates(self, authenticated_client):
        """GET /api/interaction-templates should return seeded templates"""
        response = authenticated_client.get(f"{BASE_URL}/api/interaction-templates")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check that templates exist
        if len(data) > 0:
            # Verify template structure
            template = data[0]
            template_fields = ["id", "name", "channel"]
            for field in template_fields:
                assert field in template, f"Template missing field: {field}"
        
        # Check for expected seeded templates
        template_names = [t["name"] for t in data]
        expected_templates = ["Envie catalogo", "Llame - no respondio", "Pidio reposicion"]
        
        found_templates = [t for t in expected_templates if t in template_names]
        print(f"GET /api/interaction-templates: {response.status_code}")
        print(f"  Total templates: {len(data)}")
        print(f"  Expected templates found: {found_templates}")


class TestUsersEndpoint:
    """Tests for /api/users endpoint"""

    def test_get_users_list(self, authenticated_client):
        """GET /api/users should return user list"""
        response = authenticated_client.get(f"{BASE_URL}/api/users")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            # Verify user structure
            user = data[0]
            user_fields = ["id", "usuario", "nombre"]
            for field in user_fields:
                assert field in user, f"User missing field: {field}"
        
        print(f"GET /api/users: {response.status_code}")
        print(f"  Total users: {len(data)}")
        if len(data) > 0:
            user_names = [u["nombre"] for u in data[:5]]
            print(f"  Sample users: {user_names}")


class TestNextActionEndpoint:
    """Tests for PATCH /api/cuentas/{id}/next-action endpoint"""

    def test_set_next_action(self, authenticated_client):
        """PATCH /api/cuentas/{id}/next-action should set next action"""
        next_date = (datetime.now() + timedelta(days=2)).isoformat()
        
        payload = {
            "next_action_type": "LLAMAR",
            "next_action_at": next_date,
            "next_action_note": "TEST_Next_Action_Note",
            "create_task": False
        }
        
        response = authenticated_client.patch(
            f"{BASE_URL}/api/cuentas/{TEST_CUENTA_ID}/next-action",
            json=payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got: {data}"
        
        print(f"PATCH /api/cuentas/{TEST_CUENTA_ID}/next-action: {response.status_code}")
        print(f"  Response: {data}")
