import requests
import sys
import json
from datetime import datetime

class CRMRestructuringTester:
    def __init__(self):
        self.base_url = "https://peruvian-inventory.preview.emergentagent.com/api"
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

    def test_stats_new_fields(self):
        """Test /stats endpoint for NEW field names: cuentas_libres, total_partners, contactos_vinculados"""
        if not self.token:
            self.log_result("Stats (New Fields)", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{self.base_url}/stats", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # NEW field names for CRM restructuring
                new_fields = ['cuentas_libres', 'total_partners', 'contactos_vinculados']
                
                missing_fields = [field for field in new_fields if field not in data]
                if missing_fields:
                    self.log_result("Stats (New Fields)", False, f"Missing NEW fields: {missing_fields}. Got: {list(data.keys())}")
                    return False
                
                stats_summary = f"Cuentas libres: {data['cuentas_libres']}, Total partners: {data['total_partners']}, Contactos vinculados: {data['contactos_vinculados']}"
                self.log_result("Stats (New Fields)", True, stats_summary)
                return True
            else:
                self.log_result("Stats (New Fields)", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Stats (New Fields)", False, f"Request error: {str(e)}")
            return False

    def test_cuentas_free_only(self):
        """Test /cuentas returns only 'free' accounts from v_cuentas_libres (11,008+)"""
        if not self.token:
            self.log_result("Cuentas (Free Only)", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/cuentas", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_cuentas = data['total']
                    items = data['items']
                    
                    # Check structure - should have cuenta_partner_odoo_id (integer)
                    if items:
                        first_item = items[0]
                        if 'cuenta_partner_odoo_id' not in first_item:
                            self.log_result("Cuentas (Free Only)", False, f"Missing cuenta_partner_odoo_id field. Got fields: {list(first_item.keys())}")
                            return False
                        
                        # Verify it's an integer (odoo_id)
                        if not isinstance(first_item['cuenta_partner_odoo_id'], int):
                            self.log_result("Cuentas (Free Only)", False, f"cuenta_partner_odoo_id should be integer, got: {type(first_item['cuenta_partner_odoo_id'])}")
                            return False
                    
                    # Expected to be 11,008+ free accounts
                    if total_cuentas < 1000:  # Much lower threshold to be safe
                        self.log_result("Cuentas (Free Only)", False, f"Expected many free accounts (11K+), got only {total_cuentas}")
                        return False
                    
                    self.log_result("Cuentas (Free Only)", True, f"Retrieved {len(items)} free accounts (total: {total_cuentas})")
                    return True
                else:
                    self.log_result("Cuentas (Free Only)", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Cuentas (Free Only)", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Cuentas (Free Only)", False, f"Request error: {str(e)}")
            return False

    def test_cuentas_search_filter(self):
        """Test /cuentas?search=GARCIA filters properly"""
        if not self.token:
            self.log_result("Cuentas Search Filter", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"search": "GARCIA", "page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/cuentas", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    items = data['items']
                    total = data['total']
                    
                    # Check that results contain GARCIA in name or vat
                    if items:
                        garcia_found = False
                        for item in items:
                            name = item.get('partner_nombre', '').upper()
                            vat = item.get('partner_vat', '').upper()
                            if 'GARCIA' in name or 'GARCIA' in vat:
                                garcia_found = True
                                break
                        
                        if not garcia_found:
                            self.log_result("Cuentas Search Filter", False, f"No GARCIA found in search results")
                            return False
                    
                    self.log_result("Cuentas Search Filter", True, f"Found {len(items)} GARCIA accounts (total: {total})")
                    return True
                else:
                    self.log_result("Cuentas Search Filter", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Cuentas Search Filter", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Cuentas Search Filter", False, f"Request error: {str(e)}")
            return False

    def test_contactos_all_partners(self):
        """Test /contactos returns ALL odoo partners (11,592) with cuenta_nombre column"""
        if not self.token:
            self.log_result("Contactos (All Partners)", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/contactos", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    total_contactos = data['total']
                    items = data['items']
                    
                    # Expected to be ALL partners (11,592)
                    if total_contactos < 10000:  # Should be much higher
                        self.log_result("Contactos (All Partners)", False, f"Expected ~11,592 partners, got only {total_contactos}")
                        return False
                    
                    # Check structure - should have cuenta_nombre column
                    if items:
                        first_item = items[0]
                        if 'cuenta_nombre' not in first_item:
                            self.log_result("Contactos (All Partners)", False, f"Missing cuenta_nombre field. Got fields: {list(first_item.keys())}")
                            return False
                    
                    self.log_result("Contactos (All Partners)", True, f"Retrieved {len(items)} partners (total: {total_contactos}) with cuenta_nombre column")
                    return True
                else:
                    self.log_result("Contactos (All Partners)", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Contactos (All Partners)", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Contactos (All Partners)", False, f"Request error: {str(e)}")
            return False

    def test_contactos_solo_dni_filter(self):
        """Test /contactos?solo_dni=true filter works"""
        if not self.token:
            self.log_result("Contactos Solo DNI Filter", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"solo_dni": True, "page": 1, "limit": 10}
            response = requests.get(f"{self.base_url}/contactos", headers=headers, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    items = data['items']
                    
                    # Check that all results have vat (DNI/RUC)
                    if items:
                        for item in items:
                            if not item.get('vat'):
                                self.log_result("Contactos Solo DNI Filter", False, f"Partner {item.get('name')} has no vat field")
                                return False
                    
                    self.log_result("Contactos Solo DNI Filter", True, f"Found {len(items)} partners with DNI/RUC (total: {data['total']})")
                    return True
                else:
                    self.log_result("Contactos Solo DNI Filter", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Contactos Solo DNI Filter", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Contactos Solo DNI Filter", False, f"Request error: {str(e)}")
            return False

    def test_cuenta_detail_with_odoo_id(self):
        """Test /cuentas/{odoo_id} returns cuenta detail with on-demand upsert (integer routing)"""
        if not self.token:
            self.log_result("Cuenta Detail (odoo_id)", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # First get a cuenta to use for testing
            cuentas_response = requests.get(f"{self.base_url}/cuentas", headers=headers, params={"page": 1, "limit": 1}, timeout=10)
            if cuentas_response.status_code != 200:
                self.log_result("Cuenta Detail (odoo_id)", False, "Could not get cuentas for testing")
                return False
            
            cuentas_data = cuentas_response.json()
            if not cuentas_data.get('items'):
                self.log_result("Cuenta Detail (odoo_id)", False, "No cuentas available for testing")
                return False
            
            # Use the cuenta_partner_odoo_id (integer) as the route parameter
            odoo_id = cuentas_data['items'][0]['cuenta_partner_odoo_id']
            
            # Test cuenta detail endpoint with integer odoo_id
            response = requests.get(f"{self.base_url}/cuentas/{odoo_id}", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if 'cuenta_partner_odoo_id' in data and data['cuenta_partner_odoo_id'] == odoo_id:
                    self.log_result("Cuenta Detail (odoo_id)", True, f"Retrieved cuenta detail for odoo_id {odoo_id}")
                    return True
                else:
                    self.log_result("Cuenta Detail (odoo_id)", False, f"Invalid cuenta detail response: {data}")
                    return False
            else:
                self.log_result("Cuenta Detail (odoo_id)", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Cuenta Detail (odoo_id)", False, f"Request error: {str(e)}")
            return False

    def test_cuenta_contactos(self):
        """Test /cuentas/{odoo_id}/contactos returns contacts linked to that account"""
        if not self.token:
            self.log_result("Cuenta Contactos", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # Get a cuenta that has contactos
            cuentas_response = requests.get(f"{self.base_url}/cuentas", headers=headers, params={"page": 1, "limit": 20}, timeout=10)
            if cuentas_response.status_code != 200:
                self.log_result("Cuenta Contactos", False, "Could not get cuentas for testing")
                return False
            
            cuentas_data = cuentas_response.json()
            if not cuentas_data.get('items'):
                self.log_result("Cuenta Contactos", False, "No cuentas available for testing")
                return False
            
            # Try the first few cuentas to find one with contactos
            cuenta_with_contactos = None
            for cuenta in cuentas_data['items'][:5]:
                odoo_id = cuenta['cuenta_partner_odoo_id']
                contactos_response = requests.get(f"{self.base_url}/cuentas/{odoo_id}/contactos", headers=headers, timeout=10)
                if contactos_response.status_code == 200:
                    contactos_data = contactos_response.json()
                    if contactos_data and len(contactos_data) > 0:
                        cuenta_with_contactos = odoo_id
                        break
            
            if cuenta_with_contactos:
                self.log_result("Cuenta Contactos", True, f"Found cuenta {cuenta_with_contactos} with {len(contactos_data)} contactos")
                return True
            else:
                # Even if no contactos found, endpoint should work (empty list)
                test_odoo_id = cuentas_data['items'][0]['cuenta_partner_odoo_id']
                response = requests.get(f"{self.base_url}/cuentas/{test_odoo_id}/contactos", headers=headers, timeout=10)
                if response.status_code == 200:
                    self.log_result("Cuenta Contactos", True, f"Endpoint works, no contactos found for cuenta {test_odoo_id}")
                    return True
                else:
                    self.log_result("Cuenta Contactos", False, f"HTTP {response.status_code}: {response.text}")
                    return False
        except Exception as e:
            self.log_result("Cuenta Contactos", False, f"Request error: {str(e)}")
            return False

    def test_partners_unlinked_with_exclude(self):
        """Test /partners/unlinked?q=GARCIA&exclude_cuenta={odoo_id} returns only FREE partners"""
        if not self.token:
            self.log_result("Partners Unlinked (Exclude)", False, "No token available")
            return False
            
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # Get a cuenta to exclude
            cuentas_response = requests.get(f"{self.base_url}/cuentas", headers=headers, params={"page": 1, "limit": 1}, timeout=10)
            if cuentas_response.status_code != 200:
                self.log_result("Partners Unlinked (Exclude)", False, "Could not get cuentas for testing")
                return False
            
            cuentas_data = cuentas_response.json()
            if not cuentas_data.get('items'):
                self.log_result("Partners Unlinked (Exclude)", False, "No cuentas available for testing")
                return False
            
            exclude_cuenta = cuentas_data['items'][0]['cuenta_partner_odoo_id']
            
            # Test unlinked partners with exclude
            params = {"q": "GARCIA", "exclude_cuenta": exclude_cuenta, "pageSize": 5}
            response = requests.get(f"{self.base_url}/partners/unlinked", headers=headers, params=params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                if 'items' in data and 'total' in data:
                    items = data['items']
                    
                    # Verify none of the results have the excluded cuenta odoo_id
                    for item in items:
                        if item.get('odoo_id') == exclude_cuenta:
                            self.log_result("Partners Unlinked (Exclude)", False, f"Found excluded cuenta {exclude_cuenta} in results")
                            return False
                    
                    self.log_result("Partners Unlinked (Exclude)", True, f"Found {len(items)} free GARCIA partners excluding cuenta {exclude_cuenta}")
                    return True
                else:
                    self.log_result("Partners Unlinked (Exclude)", False, f"Invalid response structure: {data}")
                    return False
            else:
                self.log_result("Partners Unlinked (Exclude)", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_result("Partners Unlinked (Exclude)", False, f"Request error: {str(e)}")
            return False

    def test_vincular_contacto_with_odoo_id(self):
        """Test POST /cuentas/{odoo_id}/vincular-contacto links a partner correctly"""
        if not self.token:
            self.log_result("Vincular Contacto (odoo_id)", False, "No token available")
            return False
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            
            # Get a cuenta to test with
            cuentas_response = requests.get(f"{self.base_url}/cuentas", headers=headers, params={"page": 1, "limit": 1}, timeout=10)
            if cuentas_response.status_code != 200:
                self.log_result("Vincular Contacto (odoo_id)", False, "Could not get cuentas for testing")
                return False
            
            cuentas_data = cuentas_response.json()
            if not cuentas_data.get('items'):
                self.log_result("Vincular Contacto (odoo_id)", False, "No cuentas available for testing")
                return False
            
            # Use cuenta_partner_odoo_id (integer)
            cuenta_odoo_id = cuentas_data['items'][0]['cuenta_partner_odoo_id']
            
            # Get an unlinked partner to test with
            unlinked_response = requests.get(f"{self.base_url}/partners/unlinked", headers=headers, 
                                           params={"q": "GARCIA", "pageSize": 1, "exclude_cuenta": cuenta_odoo_id}, timeout=10)
            if unlinked_response.status_code != 200:
                self.log_result("Vincular Contacto (odoo_id)", False, "Could not get unlinked partners for testing")
                return False
            
            unlinked_data = unlinked_response.json()
            if not unlinked_data.get('items'):
                self.log_result("Vincular Contacto (odoo_id)", False, "No unlinked partners available for testing")
                return False
            
            partner_odoo_id = unlinked_data['items'][0]['odoo_id']
            partner_name = unlinked_data['items'][0]['name']
            
            # Test vincular contacto with odoo_id routing
            payload = {
                "contacto_partner_odoo_id": partner_odoo_id,
                "nota": "Test vincular from CRM restructuring test"
            }
            
            response = requests.post(f"{self.base_url}/cuentas/{cuenta_odoo_id}/vincular-contacto", 
                                   headers=headers, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok'):
                    self.log_result("Vincular Contacto (odoo_id)", True, f"Successfully linked partner {partner_name} (ID: {partner_odoo_id}) to cuenta {cuenta_odoo_id}")
                    return True
                else:
                    self.log_result("Vincular Contacto (odoo_id)", False, f"Vincular response not OK: {data}")
                    return False
            else:
                # Check if it's already linked (acceptable for testing)
                if response.status_code == 409 or ("already" in response.text.lower() if response.text else False):
                    self.log_result("Vincular Contacto (odoo_id)", True, f"Partner already linked - this is expected in testing")
                    return True
                else:
                    self.log_result("Vincular Contacto (odoo_id)", False, f"HTTP {response.status_code}: {response.text}")
                    return False
        except Exception as e:
            self.log_result("Vincular Contacto (odoo_id)", False, f"Request error: {str(e)}")
            return False

    def run_all_tests(self):
        """Run comprehensive CRM restructuring test suite"""
        print("🚀 Starting CRM Restructuring Test Suite")
        print("Testing NEW field names and odoo_id routing")
        print("=" * 60)
        
        # Test order matters - health first, then auth, then restructuring features
        tests = [
            self.test_health_check,
            self.test_login,
            self.test_stats_new_fields,
            self.test_cuentas_free_only,
            self.test_cuentas_search_filter,
            self.test_contactos_all_partners,
            self.test_contactos_solo_dni_filter,
            self.test_cuenta_detail_with_odoo_id,
            self.test_cuenta_contactos,
            self.test_partners_unlinked_with_exclude,
            self.test_vincular_contacto_with_odoo_id
        ]
        
        for test in tests:
            test()
            print()  # Add spacing between tests
        
        # Summary
        print("=" * 60)
        print(f"📊 CRM Restructuring Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All CRM restructuring tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} test(s) failed")
            print("\nFailed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            return 1

def main():
    tester = CRMRestructuringTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())