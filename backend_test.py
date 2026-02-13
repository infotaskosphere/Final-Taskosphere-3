import requests
import sys
from datetime import datetime
import json

class TaskosphereAPITester:
    def __init__(self, base_url="https://site-launch-66.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self, email, password):
        """Test login and get token"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user', {}).get('id')
            print(f"   Token obtained for user: {response.get('user', {}).get('full_name')}")
            return True
        return False

    def test_create_user_with_departments(self):
        """Test creating a user with multiple departments"""
        user_data = {
            "email": f"test_user_{datetime.now().strftime('%H%M%S')}@test.com",
            "password": "TestPass123!",
            "full_name": "Test User with Departments",
            "role": "staff",
            "departments": ["gst", "income_tax", "accounts"]
        }
        
        success, response = self.run_test(
            "Create User with Departments",
            "POST",
            "auth/register",
            200,
            data=user_data
        )
        
        if success:
            created_user = response.get('user', {})
            departments = created_user.get('departments', [])
            if set(departments) == set(user_data['departments']):
                print(f"   ✅ Departments correctly saved: {departments}")
                return created_user.get('id')
            else:
                print(f"   ❌ Departments mismatch. Expected: {user_data['departments']}, Got: {departments}")
        return None

    def test_get_users(self):
        """Test getting users list"""
        success, response = self.run_test(
            "Get Users List",
            "GET",
            "users",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Retrieved {len(response)} users")
            # Check if users have departments field
            users_with_depts = [u for u in response if u.get('departments')]
            print(f"   ✅ {len(users_with_depts)} users have departments assigned")
            return response
        return []

    def test_update_user_departments(self, user_id):
        """Test updating user departments"""
        if not user_id:
            print("   ⚠️  Skipping - No user ID provided")
            return False
            
        update_data = {
            "full_name": "Updated Test User",
            "role": "staff",
            "departments": ["gst", "roc", "trademark", "dsc"]
        }
        
        success, response = self.run_test(
            "Update User Departments",
            "PUT",
            f"users/{user_id}",
            200,
            data=update_data
        )
        
        if success:
            departments = response.get('departments', [])
            if set(departments) == set(update_data['departments']):
                print(f"   ✅ Departments updated correctly: {departments}")
                return True
            else:
                print(f"   ❌ Departments update failed. Expected: {update_data['departments']}, Got: {departments}")
        return False

    def test_create_task_with_assignees(self, users):
        """Test creating a task with assignee and co-assignee"""
        if len(users) < 2:
            print("   ⚠️  Skipping - Need at least 2 users for assignee testing")
            return None
            
        task_data = {
            "title": "Test Task with Assignees",
            "description": "Testing assignee and co-assignee functionality",
            "assigned_to": users[0]['id'],
            "sub_assignees": [users[1]['id']] if len(users) > 1 else [],
            "due_date": "2024-12-31T23:59:59Z",
            "priority": "high",
            "status": "pending",
            "category": "gst"
        }
        
        success, response = self.run_test(
            "Create Task with Assignees",
            "POST",
            "tasks",
            200,
            data=task_data
        )
        
        if success:
            task = response
            assigned_to = task.get('assigned_to')
            sub_assignees = task.get('sub_assignees', [])
            
            if assigned_to == task_data['assigned_to'] and sub_assignees == task_data['sub_assignees']:
                print(f"   ✅ Task assignees set correctly - Assignee: {assigned_to}, Co-assignees: {sub_assignees}")
                return task.get('id')
            else:
                print(f"   ❌ Task assignees mismatch")
        return None

    def test_create_task_with_department(self):
        """Test creating a task with department category"""
        departments_to_test = ["gst", "income_tax", "accounts", "tds", "roc"]
        
        for dept in departments_to_test:
            task_data = {
                "title": f"Test {dept.upper()} Task",
                "description": f"Testing {dept} department task creation",
                "priority": "medium",
                "status": "pending",
                "category": dept
            }
            
            success, response = self.run_test(
                f"Create {dept.upper()} Task",
                "POST",
                "tasks",
                200,
                data=task_data
            )
            
            if success:
                category = response.get('category')
                if category == dept:
                    print(f"   ✅ Department category set correctly: {category}")
                else:
                    print(f"   ❌ Department category mismatch. Expected: {dept}, Got: {category}")
            else:
                return False
        
        return True

    def test_get_tasks(self):
        """Test getting tasks list"""
        success, response = self.run_test(
            "Get Tasks List",
            "GET",
            "tasks",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Retrieved {len(response)} tasks")
            # Check tasks with categories
            tasks_with_categories = [t for t in response if t.get('category')]
            print(f"   ✅ {len(tasks_with_categories)} tasks have department categories")
            return response
        return []

def main():
    # Setup
    tester = TaskosphereAPITester()
    
    print("🚀 Starting Taskosphere API Tests")
    print("=" * 50)
    
    # Test login
    if not tester.test_login("admin@test.com", "admin123"):
        print("❌ Login failed, stopping tests")
        return 1

    # Test user management with departments
    print("\n📋 Testing User Management with Departments")
    print("-" * 40)
    
    created_user_id = tester.test_create_user_with_departments()
    users = tester.test_get_users()
    
    if created_user_id:
        tester.test_update_user_departments(created_user_id)

    # Test task management with assignees and departments
    print("\n📋 Testing Task Management")
    print("-" * 40)
    
    tester.test_create_task_with_department()
    tasks = tester.test_get_tasks()
    
    if users:
        tester.test_create_task_with_assignees(users)

    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())