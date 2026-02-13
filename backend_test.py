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

    def test_quick_status_change(self, task_id):
        """Test quick status change functionality"""
        if not task_id:
            print("   ⚠️  Skipping - No task ID provided")
            return False
            
        # Test status changes: pending -> in_progress -> completed -> pending
        status_changes = [
            ("pending", "To Do"),
            ("in_progress", "In Progress"), 
            ("completed", "Completed"),
            ("pending", "To Do")  # Back to pending
        ]
        
        for status, label in status_changes:
            # First get the current task to preserve other fields
            get_success, current_task = self.run_test(
                f"Get Task for Status Update",
                "GET",
                f"tasks/{task_id}",
                200
            )
            
            if not get_success:
                print(f"   ❌ Failed to get current task data")
                return False
            
            # Update task with new status
            update_data = {
                "title": current_task.get("title"),
                "description": current_task.get("description", ""),
                "assigned_to": current_task.get("assigned_to"),
                "sub_assignees": current_task.get("sub_assignees", []),
                "due_date": current_task.get("due_date"),
                "priority": current_task.get("priority"),
                "status": status,
                "category": current_task.get("category", "other"),
                "client_id": current_task.get("client_id"),
                "is_recurring": current_task.get("is_recurring", False),
                "recurrence_pattern": current_task.get("recurrence_pattern", "monthly"),
                "recurrence_interval": current_task.get("recurrence_interval", 1)
            }
            
            success, response = self.run_test(
                f"Quick Status Change to {label}",
                "PUT",
                f"tasks/{task_id}",
                200,
                data=update_data
            )
            
            if success:
                updated_status = response.get('status')
                if updated_status == status:
                    print(f"   ✅ Status changed to {label} ({status})")
                else:
                    print(f"   ❌ Status change failed. Expected: {status}, Got: {updated_status}")
                    return False
            else:
                print(f"   ❌ Failed to change status to {status}")
                return False
        
        return True

    def test_dsc_create_without_certificate_number(self):
        """Test creating DSC without certificate_number field (new model)"""
        dsc_data = {
            "holder_name": "Test DSC Holder",
            "dsc_type": "Class 3 Signature",  # New optional field
            "dsc_password": "TestPassword123",  # New optional field
            "associated_with": "Test Company Ltd",  # Optional field
            "entity_type": "firm",
            "issue_date": "2024-01-01T00:00:00Z",
            "expiry_date": "2025-12-31T23:59:59Z",
            "notes": "Test DSC for new model validation"
        }
        
        success, response = self.run_test(
            "Create DSC with New Model (no certificate_number)",
            "POST",
            "dsc",
            200,
            data=dsc_data
        )
        
        if success:
            # Verify new fields are saved correctly
            dsc_type = response.get('dsc_type')
            dsc_password = response.get('dsc_password')
            associated_with = response.get('associated_with')
            
            if (dsc_type == dsc_data['dsc_type'] and 
                dsc_password == dsc_data['dsc_password'] and
                associated_with == dsc_data['associated_with']):
                print(f"   ✅ New DSC fields saved correctly - Type: {dsc_type}, Password: {dsc_password}, Associated: {associated_with}")
                return response.get('id')
            else:
                print(f"   ❌ DSC field mismatch")
        return None

    def test_dsc_create_minimal_required_fields(self):
        """Test creating DSC with only required fields (holder_name, issue_date, expiry_date)"""
        dsc_data = {
            "holder_name": "Minimal DSC Holder",
            "entity_type": "firm",
            "issue_date": "2024-01-01T00:00:00Z",
            "expiry_date": "2025-12-31T23:59:59Z"
            # No dsc_type, dsc_password, or associated_with (all optional)
        }
        
        success, response = self.run_test(
            "Create DSC with Minimal Required Fields",
            "POST",
            "dsc",
            200,
            data=dsc_data
        )
        
        if success:
            holder_name = response.get('holder_name')
            if holder_name == dsc_data['holder_name']:
                print(f"   ✅ Minimal DSC created successfully - Holder: {holder_name}")
                return response.get('id')
            else:
                print(f"   ❌ Minimal DSC creation failed")
        return None

    def test_dsc_movement_tracking(self, dsc_id):
        """Test DSC IN/OUT movement tracking"""
        if not dsc_id:
            print("   ⚠️  Skipping - No DSC ID provided")
            return False
        
        # Test marking DSC as OUT
        movement_out = {
            "movement_type": "OUT",
            "person_name": "John Doe",
            "notes": "Taken for client work"
        }
        
        success, response = self.run_test(
            "Mark DSC as OUT",
            "POST",
            f"dsc/{dsc_id}/movement",
            200,
            data=movement_out
        )
        
        if not success:
            return False
        
        # Test marking DSC as IN
        movement_in = {
            "movement_type": "IN",
            "person_name": "Jane Smith",
            "notes": "Returned after completion"
        }
        
        success, response = self.run_test(
            "Mark DSC as IN",
            "POST",
            f"dsc/{dsc_id}/movement",
            200,
            data=movement_in
        )
        
        if success:
            print(f"   ✅ DSC movement tracking working correctly")
            return True
        return False

    def test_get_dsc_list(self):
        """Test getting DSC list"""
        success, response = self.run_test(
            "Get DSC List",
            "GET",
            "dsc",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   ✅ Retrieved {len(response)} DSC certificates")
            # Check for new fields in DSC records
            dscs_with_type = [d for d in response if d.get('dsc_type')]
            dscs_with_password = [d for d in response if d.get('dsc_password')]
            print(f"   ✅ {len(dscs_with_type)} DSCs have type field")
            print(f"   ✅ {len(dscs_with_password)} DSCs have password field")
            return response
        return []

    def test_task_priority_and_overdue_scenarios(self):
        """Test creating tasks with different priorities and overdue scenarios"""
        # Test high priority task
        high_priority_task = {
            "title": "High Priority Test Task",
            "description": "Testing high priority task for orange gradient",
            "priority": "high",
            "status": "pending",
            "category": "gst",
            "due_date": "2024-12-31T23:59:59Z"
        }
        
        success, response = self.run_test(
            "Create High Priority Task",
            "POST",
            "tasks",
            200,
            data=high_priority_task
        )
        
        high_priority_task_id = None
        if success:
            priority = response.get('priority')
            if priority == 'high':
                print(f"   ✅ High priority task created successfully")
                high_priority_task_id = response.get('id')
            else:
                print(f"   ❌ Priority mismatch. Expected: high, Got: {priority}")
        
        # Test critical priority task
        critical_priority_task = {
            "title": "Critical Priority Test Task", 
            "description": "Testing critical priority task for orange gradient",
            "priority": "critical",
            "status": "pending",
            "category": "income_tax",
            "due_date": "2024-12-31T23:59:59Z"
        }
        
        success, response = self.run_test(
            "Create Critical Priority Task",
            "POST", 
            "tasks",
            200,
            data=critical_priority_task
        )
        
        critical_priority_task_id = None
        if success:
            priority = response.get('priority')
            if priority == 'critical':
                print(f"   ✅ Critical priority task created successfully")
                critical_priority_task_id = response.get('id')
            else:
                print(f"   ❌ Priority mismatch. Expected: critical, Got: {priority}")
        
        # Test overdue task (past due date)
        overdue_task = {
            "title": "Overdue Test Task",
            "description": "Testing overdue task for red gradient",
            "priority": "medium",
            "status": "pending", 
            "category": "accounts",
            "due_date": "2023-01-01T23:59:59Z"  # Past date
        }
        
        success, response = self.run_test(
            "Create Overdue Task",
            "POST",
            "tasks", 
            200,
            data=overdue_task
        )
        
        overdue_task_id = None
        if success:
            due_date = response.get('due_date')
            status = response.get('status')
            if due_date and status == 'pending':
                print(f"   ✅ Overdue task created successfully with due date: {due_date}")
                overdue_task_id = response.get('id')
            else:
                print(f"   ❌ Overdue task creation issue")
        
        return {
            'high_priority': high_priority_task_id,
            'critical_priority': critical_priority_task_id, 
            'overdue': overdue_task_id
        }

def main():
    # Setup
    tester = TaskosphereAPITester()
    
    print("🚀 Starting Taskosphere API Tests - Login & DSC Updates")
    print("=" * 60)
    
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

    # Test DSC management with new model (no certificate_number)
    print("\n🔐 Testing DSC Management (New Model)")
    print("-" * 40)
    
    dsc_id_full = tester.test_dsc_create_without_certificate_number()
    dsc_id_minimal = tester.test_dsc_create_minimal_required_fields()
    dsc_list = tester.test_get_dsc_list()
    
    # Test DSC movement tracking
    if dsc_id_full:
        tester.test_dsc_movement_tracking(dsc_id_full)

    # Test task management with assignees and departments
    print("\n📋 Testing Task Management")
    print("-" * 40)
    
    tester.test_create_task_with_department()
    tasks = tester.test_get_tasks()
    
    task_id = None
    if users:
        task_id = tester.test_create_task_with_assignees(users)

    # Test new quick status change functionality
    print("\n🔄 Testing Quick Status Change")
    print("-" * 40)
    
    if task_id:
        tester.test_quick_status_change(task_id)
    else:
        print("   ⚠️  Skipping quick status change - no task ID available")

    # Test priority and overdue scenarios for gradient backgrounds
    print("\n🎨 Testing Priority & Overdue Task Scenarios")
    print("-" * 40)
    
    special_tasks = tester.test_task_priority_and_overdue_scenarios()
    
    # Test quick status change on special tasks
    if special_tasks.get('high_priority'):
        print("\n   Testing quick status change on high priority task:")
        tester.test_quick_status_change(special_tasks['high_priority'])

    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())