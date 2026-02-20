"""
Test suite for Balance de Tallas (por Item) feature
Tests the stock balance matrix and colors-matrix endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://account-ui-ux.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_EMAIL = "test@test.com"
TEST_PASSWORD = "test123"


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
    }, timeout=30)
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in response"
    return data["token"]


@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# === MATRIX ENDPOINT TESTS ===

class TestStockBalanceMatrix:
    """Tests for GET /api/stock-balance/matrix endpoint"""
    
    def test_matrix_returns_200(self, authenticated_client):
        """Verify matrix endpoint returns 200 status"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Matrix endpoint returns 200")

    def test_matrix_response_structure(self, authenticated_client):
        """Verify matrix response contains required fields"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        # Required fields per specification
        required_fields = ["tallas", "rows", "totals_by_talla", "grand_total", "total_items", "filter_opts"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ Matrix response contains all required fields: {required_fields}")

    def test_matrix_tallas_is_list(self, authenticated_client):
        """Verify tallas is a sorted list"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["tallas"], list), "tallas should be a list"
        assert len(data["tallas"]) > 0, "tallas list should not be empty"
        print(f"✓ tallas is a list with {len(data['tallas'])} sizes: {data['tallas'][:5]}...")

    def test_matrix_rows_structure(self, authenticated_client):
        """Verify each row has item key fields and values dict"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["rows"], list), "rows should be a list"
        assert len(data["rows"]) > 0, "rows list should not be empty"
        
        # Check first row structure
        row = data["rows"][0]
        required_row_fields = ["marca", "tipo", "entalle", "tela", "hilo", "values", "total"]
        for field in required_row_fields:
            assert field in row, f"Missing field in row: {field}"
        
        assert isinstance(row["values"], dict), "values should be a dict (talla -> qty)"
        assert isinstance(row["total"], (int, float)), "total should be numeric"
        
        print(f"✓ Row structure correct. First row: {row['marca']} - {row['tipo']} - Total: {row['total']}")

    def test_matrix_totals_by_talla(self, authenticated_client):
        """Verify totals_by_talla is a dict with talla keys"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["totals_by_talla"], dict), "totals_by_talla should be a dict"
        # Some tallas should have totals
        assert len(data["totals_by_talla"]) > 0, "totals_by_talla should not be empty"
        
        # Verify each value is numeric
        for talla, total in data["totals_by_talla"].items():
            assert isinstance(total, (int, float)), f"Total for {talla} should be numeric"
        
        print(f"✓ totals_by_talla has {len(data['totals_by_talla'])} entries")

    def test_matrix_grand_total(self, authenticated_client):
        """Verify grand_total is numeric and positive"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["grand_total"], (int, float)), "grand_total should be numeric"
        assert data["grand_total"] >= 0, "grand_total should be non-negative"
        print(f"✓ grand_total: {data['grand_total']}")

    def test_matrix_total_items(self, authenticated_client):
        """Verify total_items count"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["total_items"], int), "total_items should be int"
        assert data["total_items"] >= len(data["rows"]), "total_items should be >= rows returned"
        print(f"✓ total_items: {data['total_items']}")

    def test_matrix_filter_opts_structure(self, authenticated_client):
        """Verify filter_opts contains filter options"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data["filter_opts"], dict), "filter_opts should be a dict"
        
        expected_filter_keys = ["tienda", "marca", "tipo", "entalle", "tela", "hilo", "color", "talla"]
        for key in expected_filter_keys:
            assert key in data["filter_opts"], f"Missing filter option: {key}"
            assert isinstance(data["filter_opts"][key], list), f"{key} options should be a list"
        
        print(f"✓ filter_opts contains all expected keys: {expected_filter_keys}")
        print(f"  Marcas: {data['filter_opts']['marca'][:5]}...")


# === MATRIX FILTER TESTS ===

class TestStockBalanceMatrixFilters:
    """Tests for matrix endpoint with filters"""
    
    def test_filter_by_marca(self, authenticated_client):
        """Verify marca filter works"""
        # First get available marcas
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data["filter_opts"]["marca"]:
            pytest.skip("No marcas available for filtering")
        
        test_marca = data["filter_opts"]["marca"][0]
        
        # Filter by that marca
        filtered_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"marca": test_marca},
            timeout=60
        )
        assert filtered_response.status_code == 200
        filtered_data = filtered_response.json()
        
        # All rows should have this marca
        for row in filtered_data["rows"]:
            assert row["marca"] == test_marca, f"Row marca '{row['marca']}' doesn't match filter '{test_marca}'"
        
        print(f"✓ Marca filter works: {test_marca} -> {len(filtered_data['rows'])} rows")

    def test_filter_by_tienda(self, authenticated_client):
        """Verify tienda filter works"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data["filter_opts"]["tienda"]:
            pytest.skip("No tiendas available for filtering")
        
        test_tienda = data["filter_opts"]["tienda"][0]
        
        filtered_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"tienda": test_tienda},
            timeout=60
        )
        assert filtered_response.status_code == 200
        filtered_data = filtered_response.json()
        
        # Filtered data should have fewer or equal items
        assert filtered_data["total_items"] <= data["total_items"], "Filtered results should be <= unfiltered"
        print(f"✓ Tienda filter works: {test_tienda} -> {filtered_data['total_items']} items")

    def test_filter_by_tipo(self, authenticated_client):
        """Verify tipo filter works"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data["filter_opts"]["tipo"]:
            pytest.skip("No tipos available for filtering")
        
        test_tipo = data["filter_opts"]["tipo"][0]
        
        filtered_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"tipo": test_tipo},
            timeout=60
        )
        assert filtered_response.status_code == 200
        filtered_data = filtered_response.json()
        
        # All rows should have this tipo
        for row in filtered_data["rows"]:
            assert row["tipo"] == test_tipo, f"Row tipo '{row['tipo']}' doesn't match filter '{test_tipo}'"
        
        print(f"✓ Tipo filter works: {test_tipo} -> {len(filtered_data['rows'])} rows")

    def test_multiple_filters(self, authenticated_client):
        """Verify multiple filters can be combined"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        if not data["filter_opts"]["marca"] or not data["filter_opts"]["tipo"]:
            pytest.skip("Not enough filter options for multiple filter test")
        
        test_marca = data["filter_opts"]["marca"][0]
        test_tipo = data["filter_opts"]["tipo"][0]
        
        filtered_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"marca": test_marca, "tipo": test_tipo},
            timeout=60
        )
        assert filtered_response.status_code == 200
        filtered_data = filtered_response.json()
        
        # Results should be subset
        assert filtered_data["total_items"] <= data["total_items"]
        print(f"✓ Multiple filters work: marca={test_marca}, tipo={test_tipo} -> {filtered_data['total_items']} items")

    def test_pagination_params(self, authenticated_client):
        """Verify limit and page parameters work"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"limit": 10, "page": 1},
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["rows"]) <= 10, "Should return at most 10 rows"
        assert data.get("page") == 1, "Page should be 1"
        assert data.get("limit") == 10, "Limit should be 10"
        
        print(f"✓ Pagination works: limit=10, page=1 -> {len(data['rows'])} rows returned")


# === COLORS-MATRIX ENDPOINT TESTS ===

class TestStockBalanceColorsMatrix:
    """Tests for GET /api/stock-balance/colors-matrix endpoint"""
    
    def test_colors_matrix_without_params_returns_empty(self, authenticated_client):
        """Colors endpoint without item params should return empty"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/colors-matrix",
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        # Without any item filters, should return empty
        assert data["rows"] == [] or len(data["rows"]) == 0
        print(f"✓ Colors-matrix without params returns empty result")

    def test_colors_matrix_with_item_params(self, authenticated_client):
        """Colors endpoint with item params returns color detail"""
        # First get an item from the matrix
        matrix_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert matrix_response.status_code == 200
        matrix_data = matrix_response.json()
        
        if not matrix_data["rows"]:
            pytest.skip("No items available for colors test")
        
        item = matrix_data["rows"][0]
        
        # Request colors for this item
        colors_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/colors-matrix",
            params={
                "marca": item["marca"],
                "tipo": item["tipo"],
                "entalle": item["entalle"],
                "tela": item["tela"],
                "hilo": item["hilo"]
            },
            timeout=60
        )
        assert colors_response.status_code == 200
        colors_data = colors_response.json()
        
        # Should have structure
        assert "tallas" in colors_data
        assert "rows" in colors_data
        assert "totals_by_talla" in colors_data
        assert "grand_total" in colors_data
        
        print(f"✓ Colors-matrix returns data for item: {item['marca']} - {item['tipo']}")
        print(f"  Tallas: {colors_data['tallas']}")
        print(f"  Color rows: {len(colors_data['rows'])}")

    def test_colors_matrix_row_structure(self, authenticated_client):
        """Verify color rows have correct structure"""
        # Get an item with data
        matrix_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert matrix_response.status_code == 200
        matrix_data = matrix_response.json()
        
        if not matrix_data["rows"]:
            pytest.skip("No items available")
        
        item = matrix_data["rows"][0]
        
        colors_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/colors-matrix",
            params={
                "marca": item["marca"],
                "tipo": item["tipo"],
                "entalle": item["entalle"],
                "tela": item["tela"],
                "hilo": item["hilo"]
            },
            timeout=60
        )
        assert colors_response.status_code == 200
        colors_data = colors_response.json()
        
        if colors_data["rows"]:
            row = colors_data["rows"][0]
            assert "color" in row, "Color row should have 'color' field"
            assert "values" in row, "Color row should have 'values' dict"
            assert "total" in row, "Color row should have 'total'"
            
            assert isinstance(row["values"], dict)
            assert isinstance(row["total"], (int, float))
            
            print(f"✓ Color row structure correct: {row['color']} - Total: {row['total']}")
        else:
            print("✓ Colors-matrix row structure test passed (no colors for this item)")

    def test_colors_matrix_totals_match(self, authenticated_client):
        """Verify color totals sum matches grand_total"""
        matrix_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            timeout=60
        )
        assert matrix_response.status_code == 200
        matrix_data = matrix_response.json()
        
        if not matrix_data["rows"]:
            pytest.skip("No items available")
        
        item = matrix_data["rows"][0]
        
        colors_response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/colors-matrix",
            params={
                "marca": item["marca"],
                "tipo": item["tipo"],
                "entalle": item["entalle"],
                "tela": item["tela"],
                "hilo": item["hilo"]
            },
            timeout=60
        )
        assert colors_response.status_code == 200
        colors_data = colors_response.json()
        
        if colors_data["rows"]:
            calculated_total = sum(row["total"] for row in colors_data["rows"])
            # Allow small floating point difference
            assert abs(calculated_total - colors_data["grand_total"]) < 1, \
                f"Sum of color totals ({calculated_total}) should match grand_total ({colors_data['grand_total']})"
            print(f"✓ Color totals sum ({calculated_total}) matches grand_total ({colors_data['grand_total']})")
        else:
            print("✓ Totals test passed (no color rows)")


