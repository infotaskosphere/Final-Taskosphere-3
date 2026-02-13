# Taskosphere - Product Requirements Document

## Original Problem Statement
Task management website for CA/CS Firms with comprehensive features for task management, DSC tracking, client management, attendance, activity monitoring, and team communication.

## User Personas
1. **Admin** - Full system access, manages users, views all data, configures permissions
2. **Manager** - Views team data, assigns tasks
3. **Staff** - Views assigned tasks, attendance, data based on permissions

## Core Features

### Completed Features ✅
- [x] User Authentication (JWT-based login/register)
- [x] Task CRUD with multi-staff assignment and categories
- [x] Recurring Tasks support
- [x] Client Management with multiple contacts
- [x] DSC Register with IN/OUT tracking and movement history
- [x] Due Date Reminders with modern calendar UI
- [x] **Modern Dashboard (FirmSync Pro style)**
  - Clickable metric cards navigating to respective pages
  - Welcome banner with next filing deadline
  - Attendance widget with punch in/out
  - Recent Task Updates & Urgent Deadlines sections
  - Quick Access row
- [x] **Role-Based Access Control (RBAC)**
  - 7 configurable permissions including "Assign Tasks"
  - Assigned Clients selection
  - Backend filtering based on permissions
- [x] **Activity Tracking (keyboard/mouse based)**
  - useActivityTracker hook
  - Auto-sync every 30 seconds
  - Staff Activity Monitor page (admin only)
- [x] **Attendance System (FirmSync Pro style)**
  - Calendar view with present days highlighted
  - Monthly working hours summary
  - Punch in/out with duration tracking
  - Stats: This Month, Avg Per Day, All Time, Today
- [x] **Staff Attendance Report (Admin)**
  - Monthly breakdown by employee
  - Total hours, days present, avg hours/day
  - Status badges (Excellent/Good/Low)
- [x] **Team Chat System** ✨ NEW
  - Direct messages (1-on-1)
  - Group chat creation
  - Privacy: Only members can see group/messages
  - File/Image sharing (up to 5MB)
  - Real-time message polling (3 seconds)
  - Unread message counts
  - Group settings (members, leave/delete)
- [x] Reports page with charts
- [x] SendGrid email integration

### P1 - Next Priority
- [ ] Client Page UI Redesign
- [ ] Employee efficiency reports (connect to activity data)
- [ ] Notification center improvements

### P2 - Future/Backlog
- [ ] New UI layout (Master, Compliance, KRA, Goals)
- [ ] Backend refactoring (split server.py)
- [ ] Client birthday auto-email scheduler

## Technical Architecture

### Frontend
- React 18.2.0, React Router, Tailwind CSS
- Shadcn UI, Recharts, Framer Motion, Axios
- useActivityTracker hook for activity monitoring

### Backend
- FastAPI, Pydantic, MongoDB (Motor)
- JWT Authentication, RBAC
- SendGrid for emails

### Database Collections
- `users` - User accounts with roles and permissions
- `tasks` - Tasks with multi-assignment
- `clients` - Client companies
- `dsc_register` - DSC certificates
- `due_dates` - Due date reminders
- `attendance` - Daily punch records
- `notifications` - In-app notifications
- `activity_logs` - Screen time tracking
- `staff_activity` - Keyboard/mouse activity
- `chat_groups` - Chat groups/DMs
- `chat_messages` - Chat messages with files

## API Endpoints

### Chat APIs (NEW)
- `POST /api/chat/groups` - Create group/DM
- `GET /api/chat/groups` - Get user's groups
- `GET /api/chat/groups/{id}` - Get group details
- `PUT /api/chat/groups/{id}` - Update group
- `DELETE /api/chat/groups/{id}` - Leave/delete group
- `GET /api/chat/groups/{id}/messages` - Get messages
- `POST /api/chat/groups/{id}/messages` - Send message
- `GET /api/chat/users` - Get users for chat

### Attendance APIs (Enhanced)
- `GET /api/attendance/my-summary` - User's attendance summary
- `GET /api/attendance/staff-report` - Admin attendance report

## User Permissions Schema
```javascript
{
  can_view_all_tasks: boolean,
  can_view_all_clients: boolean,
  can_view_all_dsc: boolean,
  can_view_all_duedates: boolean,
  can_view_reports: boolean,
  can_manage_users: boolean,
  can_assign_tasks: boolean,
  assigned_clients: string[]
}
```

## Test Credentials
- Email: admin@test.com
- Password: admin123

## Last Updated
Date: 2025-02-13
Status: Task assignment UI updated with Assignee/Co-assignee and Department toggles. User management updated with multi-department selection.

## Recent Updates (Feb 13, 2025)
- Task form: Assignee + Co-assignee dropdowns (side by side)
- Task form: Department toggle buttons (10 departments)
- User form: Multi-select departments (Allotted)
- Users table: Departments column added
- All modals: Scrollable with max-h-[90vh] overflow-y-auto

## Test Credentials
- Email: admin@test.com
- Password: admin123 (newly registered in current session)
