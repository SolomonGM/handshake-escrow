import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const hasNotified = useRef(false);

  useEffect(() => {
    if (!loading && !isAuthenticated && !hasNotified.current) {
      toast.error('Please sign in to access that page.');
      hasNotified.current = true;
    }
  }, [loading, isAuthenticated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-color-1"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to home page where they can use the auth modal
    return <Navigate to="/" replace />;
  }

  return children;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ProtectedRoute;