# === AUTHENTICATION TESTS ===

class TestStockBalanceAuth:
    """Tests for authentication requirement"""
    
    def test_matrix_requires_auth(self, api_client):
        """Matrix endpoint requires authentication"""
        # Remove auth header for this test
        headers = {"Content-Type": "application/json"}
        response = requests.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            headers=headers,
            timeout=30
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print(f"✓ Matrix endpoint correctly requires authentication")

    def test_colors_requires_auth(self, api_client):
        """Colors endpoint requires authentication"""
        headers = {"Content-Type": "application/json"}
        response = requests.get(
            f"{BASE_URL}/api/stock-balance/colors-matrix",
            headers=headers,
            timeout=30
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print(f"✓ Colors-matrix endpoint correctly requires authentication")


# === DATA INTEGRITY TESTS ===

class TestStockBalanceDataIntegrity:
    """Tests for data integrity and consistency"""
    
    def test_item_total_equals_sum_of_values(self, authenticated_client):
        """Verify each item's total equals sum of its talla values"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"limit": 50},
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        for row in data["rows"][:10]:  # Check first 10 rows
            calculated_total = sum(row["values"].values())
            # Allow small difference due to rounding
            assert abs(calculated_total - row["total"]) < 1, \
                f"Row total mismatch: sum of values={calculated_total}, total={row['total']}"
        
        print(f"✓ All item totals match sum of talla values")

    def test_totals_by_talla_correct(self, authenticated_client):
        """Verify totals_by_talla is sum of column values"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"limit": 50},
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        # Calculate column totals from rows
        calculated_totals = {}
        for row in data["rows"]:
            for talla, qty in row["values"].items():
                calculated_totals[talla] = calculated_totals.get(talla, 0) + qty
        
        # Compare with reported totals_by_talla
        for talla, expected in data["totals_by_talla"].items():
            actual = calculated_totals.get(talla, 0)
            assert abs(actual - expected) < 1, \
                f"Talla {talla}: calculated={actual}, reported={expected}"
        
        print(f"✓ totals_by_talla values are correct")

    def test_grand_total_correct(self, authenticated_client):
        """Verify grand_total equals sum of all row totals"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/stock-balance/matrix",
            params={"limit": 50},
            timeout=60
        )
        assert response.status_code == 200
        data = response.json()
        
        calculated_grand = sum(row["total"] for row in data["rows"])
        # Note: grand_total is for current page, not all items
        assert abs(calculated_grand - data["grand_total"]) < 1, \
            f"Grand total mismatch: calculated={calculated_grand}, reported={data['grand_total']}"
        
        print(f"✓ grand_total ({data['grand_total']}) is correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
