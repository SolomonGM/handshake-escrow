import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingState from './LoadingState';

const StaffRoute = ({ children, requireDeveloper = false }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <LoadingState
        variant="page"
        label="Checking staff access"
        detail="Verifying your console permissions."
      />
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
