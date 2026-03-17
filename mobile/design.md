# Taskosphere Mobile App - Design Document

## Overview
A mobile-first version of the Taskosphere project management app, designed for iOS and Android. The app maintains full compatibility with the existing FastAPI backend and MongoDB database, allowing seamless data synchronization across web and mobile platforms.

## Design Principles
- **Mobile-first**: Portrait orientation (9:16), optimized for one-handed usage
- **iOS-native feel**: Follows Apple Human Interface Guidelines
- **Minimal cognitive load**: Clear navigation, predictable interactions
- **Offline-ready**: Local caching for essential data
- **Performance**: Fast load times, smooth animations

---

## Screen List

### Authentication Screens
1. **Login Screen** - Email/password authentication with error handling
2. **Register Screen** - New user registration with role selection

### Core Navigation (Tab Bar)
3. **Dashboard** - Overview of key metrics, quick stats, recent activity
4. **Tasks** - List of assigned tasks with filtering and search
5. **Todos** - Personal todo list management
6. **Attendance** - Clock in/out, attendance history
7. **Profile** - User settings, logout

### Task Management
8. **Task Detail** - Full task information, comments, status updates
9. **Create/Edit Task** - Form to create or modify tasks
10. **Task Filters** - Advanced filtering by status, priority, assignee

### Attendance & Activity
11. **Attendance History** - Calendar view of attendance records
12. **Staff Activity** - Activity log for team members
13. **Punch In/Out** - Quick access time tracking

### Reports & Data
14. **Reports** - Performance metrics, task completion rates
15. **Clients** - Client list and details (if accessible)
16. **DSC Register** - Digital signature certificate tracking

### Settings & Admin
17. **Settings** - App preferences, theme, notifications
18. **User Management** - Admin panel for user management (admin only)
19. **Audit Logs** - System activity logs (admin only)

---

## Primary Content and Functionality

### Dashboard Screen
- **Quick Stats**: Total tasks, completed tasks, pending tasks
- **Recent Activity**: Last 5 tasks updated
- **Team Overview**: Active team members, attendance summary
- **Action Buttons**: Quick create task, punch in/out

### Tasks Screen
- **Task List**: Scrollable list of assigned tasks
- **Task Card**: Shows title, priority (color-coded), due date, assignee
- **Filters**: By status (pending, in-progress, completed), priority, due date
- **Search**: Quick search by task title or description
- **Swipe Actions**: Mark complete, edit, delete (if permitted)

### Task Detail Screen
- **Task Header**: Title, priority badge, status
- **Task Info**: Description, due date, assigned to, created by
- **Comments Section**: Add/view comments
- **Status Update**: Dropdown to change status
- **Action Buttons**: Edit, delete, mark complete

### Todos Screen
- **Todo List**: User's personal todos
- **Add Todo**: Quick input field at top
- **Todo Item**: Checkbox, title, due date, delete button
- **Filtering**: Show all, completed, pending

### Attendance Screen
- **Punch In/Out Button**: Large, prominent button
- **Today's Status**: Current punch status, time worked
- **Attendance History**: Last 7 days with punch times
- **Calendar View**: Monthly attendance overview

### Reports Screen
- **Charts**: Task completion rate, team performance
- **Metrics**: Total tasks, completed, pending, overdue
- **Date Range Picker**: Filter by date range
- **Export**: Download reports (if permitted)

---

## Key User Flows

### Flow 1: Login and Dashboard Access
1. User opens app → Login screen
2. Enters email/password → Authenticates with backend
3. Token stored locally → Redirected to Dashboard
4. Dashboard loads with user's data

### Flow 2: Create and Complete a Task
1. User taps "Create Task" button
2. Fills task form (title, description, priority, due date, assignee)
3. Submits → API call to backend
4. Returns to Tasks list
5. User finds task → Taps to open detail
6. Changes status to "completed" → Updates backend
7. Task removed from pending list

### Flow 3: Punch In/Out
1. User navigates to Attendance screen
2. Taps "Punch In" button → Records timestamp
3. Button changes to "Punch Out"
4. Later, user taps "Punch Out" → Records end time
5. Attendance record saved to backend
6. Duration calculated and displayed

