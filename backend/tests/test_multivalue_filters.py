"""
Test suite for Multi-Value Filtering in Reportes > Ventas module.

Tests comma-separated multi-value filter support for all filter fields:
- tienda: Multi-store filtering (e.g., "BOOSH,GR238")
- marca: Multi-brand filtering (e.g., "BOOSH,REDDOOR")
- tipo, entalle, tela, hilo, talla, color: Multi-value support
- "Sin tienda" mixed with real values

Endpoints tested with multi-value:
1. GET /api/reportes/ventas/summary
2. GET /api/reportes/ventas/by-month
3. GET /api/reportes/ventas/top
"""
import pytest
import requests
import os
from datetime import date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestMultiValueAuth:
    """Authentication fixture for multi-value filter tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get auth token using provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "usuario": "eduard",
            "password": "cardenas"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Auth headers for API calls"""
        return {"Authorization": f"Bearer {auth_token}"}


class TestMultiValueSummaryEndpoint(TestMultiValueAuth):
    """Tests for multi-value filtering in GET /api/reportes/ventas/summary"""
    
    def test_summary_multi_tienda_filter_works(self, auth_headers):
        """Multi-value tienda filter (BOOSH,GR238) returns filtered data"""
        # Get single tienda
        response_single = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH"},
            headers=auth_headers
        )
        assert response_single.status_code == 200, f"Single tienda filter failed: {response_single.text}"
        single_data = response_single.json()
        
        # Get multi tienda (BOOSH + GR238)
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH,GR238"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi tienda filter failed: {response_multi.text}"
        multi_data = response_multi.json()
        
        # Multi should have >= unidades than single (since it's combining two stores)
        assert multi_data["kpis"]["unidades"] >= single_data["kpis"]["unidades"], \
            f"Multi tienda unidades ({multi_data['kpis']['unidades']}) should be >= single ({single_data['kpis']['unidades']})"
        
        print(f"Single (BOOSH) unidades: {single_data['kpis']['unidades']}")
        print(f"Multi (BOOSH,GR238) unidades: {multi_data['kpis']['unidades']}")
    
    def test_summary_multi_marca_filter_works(self, auth_headers):
        """Multi-value marca filter (BOOSH,REDDOOR) returns filtered data"""
        # Get single marca
        response_single = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "marca": "BOOSH"},
            headers=auth_headers
        )
        assert response_single.status_code == 200, f"Single marca filter failed: {response_single.text}"
        single_data = response_single.json()
        
        # Get multi marca
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "marca": "BOOSH,REDDOOR"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi marca filter failed: {response_multi.text}"
        multi_data = response_multi.json()
        
        # Multi should have >= unidades than single
        assert multi_data["kpis"]["unidades"] >= single_data["kpis"]["unidades"], \
            f"Multi marca unidades ({multi_data['kpis']['unidades']}) should be >= single ({single_data['kpis']['unidades']})"
        
        print(f"Single (BOOSH marca) unidades: {single_data['kpis']['unidades']}")
        print(f"Multi (BOOSH,REDDOOR) unidades: {multi_data['kpis']['unidades']}")
    
    def test_summary_single_tienda_still_works(self, auth_headers):
        """Single value tienda filter continues to work correctly"""
        # Get unfiltered (all)
        response_all = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD"},
            headers=auth_headers
        )
        assert response_all.status_code == 200
        all_data = response_all.json()
        
        # Get single tienda
        response_single = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH"},
            headers=auth_headers
        )
        assert response_single.status_code == 200
        single_data = response_single.json()
        
        # Single filter should return less than or equal to all
        assert single_data["kpis"]["unidades"] <= all_data["kpis"]["unidades"], \
            "Single filter should return <= total"
        
        print(f"Total YTD unidades: {all_data['kpis']['unidades']}")
        print(f"BOOSH only unidades: {single_data['kpis']['unidades']}")
    
    def test_summary_sin_tienda_mixed_with_real_values(self, auth_headers):
        """Filter with 'Sin tienda' mixed with real values works"""
        # Get single tienda BOOSH
        response_boosh = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH"},
            headers=auth_headers
        )
        assert response_boosh.status_code == 200
        boosh_data = response_boosh.json()
        
        # Get Sin tienda only
        response_sin = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "Sin tienda"},
            headers=auth_headers
        )
        assert response_sin.status_code == 200, f"Sin tienda filter failed: {response_sin.text}"
        sin_data = response_sin.json()
        
        # Get mixed: BOOSH + Sin tienda
        response_mixed = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH,Sin tienda"},
            headers=auth_headers
        )
        assert response_mixed.status_code == 200, f"Mixed tienda filter failed: {response_mixed.text}"
        mixed_data = response_mixed.json()
        
        # Mixed should have sum of both (approximately)
        expected_min = boosh_data["kpis"]["unidades"]
        assert mixed_data["kpis"]["unidades"] >= expected_min, \
            f"Mixed should have >= BOOSH unidades. Got {mixed_data['kpis']['unidades']}, expected >= {expected_min}"
        
        print(f"BOOSH unidades: {boosh_data['kpis']['unidades']}")
        print(f"Sin tienda unidades: {sin_data['kpis']['unidades']}")
        print(f"BOOSH+Sin tienda unidades: {mixed_data['kpis']['unidades']}")


