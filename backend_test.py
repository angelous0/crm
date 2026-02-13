import requests
import sys
import json
from datetime import datetime

class CRMAPITester:
    def __init__(self):
        self.base_url = "https://crm-b2b-pos.preview.emergentagent.com/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} {test_name}: {details}")

    def test_health_check(self):
        """Test health endpoint - no auth required"""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'ok':
                    self.log_result("Health Check", True, f"Status OK - Database: {data.get('database', 'unknown')}")
                    return True
                else:
                    self.log_result("Health Check", False, f"Health status not OK: {data}")
                    return False
            else:
                self.log_result("Health Check", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Health Check", False, f"Connection error: {str(e)}")
            return False

    def test_login(self, email="admin@crm.com", password="admin123"):
        """Test login with test user"""
        try:
            payload = {"email": email, "password": password}
            response = requests.post(f"{self.base_url}/auth/login", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'token' in data and 'user' in data:
                    self.token = data['token']
                    user_email = data['user'].get('email', 'unknown')
                    self.log_result("Login", True, f"Successfully logged in as {user_email}")
                    return True
                else:
                    self.log_result("Login", False, f"Missing token/user in response: {data}")
                    return False
            else:
                error_detail = response.json().get('detail', response.text) if response.headers.get('content-type', '').startswith('application/json') else response.text
                self.log_result("Login", False, f"HTTP {response.status_code}: {error_detail}")
                return False
        except Exception as e:
            self.log_result("Login", False, f"Request error: {str(e)}")
            return False

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        if not self.token:
            self.log_result("Auth Me", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.base_url}/auth/me", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'email' in data:
                    self.log_result("Auth Me", True, f"User info retrieved: {data.get('email')}")
                    return True
                else:
                    self.log_result("Auth Me", False, f"Invalid user data: {data}")
                    return False
            else:
                self.log_result("Auth Me", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Auth Me", False, f"Request error: {str(e)}")
            return False

    def test_stats(self):
        """Test /stats endpoint"""
        if not self.token:
            self.log_result("Stats", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.base_url}/stats", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                expected_keys = ['cuentas', 'contactos', 'tareas_pendientes', 'interacciones', 'productos_aprobados']
                if all(key in data for key in expected_keys):
                    stats_summary = f"Cuentas: {data['cuentas']}, Contactos: {data['contactos']}, Tareas: {data['tareas_pendientes']}"
                    self.log_result("Stats", True, stats_summary)
                    return True
                else:
                    self.log_result("Stats", False, f"Missing expected keys in stats: {data}")
                    return False
            else:
                self.log_result("Stats", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Stats", False, f"Request error: {str(e)}")
            return False

    def test_productos_elegibles(self):
        """Test /productos/elegibles endpoint"""
        if not self.token:
            self.log_result("Productos Elegibles", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/productos/elegibles", headers=headers, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_products = data['total']
                    items_count = len(data['items'])
                    self.log_result("Productos Elegibles", True, f"Retrieved {items_count} items (total: {total_products})")
                    return True
                else:
                    self.log_result("Productos Elegibles", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Productos Elegibles", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Productos Elegibles", False, f"Request error: {str(e)}")
            return False

    def test_cuentas(self):
        """Test /cuentas endpoint"""
        if not self.token:
            self.log_result("Cuentas", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/cuentas", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_cuentas = data['total']
                    items_count = len(data['items'])
                    self.log_result("Cuentas", True, f"Retrieved {items_count} accounts (total: {total_cuentas})")
                    return True
                else:
                    self.log_result("Cuentas", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Cuentas", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Cuentas", False, f"Request error: {str(e)}")
            return False

    def test_tareas(self):
        """Test /tareas endpoint"""
        if not self.token:
            self.log_result("Tareas", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/tareas", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_tareas = data['total']
                    items_count = len(data['items'])
                    self.log_result("Tareas", True, f"Retrieved {items_count} tasks (total: {total_tareas})")
                    return True
                else:
                    self.log_result("Tareas", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Tareas", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Tareas", False, f"Request error: {str(e)}")
            return False

    def test_ventas(self):
        """Test /ventas endpoint"""
        if not self.token:
            self.log_result("Ventas", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/ventas", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_ventas = data['total']
                    items_count = len(data['items'])
                    self.log_result("Ventas", True, f"Retrieved {items_count} sales (total: {total_ventas})")
                    return True
                else:
                    self.log_result("Ventas", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Ventas", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Ventas", False, f"Request error: {str(e)}")
            return False

    def test_bootstrap(self):
        """Test /bootstrap/inicializar endpoint"""
        if not self.token:
            self.log_result("Bootstrap", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.post(f"{self.base_url}/bootstrap/inicializar", headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if 'ok' in data and data['ok']:
                    cuentas = data.get('cuentas_creadas', 0)
                    contactos = data.get('contactos_creados', 0)
                    procesados = data.get('total_procesados', 0)
                    self.log_result("Bootstrap", True, f"Initialized: {cuentas} accounts, {contactos} contacts ({procesados} processed)")
                    return True
                else:
                    self.log_result("Bootstrap", False, f"Bootstrap not successful: {data}")
                    return False
            else:
                self.log_result("Bootstrap", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Bootstrap", False, f"Request error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print("🚀 Starting CRM API Test Suite")
        print("=" * 50)
        
        # Test order matters - health first, then auth, then protected endpoints
        tests = [
            self.test_health_check,
            self.test_login,
            self.test_auth_me,
            self.test_stats,
            self.test_productos_elegibles,
            self.test_cuentas,
            self.test_tareas,
            self.test_ventas,
            self.test_bootstrap
        ]
        
        for test in tests:
            test()
            print()  # Add spacing between tests
        
        # Summary
        print("=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} test(s) failed")
            print("\nFailed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            return 1

def main():
    tester = CRMAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())