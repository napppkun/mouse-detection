import { Navigate, Outlet } from "react-router-dom";

const AuthMiddleware = ({ children }) => {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children || <Outlet />;
};

export default AuthMiddleware;