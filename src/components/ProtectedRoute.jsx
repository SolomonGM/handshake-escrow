import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from '../utils/toast';
import LoadingState from './LoadingState';

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
      <LoadingState
        variant="page"
        label="Checking session"
        detail="Verifying your Handshake access."
      />
    );
  }

  if (!isAuthenticated) {
    // This redirects to home page where they can use the auth modal.
    return <Navigate to="/" replace />;
  }

  return children;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ProtectedRoute;
