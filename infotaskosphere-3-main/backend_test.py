#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class TaskosphereAPITester:
    def __init__(self, base_url="https://caworkflow-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    Details: {details}")

    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, expected_status: int = 200) -> tuple[bool, Dict]:
        """Make HTTP request and return success status and response data"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text}

            return success, response_data

        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test API health check"""
        success, response = self.make_request('GET', '')
        self.log_test("API Health Check", success, f"Response: {response}")
        return success

    def test_user_registration(self):
        """Test user registration"""
        timestamp = datetime.now().strftime("%H%M%S")
        
        # Test Admin registration
        admin_data = {
            "email": f"admin_{timestamp}@taskosphere.com",
            "password": "AdminPass123!",
            "full_name": f"Admin User {timestamp}",
            "role": "admin"
        }
        
        success, response = self.make_request('POST', 'auth/register', admin_data, 200)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.log_test("User Registration (Admin)", True, f"Admin registered with ID: {self.user_id}")
            return True
        else:
            self.log_test("User Registration (Admin)", False, f"Failed: {response}")
            return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        # First register a user for login test
        timestamp = datetime.now().strftime("%H%M%S")
        
        register_data = {
            "email": f"login_test_{timestamp}@taskosphere.com",
            "password": "LoginTest123!",
            "full_name": f"Login Test User {timestamp}",
            "role": "staff"
        }
        
        # Register user
        reg_success, reg_response = self.make_request('POST', 'auth/register', register_data, 200)
        
        if not reg_success:
            self.log_test("User Login Setup", False, "Failed to register test user")
            return False
        
        # Now test login
        login_data = {
            "email": register_data["email"],
            "password": register_data["password"]
        }
        
        success, response = self.make_request('POST', 'auth/login', login_data, 200)
        
        if success and 'access_token' in response:
            self.log_test("User Login", True, "Login successful")
            return True
        else:
            self.log_test("User Login", False, f"Failed: {response}")
            return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.make_request('GET', 'auth/me', expected_status=200)
        
        if success and 'id' in response:
            self.log_test("Get Current User", True, f"User: {response.get('full_name', 'Unknown')}")
            return True
        else:
            self.log_test("Get Current User", False, f"Failed: {response}")
            return False

    def test_task_management(self):
        """Test complete task CRUD operations"""
        # Create task
        task_data = {
            "title": "Test Task for API Testing",
            "description": "This is a test task created by automated testing",
            "priority": "high",
            "status": "pending",
            "category": "Testing",
            "due_date": (datetime.now() + timedelta(days=7)).isoformat()
        }
        
        success, response = self.make_request('POST', 'tasks', task_data, 200)
        
        if not success or 'id' not in response:
            self.log_test("Task Creation", False, f"Failed: {response}")
            return False
        
        task_id = response['id']
        self.log_test("Task Creation", True, f"Task created with ID: {task_id}")
        
        # Get all tasks
        success, response = self.make_request('GET', 'tasks', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Get All Tasks", True, f"Retrieved {len(response)} tasks")
        else:
            self.log_test("Get All Tasks", False, f"Failed: {response}")
            return False
        
        # Get specific task
        success, response = self.make_request('GET', f'tasks/{task_id}', expected_status=200)
        
        if success and response.get('id') == task_id:
            self.log_test("Get Specific Task", True, f"Retrieved task: {response.get('title')}")
        else:
            self.log_test("Get Specific Task", False, f"Failed: {response}")
            return False
        
        # Update task
        update_data = {
            "title": "Updated Test Task",
            "description": "Updated description",
            "priority": "medium",
            "status": "in_progress",
            "category": "Updated Testing"
        }
        
        success, response = self.make_request('PUT', f'tasks/{task_id}', update_data, 200)
        
        if success and response.get('title') == update_data['title']:
            self.log_test("Task Update", True, "Task updated successfully")
        else:
            self.log_test("Task Update", False, f"Failed: {response}")
            return False
        
        # Delete task
        success, response = self.make_request('DELETE', f'tasks/{task_id}', expected_status=200)
        
        if success:
            self.log_test("Task Deletion", True, "Task deleted successfully")
            return True
        else:
            self.log_test("Task Deletion", False, f"Failed: {response}")
            return False

    def test_dsc_management(self):
        """Test DSC certificate CRUD operations"""
        # Create DSC
        dsc_data = {
            "holder_name": "Test Certificate Holder",
            "certificate_number": f"DSC{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "associated_with": "Test Firm Ltd",
            "entity_type": "firm",
            "issue_date": datetime.now().isoformat(),
            "expiry_date": (datetime.now() + timedelta(days=365)).isoformat(),
            "notes": "Test DSC certificate for API testing"
        }
        
        success, response = self.make_request('POST', 'dsc', dsc_data, 200)
        
        if not success or 'id' not in response:
            self.log_test("DSC Creation", False, f"Failed: {response}")
            return False
        
        dsc_id = response['id']
        self.log_test("DSC Creation", True, f"DSC created with ID: {dsc_id}")
        
        # Get all DSC
        success, response = self.make_request('GET', 'dsc', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Get All DSC", True, f"Retrieved {len(response)} DSC certificates")
        else:
            self.log_test("Get All DSC", False, f"Failed: {response}")
            return False
        
        # Update DSC
        update_data = {
            "holder_name": "Updated Certificate Holder",
            "certificate_number": dsc_data["certificate_number"],
            "associated_with": "Updated Test Firm Ltd",
            "entity_type": "client",
            "issue_date": dsc_data["issue_date"],
            "expiry_date": dsc_data["expiry_date"],
            "notes": "Updated notes for testing"
        }
        
        success, response = self.make_request('PUT', f'dsc/{dsc_id}', update_data, 200)
        
        if success and response.get('holder_name') == update_data['holder_name']:
            self.log_test("DSC Update", True, "DSC updated successfully")
        else:
            self.log_test("DSC Update", False, f"Failed: {response}")
            return False
        
        # Delete DSC
        success, response = self.make_request('DELETE', f'dsc/{dsc_id}', expected_status=200)
        
        if success:
            self.log_test("DSC Deletion", True, "DSC deleted successfully")
            return True
        else:
            self.log_test("DSC Deletion", False, f"Failed: {response}")
            return False

    def test_attendance_management(self):
        """Test attendance punch in/out functionality"""
        # Punch in
        success, response = self.make_request('POST', 'attendance', {"action": "punch_in"}, 200)
        
        if success and 'punch_in' in response:
            self.log_test("Attendance Punch In", True, f"Punched in at: {response.get('punch_in')}")
        else:
            self.log_test("Attendance Punch In", False, f"Failed: {response}")
            return False
        
        # Get today's attendance
        success, response = self.make_request('GET', 'attendance/today', expected_status=200)
        
        if success and response and 'punch_in' in response:
            self.log_test("Get Today's Attendance", True, "Retrieved today's attendance")
        else:
            self.log_test("Get Today's Attendance", False, f"Failed: {response}")
            return False
        
        # Punch out
        success, response = self.make_request('POST', 'attendance', {"action": "punch_out"}, 200)
        
        if success and 'punch_out' in response:
            self.log_test("Attendance Punch Out", True, f"Punched out at: {response.get('punch_out')}")
        else:
            self.log_test("Attendance Punch Out", False, f"Failed: {response}")
            return False
        
        # Get attendance history
        success, response = self.make_request('GET', 'attendance/history', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Get Attendance History", True, f"Retrieved {len(response)} attendance records")
            return True
        else:
            self.log_test("Get Attendance History", False, f"Failed: {response}")
            return False

    def test_notifications(self):
        """Test notification functionality"""
        # Get notifications
        success, response = self.make_request('GET', 'notifications', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Get Notifications", True, f"Retrieved {len(response)} notifications")
        else:
            self.log_test("Get Notifications", False, f"Failed: {response}")
            return False
        
        # Check and create notifications (admin only)
        success, response = self.make_request('POST', 'notifications/check', expected_status=200)
        
        if success:
            self.log_test("Check/Create Notifications", True, "Notification check completed")
            return True
        else:
            self.log_test("Check/Create Notifications", False, f"Failed: {response}")
            return False

    def test_activity_logging(self):
        """Test activity logging functionality"""
        activity_data = {
            "screen_time_minutes": 60,
            "tasks_completed": 2
        }
        
        success, response = self.make_request('POST', 'activity', activity_data, 200)
        
        if success:
            self.log_test("Activity Logging", True, "Activity logged successfully")
            return True
        else:
            self.log_test("Activity Logging", False, f"Failed: {response}")
            return False

    def test_efficiency_reports(self):
        """Test efficiency reports"""
        success, response = self.make_request('GET', 'reports/efficiency', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Efficiency Reports", True, f"Retrieved efficiency data for {len(response)} users")
            return True
        else:
            self.log_test("Efficiency Reports", False, f"Failed: {response}")
            return False

    def test_users_endpoint(self):
        """Test users endpoint (admin/manager only)"""
        success, response = self.make_request('GET', 'users', expected_status=200)
        
        if success and isinstance(response, list):
            self.log_test("Get Users List", True, f"Retrieved {len(response)} users")
            return True
        else:
            self.log_test("Get Users List", False, f"Failed: {response}")
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Taskosphere API Tests")
        print("=" * 50)
        
        # Basic connectivity
        if not self.test_health_check():
            print("❌ API is not accessible. Stopping tests.")
            return False
        
        # Authentication tests
        if not self.test_user_registration():
            print("❌ User registration failed. Stopping tests.")
            return False
        
        self.test_user_login()
        self.test_get_current_user()
        
        # Core functionality tests
        self.test_task_management()
        self.test_dsc_management()
        self.test_attendance_management()
        self.test_notifications()
        self.test_activity_logging()
        self.test_efficiency_reports()
        self.test_users_endpoint()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

    def get_test_results(self):
        """Get detailed test results"""
        return {
            "summary": {
                "total_tests": self.tests_run,
                "passed_tests": self.tests_passed,
                "failed_tests": self.tests_run - self.tests_passed,
                "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
            },
            "detailed_results": self.test_results
        }

def main():
    tester = TaskosphereAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = tester.get_test_results()
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())