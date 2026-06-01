#!/usr/bin/env python3
"""
Backend API Testing for TAMIS АГРО
Tests product catalog APIs and admin authentication
"""
import requests
import sys
from datetime import datetime

# Use the public endpoint from frontend/.env
BASE_URL = "https://aggroo-staging.preview.emergentagent.com/api"

class TamisAPITester:
    def __init__(self, base_url=BASE_URL):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        req_headers = {'Content-Type': 'application/json'}
        if headers:
            req_headers.update(headers)
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=10)
            else:
                print(f"❌ Failed - Unsupported method: {method}")
                self.failed_tests.append({"test": name, "reason": f"Unsupported method: {method}"})
                return False, {}

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "response": response.text[:200]
                })

            try:
                return success, response.json() if response.text else {}
            except:
                return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({"test": name, "reason": str(e)})
            return False, {}

    def test_products_list(self, limit=100):
        """Test GET /api/products with limit"""
        success, response = self.run_test(
            f"List Products (limit={limit})",
            "GET",
            f"products?limit={limit}",
            200
        )
        if success:
            items = response.get('items', [])
            total = response.get('total', 0)
            print(f"   Found {len(items)} products (total: {total})")
            return items
        return []

    def test_product_by_slug(self, slug):
        """Test GET /api/products/{slug}"""
        success, response = self.run_test(
            f"Get Product by Slug: {slug}",
            "GET",
            f"products/{slug}",
            200
        )
        if success:
            name = response.get('name', 'N/A')
            price = response.get('price', 'N/A')
            print(f"   Product: {name}, Price: {price}")
            return response
        return None

    def test_product_categories(self):
        """Test GET /api/products/categories"""
        success, response = self.run_test(
            "List Product Categories",
            "GET",
            "products/categories",
            200
        )
        if success:
            items = response.get('items', [])
            print(f"   Found {len(items)} categories:")
            for cat in items:
                slug = cat.get('slug', 'N/A')
                label = cat.get('label', 'N/A')
                count = cat.get('count', 0)
                print(f"     - {label} ({slug}): {count} products")
            return items
        return []

    def test_admin_login(self, email, password):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token received: {self.token[:20]}...")
            return True
        return False

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print(f"📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for i, fail in enumerate(self.failed_tests, 1):
                print(f"\n{i}. {fail.get('test', 'Unknown')}")
                if 'reason' in fail:
                    print(f"   Reason: {fail['reason']}")
                if 'expected' in fail:
                    print(f"   Expected: {fail['expected']}, Got: {fail['actual']}")
                if 'response' in fail:
                    print(f"   Response: {fail['response']}")
        print("="*60)


def main():
    print("="*60)
    print("TAMIS АГРО - Backend API Testing")
    print("="*60)
    
    tester = TamisAPITester(BASE_URL)
    
    # Test 1: List all products (should return 68 products)
    print("\n### TESTING PRODUCT CATALOG ###")
    products = tester.test_products_list(limit=100)
    
    if len(products) != 68:
        print(f"\n⚠️  WARNING: Expected 68 products, found {len(products)}")
    
    # Test 2: Get product categories with counts
    categories = tester.test_product_categories()
    
    # Verify expected category counts
    expected_counts = {
        "bioinsekticidi": 7,
        "makro": 48,
        "inokulyanti": 8,
        "dopomizhni": 4,
        "rodenticidi": 1
    }
    
    print("\n### VERIFYING CATEGORY COUNTS ###")
    for cat in categories:
        slug = cat.get('slug')
        count = cat.get('count')
        if slug in expected_counts:
            expected = expected_counts[slug]
            if count == expected:
                print(f"✅ {slug}: {count} products (expected {expected})")
            else:
                print(f"⚠️  {slug}: {count} products (expected {expected})")
    
    # Test 3: Get specific product by slug
    print("\n### TESTING SPECIFIC PRODUCT ###")
    product = tester.test_product_by_slug("biologichnii-fungitsid-trikhodermin")
    
    if product:
        # Verify product details
        name = product.get('name', '')
        price = product.get('price', 0)
        photos = product.get('photos', [])
        
        print(f"\n   Product Details:")
        print(f"   - Name: {name}")
        print(f"   - Price: {price}")
        print(f"   - Photos: {len(photos)} images")
        
        if price != 246:
            print(f"   ⚠️  WARNING: Expected price 246, got {price}")
    
    # Test 4: Get 2 more products from the catalog
    print("\n### TESTING ADDITIONAL PRODUCTS ###")
    if len(products) >= 3:
        # Test second product
        second_product = products[1]
        second_slug = second_product.get('slug')
        if second_slug:
            tester.test_product_by_slug(second_slug)
        
        # Test third product
        third_product = products[2]
        third_slug = third_product.get('slug')
        if third_slug:
            tester.test_product_by_slug(third_slug)
    
    # Test 5: Admin authentication
    print("\n### TESTING ADMIN AUTHENTICATION ###")
    admin_email = "admin@tamis.ua"
    admin_password = "admin1234"
    tester.test_admin_login(admin_email, admin_password)
    
    # Print summary
    tester.print_summary()
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1


if __name__ == "__main__":
    sys.exit(main())