### Flow 4: View Reports
1. User navigates to Reports screen
2. Selects date range using date picker
3. Charts load showing task metrics
4. User can filter by team member or department
5. Optionally exports report as PDF

---

## Color Scheme

### Primary Colors
- **Primary Blue**: `#0a7ea4` - Main actions, highlights, links
- **Success Green**: `#22C55E` - Completed tasks, success states
- **Warning Orange**: `#F59E0B` - Pending tasks, warnings
- **Error Red**: `#EF4444` - Overdue tasks, errors

### Neutral Colors
- **Background**: `#ffffff` (light) / `#151718` (dark)
- **Surface**: `#f5f5f5` (light) / `#1e2022` (dark)
- **Text**: `#11181C` (light) / `#ECEDEE` (dark)
- **Muted**: `#687076` (light) / `#9BA1A6` (dark)
- **Border**: `#E5E7EB` (light) / `#334155` (dark)

### Status-Specific Colors
- **Pending**: Orange (`#F59E0B`)
- **In Progress**: Blue (`#0a7ea4`)
- **Completed**: Green (`#22C55E`)
- **Overdue**: Red (`#EF4444`)

---

## Layout Specifications

### Tab Bar
- **Height**: 56px + safe area
- **Position**: Bottom
- **Tabs**: Dashboard, Tasks, Todos, Attendance, Profile
- **Icons**: SF Symbols mapped to Material Icons

### Safe Area Handling
- **Top**: Status bar + notch (iPhone X+)
- **Bottom**: Home indicator + tab bar
- **Left/Right**: Device bezels

### Typography
- **Heading 1**: 32px, bold, primary color
- **Heading 2**: 24px, semibold, foreground color
- **Body**: 16px, regular, foreground color
- **Caption**: 12px, regular, muted color
- **Button**: 16px, semibold, white text on primary

### Spacing
- **Padding**: 16px (standard), 12px (compact), 24px (generous)
- **Gap**: 12px (items), 16px (sections)
- **Radius**: 12px (standard), 8px (compact), 16px (large)

---

## Interaction Patterns

### Press Feedback
- **Buttons**: Scale 0.97 + light haptic feedback
- **List Items**: Opacity 0.7 on press
- **Icons**: Opacity 0.6 on press

### Loading States
- **Spinner**: Centered, with "Loading..." text
- **Skeleton**: Placeholder cards while data loads
- **Retry**: Error message with "Retry" button

### Notifications
- **Toast**: Bottom-right, auto-dismiss in 3 seconds
- **Alert**: Modal for critical confirmations
- **Badge**: Red dot for unread items

---

## Data Sync Strategy

### Authentication
- **Token Storage**: Secure storage using `expo-secure-store`
- **Token Refresh**: Automatic refresh before expiry
- **Logout**: Clear token and local data

### Offline Support
- **Local Cache**: AsyncStorage for essential data
- **Sync Queue**: Queue API calls made offline
- **Conflict Resolution**: Last-write-wins strategy

### API Integration
- **Base URL**: Environment variable (configurable)
- **Timeout**: 30 seconds
- **Retry**: 3 attempts with exponential backoff
- **Error Handling**: User-friendly error messages

---

## Accessibility Considerations
- **Contrast**: WCAG AA compliant (4.5:1 for text)
- **Touch Targets**: Minimum 44px for interactive elements
- **Text Size**: Scalable, respects system font size
- **Screen Reader**: Semantic labels for all interactive elements
- **Dark Mode**: Full support with automatic switching

---

## Performance Targets
- **First Load**: < 3 seconds
- **List Scroll**: 60 FPS
- **API Response**: < 2 seconds (95th percentile)
- **App Size**: < 50 MB

---

## Future Enhancements
- Push notifications for task updates
- Offline task creation with sync
- Biometric authentication (Face ID, Touch ID)
- Voice commands for quick actions
- Team chat integration
- Calendar integration with system calendar
