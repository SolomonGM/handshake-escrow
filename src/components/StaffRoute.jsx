import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const StaffRoute = ({ children, requireDeveloper = false }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-color-1" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const isDeveloper = user?.rank === 'developer';
  const isStaff = isDeveloper || user?.role === 'admin' || user?.role === 'moderator';

  if (requireDeveloper ? !isDeveloper : !isStaff) {
    return <Navigate to="/settings" replace />;
  }

  return children;
};

StaffRoute.propTypes = {
  children: PropTypes.node.isRequired,
  requireDeveloper: PropTypes.bool
};

export default StaffRoute;
