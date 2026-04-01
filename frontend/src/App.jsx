import axios from "axios";
import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Register from "./components/Register.jsx";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Admin from "./components/Admin.jsx";
import Home from "./components/Home.jsx";
import Lottery from "./components/Lottery.jsx";

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);

  useEffect(() => {
    axios
      .get("http://localhost:3000/api/auth/check", { withCredentials: true })
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
  const isAdmin = authUser?.role === "admin";
  const defaultPrivateRoute = isAdmin ? "/admin" : "/dashboard";

  return (
    <Router>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to={defaultPrivateRoute} /> : <Navigate to="/login" />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to={defaultPrivateRoute} /> : <Register />} />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to={defaultPrivateRoute} /> : <Login setAuthUser={setAuthUser} />}
        />
        <Route
          path="/dashboard"
          element={isAuthenticated ? <Dashboard user={authUser} /> : <Navigate to="/login" />}
        />
        <Route
          path="/home"
          element={isAuthenticated ? <Home user={authUser} /> : <Navigate to="/login" />}
        />
        <Route
          path="/admin"
          element={isAuthenticated && isAdmin ? <Admin user={authUser} /> : <Navigate to="/dashboard" />}
        />
        <Route
          path="/lottery"
          element={isAuthenticated ? <Lottery /> : <Navigate to="/login" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
