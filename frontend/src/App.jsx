// src/App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Layout from "./components/Layout";
import AuthMiddleware from "./middleware/authMiddleware_frontend";
import GuestMiddleware from "./middleware/GuestMiddleware";

import { ProgressProvider } from "./context/ProgressCenter";
import ProgressTray from "./components/ProgressTray";

// Public pages
import Register from "./pages/Register";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import AuthAction from "./pages/AuthAction";

// User pages (protected)
import HomePage from "./pages/HomePage";
import Profile from "./pages/Profile";
import ManageMice from "./pages/ManageMice";
import CreateMouse from "./pages/CreateMouse";
import EditMouse from "./pages/EditMouse";
import DailyRecord from "./pages/DailyRecord";
import EditDailyRecord from "./pages/EditDailyRecord";
import MouseDetail from "./pages/MouseDetail";
import CreateTest from "./pages/CreateTest";
import ManageTest from "./pages/ManageTest";
import EditVideo from "./pages/EditVideo";

// Admin
import AdminRoutes from "./components/AdminRoutes";
import AdminUsers from "./pages/AdminUsers";
import TestDetail from "./pages/TestDetail";

export default function App() {
  return (
    <Router>
      <ProgressProvider>
        <Routes>
          {/* ---------- Public routes ---------- */}
          <Route
            path="/login"
            element={
              <GuestMiddleware>
                <Login />
              </GuestMiddleware>
            }
          />
          <Route
            path="/register"
            element={
              <GuestMiddleware>
                <Register />
              </GuestMiddleware>
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ลิงก์ยืนยันอีเมล/รีเซ็ตรหัสผ่านจาก Firebase */}
          <Route path="/auth/action" element={<AuthAction />} />

          {/* ---------- Protected routes (requires login) ---------- */}
          <Route
            path="/"
            element={
              <AuthMiddleware>
                <Layout />
              </AuthMiddleware>
            }
          >
            {/* ผู้ใช้ทั่วไป */}
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="manage-mice" element={<ManageMice />} />
            <Route path="create-mouse" element={<CreateMouse />} />
            <Route path="edit-mouse/:id" element={<EditMouse />} />
            <Route path="mouse/:id/daily-record" element={<DailyRecord />} />
            <Route path="mouse/:id" element={<MouseDetail />} />
            <Route path="manage-test" element={<ManageTest />} />
            <Route path="create-test" element={<CreateTest />} />
            <Route path="edit-video/:testId" element={<EditVideo />} />
            <Route path="tests/:id" element={<TestDetail />} />
            <Route
              path="edit-record/:mouseId/:recordId"
              element={<EditDailyRecord />}
            />

            {/* แอดมินเท่านั้น */}
            <Route
              path="admin/users"
              element={
                <AdminRoutes>
                  <AdminUsers />
                </AdminRoutes>
              }
            />
          </Route>

          {/* ---------- Fallback ---------- */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Global async progress / toasts */}
        <ProgressTray />
      </ProgressProvider>
    </Router>
  );
}
