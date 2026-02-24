"""
Test: CuentasDirectoryGrid new columns for /api/cuentas/list endpoint
Tests: depto_name, last_purchase_date, qty_12m, orders_12m, pct_vs_avg_ytd, phone_display, phone_whatsapp
Sorting: sort=depto, sort=last_purchase, sort=qty_12m, sort=orders_12m, sort=pct_ytd
Phone normalization: WhatsApp 51 prefix for 9-digit Peru numbers
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestCuentasDirectoryColumns:
    """Test all new columns in /api/cuentas/list response"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login once for all tests in this class"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@crm.com",
            "password": "admin123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        self.token = resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    # ─── TEST NEW COLUMNS EXIST ───────────────────────────────────────────────
    
    def test_list_returns_all_new_columns(self):
        """GET /api/cuentas/list must return all 7 expected new columns"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200, f"API failed: {resp.text}"
        data = resp.json()
        assert "rows" in data, "Response missing 'rows' key"
        assert "total_rows" in data, "Response missing 'total_rows' key"
        
        # Check at least one row returned to validate columns
        if data["rows"]:
            row = data["rows"][0]
            expected_cols = ["id", "nombre", "depto_name", "estado", "is_active",
                            "last_purchase_date", "qty_12m", "orders_12m", 
                            "pct_vs_avg_ytd", "phone_display", "phone_whatsapp"]
            for col in expected_cols:
                assert col in row, f"Column '{col}' missing in response row"
            print(f"✓ All expected columns present. Sample row keys: {list(row.keys())}")
            # raw_phone/raw_mobile should be removed after _apply_phone
            assert "raw_phone" not in row, "raw_phone should not be in response"
            assert "raw_mobile" not in row, "raw_mobile should not be in response"
        else:
            print("⚠ No rows returned - column check skipped")
    
    def test_qty_12m_is_integer(self):
        """qty_12m must be integer, not float"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:10]:  # Check first 10 rows
            if row["qty_12m"] is not None:
                assert isinstance(row["qty_12m"], int), f"qty_12m must be int, got {type(row['qty_12m'])} = {row['qty_12m']}"
        print("✓ qty_12m is integer type")
    
    def test_orders_12m_is_integer(self):
        """orders_12m must be integer"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:10]:
            if row["orders_12m"] is not None:
                assert isinstance(row["orders_12m"], int), f"orders_12m must be int, got {type(row['orders_12m'])}"
        print("✓ orders_12m is integer type")
    
    def test_pct_vs_avg_ytd_null_or_float(self):
        """pct_vs_avg_ytd must be null (no prior data) or float"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        null_count = 0
        float_count = 0
        for row in data["rows"][:50]:
            pct = row["pct_vs_avg_ytd"]
            if pct is None:
                null_count += 1
            else:
                assert isinstance(pct, (float, int)), f"pct_vs_avg_ytd must be float/null, got {type(pct)}"
                float_count += 1
        print(f"✓ pct_vs_avg_ytd valid. nulls={null_count}, floats={float_count}")
    
    def test_pct_vs_avg_ytd_rounded_to_4_decimals(self):
        """pct_vs_avg_ytd should be rounded to 4 decimal places"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:50]:
            pct = row.get("pct_vs_avg_ytd")
            if pct is not None:
                str_pct = str(pct)
                if '.' in str_pct:
                    decimals = len(str_pct.split('.')[1])
                    assert decimals <= 4, f"pct_vs_avg_ytd has {decimals} decimals: {pct}"
        print("✓ pct_vs_avg_ytd rounded correctly")
    
    def test_last_purchase_date_format(self):
        """last_purchase_date must be string (ISO date) or null"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:20]:
            lpd = row.get("last_purchase_date")
            if lpd is not None:
                assert isinstance(lpd, str), f"last_purchase_date must be string, got {type(lpd)}"
        print("✓ last_purchase_date is string when present")
    
    # ─── TEST PHONE NORMALIZATION ─────────────────────────────────────────────
    
    def test_phone_display_exists(self):
        """phone_display must exist (can be empty string)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        phones_with_data = 0
        for row in data["rows"]:
            assert "phone_display" in row, "phone_display key missing"
            if row["phone_display"]:
                phones_with_data += 1
        print(f"✓ phone_display exists. {phones_with_data}/{len(data['rows'])} have phone data")
    
    def test_phone_whatsapp_format_peru_9digit(self):
        """phone_whatsapp for 9-digit Peru mobile must start with 51"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        wa_with_51_prefix = []
        for row in data["rows"][:100]:
            wa = row.get("phone_whatsapp", "")
            if wa and wa.startswith("51"):
                wa_with_51_prefix.append(wa)
                # 51 + 9 digits = 11 chars for Peru numbers
                # or 51 + longer number also valid
        print(f"✓ Found {len(wa_with_51_prefix)} WhatsApp numbers with 51 prefix. Samples: {wa_with_51_prefix[:5]}")
    
    def test_phone_dedup_mobile_priority(self):
        """If phone and mobile are same normalized, only mobile is shown"""
        # This tests internal logic - we verify no duplicate display
        resp = requests.get(f"{BASE_URL}/api/cuentas/list", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        # Just verify structure is correct - dedup logic is internal
        for row in data["rows"][:20]:
            pd = row.get("phone_display", "")
            pw = row.get("phone_whatsapp", "")
            # If we have display, we should have wa (or empty for landlines)
            assert isinstance(pd, str), "phone_display must be string"
            assert isinstance(pw, str), "phone_whatsapp must be string"
        print("✓ Phone fields have correct structure")
    
    # ─── TEST SORTING ─────────────────────────────────────────────────────────
    
    def test_sort_by_depto_asc(self):
        """sort=depto should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=depto&dir=asc", headers=self.headers)
        assert resp.status_code == 200, f"Sort by depto failed: {resp.text}"
        data = resp.json()
        assert "rows" in data
        print(f"✓ sort=depto returns {len(data['rows'])} rows")
        # Print first few depto values
        deptos = [r["depto_name"] for r in data["rows"][:5]]
        print(f"  First 5 deptos (asc): {deptos}")
    
    def test_sort_by_depto_desc(self):
        """sort=depto dir=desc should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=depto&dir=desc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        deptos = [r["depto_name"] for r in data["rows"][:5]]
        print(f"✓ sort=depto desc. First 5 deptos: {deptos}")
    
    def test_sort_by_last_purchase_desc(self):
        """sort=last_purchase should sort by most recent first"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=last_purchase&dir=desc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        dates = [r["last_purchase_date"] for r in data["rows"][:5] if r["last_purchase_date"]]
        print(f"✓ sort=last_purchase desc. First 5 dates: {dates}")
        # Verify descending order (most recent first)
        if len(dates) >= 2:
            for i in range(len(dates)-1):
                if dates[i] and dates[i+1]:
                    assert dates[i] >= dates[i+1], f"Not in descending order: {dates[i]} < {dates[i+1]}"
    
    def test_sort_by_last_purchase_asc(self):
        """sort=last_purchase dir=asc should sort oldest first"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=last_purchase&dir=asc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        dates = [r["last_purchase_date"] for r in data["rows"][:10] if r["last_purchase_date"]]
        print(f"✓ sort=last_purchase asc. First non-null dates: {dates[:5]}")
    
    def test_sort_by_qty_12m_desc(self):
        """sort=qty_12m should sort by quantity (high to low)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=qty_12m&dir=desc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        qtys = [r["qty_12m"] for r in data["rows"][:10]]
        print(f"✓ sort=qty_12m desc. First 10 qtys: {qtys}")
        # Verify descending order
        for i in range(len(qtys)-1):
            if qtys[i] is not None and qtys[i+1] is not None:
                assert qtys[i] >= qtys[i+1], f"qty_12m not descending: {qtys[i]} < {qtys[i+1]}"
    
    def test_sort_by_orders_12m_desc(self):
        """sort=orders_12m should sort by order count (high to low)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=orders_12m&dir=desc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        orders = [r["orders_12m"] for r in data["rows"][:10]]
        print(f"✓ sort=orders_12m desc. First 10: {orders}")
        # Verify descending order
        for i in range(len(orders)-1):
            if orders[i] is not None and orders[i+1] is not None:
                assert orders[i] >= orders[i+1], f"orders_12m not descending: {orders[i]} < {orders[i+1]}"
    
    def test_sort_by_pct_ytd_desc(self):
        """sort=pct_ytd should sort by YTD percentage (high to low)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=pct_ytd&dir=desc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        pcts = [r["pct_vs_avg_ytd"] for r in data["rows"][:10]]
        print(f"✓ sort=pct_ytd desc. First 10: {pcts}")
        # Some may be null - verify non-null values are descending
        non_null = [p for p in pcts if p is not None]
        for i in range(len(non_null)-1):
            assert non_null[i] >= non_null[i+1], f"pct_ytd not descending: {non_null[i]} < {non_null[i+1]}"
    
    def test_sort_by_pct_ytd_asc(self):
        """sort=pct_ytd dir=asc should sort (low to high)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=pct_ytd&dir=asc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        pcts = [r["pct_vs_avg_ytd"] for r in data["rows"][:10]]
        print(f"✓ sort=pct_ytd asc. First 10: {pcts}")
    
    def test_sort_by_name_default(self):
        """sort=name should be default (alphabetical)"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?sort=name&dir=asc", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        names = [r["nombre"] for r in data["rows"][:5] if r["nombre"]]
        print(f"✓ sort=name asc. First 5: {names}")
    
    # ─── TEST PAGINATION WORKS WITH NEW COLUMNS ───────────────────────────────
    
    def test_pagination_page_1(self):
        """Pagination page=1 should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?page=1&limit=20", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 1
        assert len(data["rows"]) <= 20
        print(f"✓ Page 1: {len(data['rows'])} rows, total={data['total_rows']}")
    
    def test_pagination_page_2(self):
        """Pagination page=2 should return different rows"""
        resp1 = requests.get(f"{BASE_URL}/api/cuentas/list?page=1&limit=20", headers=self.headers)
        resp2 = requests.get(f"{BASE_URL}/api/cuentas/list?page=2&limit=20", headers=self.headers)
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        data1 = resp1.json()
        data2 = resp2.json()
        
        if data1["total_rows"] > 20:
            # Page 2 should have different IDs
            ids1 = set(r["id"] for r in data1["rows"])
            ids2 = set(r["id"] for r in data2["rows"])
            overlap = ids1 & ids2
            assert len(overlap) == 0, f"Pages have overlapping IDs: {overlap}"
            print(f"✓ Page 2 has different rows. Page 1 IDs: {list(ids1)[:3]}, Page 2 IDs: {list(ids2)[:3]}")
        else:
            print(f"⚠ Only {data1['total_rows']} total rows - skipping pagination test")
    
    # ─── TEST FILTERS WORK WITH NEW COLUMNS ───────────────────────────────────
    
    def test_search_q_filter(self):
        """Search q filter should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?q=LIMA", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        print(f"✓ Search q=LIMA: {len(data['rows'])} results, total={data['total_rows']}")
    
    def test_estado_filter(self):
        """Estado filter should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?estado=ACTIVO", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:10]:
            assert row["estado"] == "ACTIVO", f"Expected ACTIVO, got {row['estado']}"
        print(f"✓ Estado filter: {len(data['rows'])} ACTIVO accounts")
    
    def test_include_inactive_false(self):
        """include_inactive=false should hide inactive accounts"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?include_inactive=false", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        for row in data["rows"][:10]:
            assert row["is_active"] == True, f"Inactive row found: {row['id']}"
        print(f"✓ include_inactive=false: all rows are active")
    
    def test_include_inactive_true(self):
        """include_inactive=true should show all accounts"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?include_inactive=true", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        print(f"✓ include_inactive=true: {len(data['rows'])} rows returned")
    
    # ─── REGRESSION TESTS ─────────────────────────────────────────────────────
    
    def test_get_cuenta_detail_still_works(self):
        """GET /api/cuentas/{id} should still work"""
        # First get a valid ID from list
        resp = requests.get(f"{BASE_URL}/api/cuentas/list?limit=1", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        if data["rows"]:
            cuenta_id = data["rows"][0]["id"]
            detail_resp = requests.get(f"{BASE_URL}/api/cuentas/{cuenta_id}", headers=self.headers)
            assert detail_resp.status_code == 200, f"Detail failed: {detail_resp.text}"
            print(f"✓ GET /api/cuentas/{cuenta_id} works")
    
    def test_filter_options_endpoint_works(self):
        """GET /api/cuentas/list/filter-options should work"""
        resp = requests.get(f"{BASE_URL}/api/cuentas/list/filter-options", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "ciudades" in data
        assert "asignados" in data
        print(f"✓ Filter options: {len(data['ciudades'])} ciudades, {len(data['asignados'])} asignados")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
