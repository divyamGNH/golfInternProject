import axios from "axios";
import { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Register from "./components/Register.jsx";
import Login from "./components/Login.jsx";
import DashboardFrame from "./components/DashboardFrame.jsx";
import UserEventsPage from "./components/UserEventsPage.jsx";
import UserRegistrationsPage from "./components/UserRegistrationsPage.jsx";
import UserPaymentsPage from "./components/UserPaymentsPage.jsx";
import AdminEventsPage from "./components/AdminEventsPage.jsx";
import AdminCreateEventPage from "./components/AdminCreateEventPage.jsx";
import AdminRegistrationsPage from "./components/AdminRegistrationsPage.jsx";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/auth/check`, { withCredentials: true })
      .then((res) => {
        setAuthUser(res.data?.user || null);
      })
      .catch(() => {
        setAuthUser(null);
      })
      .finally(() => {
        setIsAuthResolved(true);
      });
  }, []);

  if (!isAuthResolved) return <div>Loading...</div>;

  const isAuthenticated = Boolean(authUser?.userId);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? (
              <Navigate to="/home" />
            ) : (
              <Register setAuthUser={setAuthUser} />
            )
          }
        />
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/home" />
            ) : (
              <Login setAuthUser={setAuthUser} />
            )
          }
        />
        <Route path="/home" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            isAuthenticated ? (
              <DashboardFrame user={authUser} setAuthUser={setAuthUser} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route
            index
            element={
              authUser?.role === "admin" ? (
                <Navigate to="/dashboard/admin/events" replace />
              ) : (
                <Navigate to="/dashboard/events" replace />
              )
            }
          />

          <Route
            path="events"
            element={
              authUser?.role === "admin" ? (
                <Navigate to="/dashboard/admin/events" replace />
              ) : (
                <UserEventsPage />
              )
            }
          />
          <Route
            path="registrations"
            element={
              authUser?.role === "admin" ? (
                <Navigate to="/dashboard/admin/events" replace />
              ) : (
                <UserRegistrationsPage />
              )
            }
          />
          <Route
            path="payments"
            element={
              authUser?.role === "admin" ? (
                <Navigate to="/dashboard/admin/events" replace />
              ) : (
                <UserPaymentsPage />
              )
            }
          />

          <Route
            path="admin/events"
            element={
              authUser?.role === "admin" ? (
                <AdminEventsPage />
              ) : (
                <Navigate to="/dashboard/events" replace />
              )
            }
          />
          <Route
            path="admin/events/new"
            element={
              authUser?.role === "admin" ? (
                <AdminCreateEventPage />
              ) : (
                <Navigate to="/dashboard/events" replace />
              )
            }
          />
          <Route
            path="admin/events/:eventId/registrations"
            element={
              authUser?.role === "admin" ? (
                <AdminRegistrationsPage />
              ) : (
                <Navigate to="/dashboard/events" replace />
              )
            }
          />
        </Route>
        <Route
          path="*"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
