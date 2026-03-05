"""
Test suite for Reportes > Ventas module endpoints.

Endpoints tested:
1. GET /api/reportes/ventas/summary - Summary with KPIs and YoY comparison
2. GET /api/reportes/ventas/by-day - Daily sales series (current vs previous year)
3. GET /api/reportes/ventas/top - Top rankings (clientes, modelos, tiendas, items)
4. GET /api/reportes/ventas/filter-options - Filter dropdown options
"""
import pytest
import requests
import os
from datetime import date

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestReportesVentasAuth:
    """Authentication for Reportes Ventas endpoints"""
    
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


class TestSummaryEndpoint(TestReportesVentasAuth):
    """Tests for GET /api/reportes/ventas/summary"""
    
    def test_summary_ytd_returns_kpis(self, auth_headers):
        """YTD summary returns kpis, yoy, yoy_pct with correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Summary YTD failed: {response.text}"
        data = response.json()
        
        # Check structure
        assert "range" in data
        assert data["range"] == "YTD"
        assert "date_from" in data
        assert "date_to" in data
        assert "kpis" in data
        assert "yoy" in data
        assert "yoy_pct" in data
        
        # Check KPIs structure
        kpis = data["kpis"]
        assert "ventas_soles" in kpis
        assert "unidades" in kpis
        assert "ordenes" in kpis
        assert "clientes" in kpis
        
        # Check YoY structure
        yoy = data["yoy"]
        assert "ventas_soles_prev" in yoy
        assert "unidades_prev" in yoy
        assert "ordenes_prev" in yoy
        assert "clientes_prev" in yoy
        
        # Check YoY percentage structure
        yoy_pct = data["yoy_pct"]
        assert "ventas_soles" in yoy_pct
        assert "unidades" in yoy_pct
        assert "ordenes" in yoy_pct
        assert "clientes" in yoy_pct
        
        print(f"YTD Summary: ventas_soles={kpis['ventas_soles']}, unidades={kpis['unidades']}, ordenes={kpis['ordenes']}, clientes={kpis['clientes']}")
    
    def test_summary_mtd_different_range(self, auth_headers):
        """MTD summary returns different date range than YTD"""
        response_ytd = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD"},
            headers=auth_headers
        )
        response_mtd = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "MTD"},
            headers=auth_headers
        )
        
        assert response_ytd.status_code == 200
        assert response_mtd.status_code == 200
        
        ytd_data = response_ytd.json()
        mtd_data = response_mtd.json()
        
        # MTD should start from first of current month
        today = date.today()
        expected_mtd_from = today.replace(day=1).isoformat()
        
        assert mtd_data["range"] == "MTD"
        assert mtd_data["date_from"] == expected_mtd_from, f"Expected MTD date_from={expected_mtd_from}, got {mtd_data['date_from']}"
        
        # YTD should start from Jan 1
        expected_ytd_from = today.replace(month=1, day=1).isoformat()
        assert ytd_data["date_from"] == expected_ytd_from, f"Expected YTD date_from={expected_ytd_from}, got {ytd_data['date_from']}"
        
        print(f"YTD: {ytd_data['date_from']} - {ytd_data['date_to']}")
        print(f"MTD: {mtd_data['date_from']} - {mtd_data['date_to']}")
    
    def test_summary_filter_by_tienda(self, auth_headers):
        """Filter by tienda returns filtered data"""
        # First get unfiltered summary
        response_all = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD"},
            headers=auth_headers
        )
        assert response_all.status_code == 200
        all_data = response_all.json()
        
        # Get filtered by BOOSH
        response_filtered = requests.get(
            f"{BASE_URL}/api/reportes/ventas/summary",
            params={"range": "YTD", "tienda": "BOOSH"},
            headers=auth_headers
        )
        assert response_filtered.status_code == 200
        filtered_data = response_filtered.json()
        
        # Filtered should have <= total ventas
        assert filtered_data["kpis"]["ventas_soles"] <= all_data["kpis"]["ventas_soles"], \
            "Filtered ventas should be <= total ventas"
        
        print(f"Total YTD: S/{all_data['kpis']['ventas_soles']}")
        print(f"BOOSH YTD: S/{filtered_data['kpis']['ventas_soles']}")


class TestByDayEndpoint(TestReportesVentasAuth):
    """Tests for GET /api/reportes/ventas/by-day"""
    
    def test_by_day_returns_current_and_previous(self, auth_headers):
        """by-day returns current and previous daily series arrays"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/by-day",
            params={"range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"by-day failed: {response.text}"
        data = response.json()
        
        assert "current" in data
        assert "previous" in data
        assert isinstance(data["current"], list)
        assert isinstance(data["previous"], list)
        
        # Check structure of daily entries
        if len(data["current"]) > 0:
            entry = data["current"][0]
            assert "date" in entry
            assert "ventas_soles" in entry
            assert "unidades" in entry
        
        print(f"Current period days: {len(data['current'])}")
        print(f"Previous period days: {len(data['previous'])}")


class TestTopEndpoint(TestReportesVentasAuth):
    """Tests for GET /api/reportes/ventas/top"""
    
    def test_top_clientes_returns_ranked_rows(self, auth_headers):
        """Top clientes returns ranked client rows with ventas_soles, unidades, ordenes"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"group_by": "clientes", "top_n": 5, "range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Top clientes failed: {response.text}"
        data = response.json()
        
        assert "rows" in data
        assert "group_by" in data
        assert data["group_by"] == "clientes"
        assert isinstance(data["rows"], list)
        
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "nombre" in row
            assert "ventas_soles" in row
            assert "unidades" in row
            assert "ordenes" in row
            assert isinstance(row["ventas_soles"], (int, float))
            
        print(f"Top {len(data['rows'])} clientes returned")
    
    def test_top_modelos_returns_ranked_rows(self, auth_headers):
        """Top modelos returns ranked model rows"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"group_by": "modelos", "range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["group_by"] == "modelos"
        assert isinstance(data["rows"], list)
        
        print(f"Top {len(data['rows'])} modelos returned")
    
    def test_top_tiendas_returns_ranked_rows(self, auth_headers):
        """Top tiendas returns tienda rankings"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"group_by": "tiendas", "range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["group_by"] == "tiendas"
        assert isinstance(data["rows"], list)
        
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "nombre" in row  # tienda name
            assert "ventas_soles" in row
            
        print(f"Top {len(data['rows'])} tiendas returned")
    
    def test_top_items_returns_marca_tipo_entalle_tela(self, auth_headers):
        """Top items returns marca/tipo/entalle/tela rows"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/top",
            params={"group_by": "items", "range": "YTD"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["group_by"] == "items"
        assert isinstance(data["rows"], list)
        
        if len(data["rows"]) > 0:
            row = data["rows"][0]
            assert "marca" in row
            assert "tipo" in row
            assert "entalle" in row
            assert "tela" in row
            assert "ventas_soles" in row
            
        print(f"Top {len(data['rows'])} items returned")


class TestFilterOptionsEndpoint(TestReportesVentasAuth):
    """Tests for GET /api/reportes/ventas/filter-options"""
    
    def test_filter_options_returns_all_arrays(self, auth_headers):
        """Filter options returns tiendas, marcas, tipos, entalles, telas, hilos, tallas, colores, vendedores"""
        response = requests.get(
            f"{BASE_URL}/api/reportes/ventas/filter-options",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Filter options failed: {response.text}"
        data = response.json()
        
        # Check all required arrays exist
        required_arrays = ["tiendas", "marcas", "tipos", "entalles", "telas", "hilos", "tallas", "colores", "vendedores"]
        for arr_name in required_arrays:
            assert arr_name in data, f"Missing {arr_name} in filter options"
            assert isinstance(data[arr_name], list), f"{arr_name} should be a list"
        
        print(f"Filter options: tiendas={len(data['tiendas'])}, marcas={len(data['marcas'])}, "
              f"tipos={len(data['tipos'])}, tallas={len(data['tallas'])}, colores={len(data['colores'])}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