class TestMultiValueByMonthEndpoint(TestMultiValueAuth):
    """Tests for multi-value filtering in GET /api/reportes/ventas/by-month"""
    
    def test_by_month_multi_tienda_filter_works(self, auth_headers):
        """Multi-value tienda filter in by-month endpoint returns filtered data"""
        # Get single tienda
        response_single = requests.get(
            f"{BASE_URL}/api/reportes/ventas/by-month",
            params={"tienda": "BOOSH"},
            headers=auth_headers
        )
        assert response_single.status_code == 200
        single_data = response_single.json()
        
        # Get multi tienda
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/by-month",
            params={"tienda": "BOOSH,GR238"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi tienda in by-month failed: {response_multi.text}"
        multi_data = response_multi.json()
        
        cur_year = str(date.today().year)
        if cur_year in single_data.get("ytd_totals", {}) and cur_year in multi_data.get("ytd_totals", {}):
            single_total = single_data["ytd_totals"][cur_year]["unidades"]
            multi_total = multi_data["ytd_totals"][cur_year]["unidades"]
            
            assert multi_total >= single_total, \
                f"Multi tienda YTD ({multi_total}) should be >= single ({single_total})"
            
            print(f"by-month BOOSH YTD: {single_total}")
            print(f"by-month BOOSH+GR238 YTD: {multi_total}")
    
    def test_by_month_multi_marca_filter_works(self, auth_headers):
        """Multi-value marca filter in by-month endpoint works"""
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/by-month",
            params={"marca": "BOOSH,REDDOOR"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi marca in by-month failed: {response_multi.text}"
        data = response_multi.json()
        
        assert "months" in data
        assert "ytd_totals" in data
        
        print(f"by-month multi-marca returned {len(data['months'])} months")


class TestMultiValueTopEndpoint(TestMultiValueAuth):
    """Tests for multi-value filtering in GET /api/reportes/ventas/top"""
    
    def test_top_multi_tienda_filter_works(self, auth_headers):
        """Multi-value tienda filter in top endpoint returns filtered data"""
        # Get all
        response_all = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"range": "YTD", "group_by": "clientes", "top_n": 5},
            headers=auth_headers
        )
        assert response_all.status_code == 200
        all_data = response_all.json()
        
        # Get multi tienda filtered
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"range": "YTD", "group_by": "clientes", "top_n": 5, "tienda": "BOOSH,GR238"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi tienda in top failed: {response_multi.text}"
        multi_data = response_multi.json()
        
        assert "rows" in multi_data
        print(f"Top clientes with multi-tienda filter: {len(multi_data['rows'])} rows")
    
    def test_top_multi_marca_filter_works(self, auth_headers):
        """Multi-value marca filter in top endpoint works"""
        response_multi = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"range": "YTD", "group_by": "modelos", "top_n": 10, "marca": "BOOSH,REDDOOR"},
            headers=auth_headers
        )
        assert response_multi.status_code == 200, f"Multi marca in top failed: {response_multi.text}"
        data = response_multi.json()
        
        assert "rows" in data
        print(f"Top modelos with multi-marca filter: {len(data['rows'])} rows")
    
    def test_top_multi_tipo_filter_works(self, auth_headers):
        """Multi-value tipo filter in top endpoint works"""
        # First get filter options to know available tipos
        response_opts = requests.get(
            f"{BASE_URL}/api/reportes/ventas/filter-options",
            headers=auth_headers
        )
        assert response_opts.status_code == 200
        opts = response_opts.json()
        
        if len(opts.get("tipos", [])) >= 2:
            tipos = ",".join(opts["tipos"][:2])
            
            response_multi = requests.get(
                f"{BASE_URL}/api/reportes/ventas/top",
                params={"range": "YTD", "group_by": "clientes", "tipo": tipos},
                headers=auth_headers
            )
            assert response_multi.status_code == 200, f"Multi tipo in top failed: {response_multi.text}"
            data = response_multi.json()
            
            print(f"Top clientes with multi-tipo filter ({tipos}): {len(data['rows'])} rows")
        else:
            pytest.skip("Not enough tipos to test multi-value")


class TestMultiValueCombinations(TestMultiValueAuth):
    """Tests for combining multiple multi-value filters"""
    
    def test_combined_multi_tienda_and_marca(self, auth_headers):
        """Multiple multi-value filters combined work correctly"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={
                "range": "YTD",
                "tienda": "BOOSH,GR238",
                "marca": "BOOSH,REDDOOR"
            },
            headers=auth_headers
        )
        assert response.status_code == 200, f"Combined multi-filters failed: {response.text}"
        data = response.json()
        
        assert "kpis" in data
        assert "unidades" in data["kpis"]
        
        print(f"Combined multi-filters (tienda+marca): unidades={data['kpis']['unidades']}")
    
    def test_three_stores_filter(self, auth_headers):
        """Filter with 3 tiendas works"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH,GR238,GM209"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"3-store filter failed: {response.text}"
        data = response.json()
        
        print(f"3-store filter (BOOSH+GR238+GM209) unidades: {data['kpis']['unidades']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
