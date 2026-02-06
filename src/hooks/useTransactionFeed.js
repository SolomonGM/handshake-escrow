import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import socketService from '../services/socket';

const API_URL = 'http://localhost:5001/api';

const useTransactionFeed = ({
  includePlaceholders = false,
  minItems = 0,
  limit = 20
} = {}) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/transactions/recent`, {
        params: {
          limit,
          includePlaceholders,
          minItems
        }
      });
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching recent transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [includePlaceholders, limit, minItems]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    socketService.connect();

    const handleTransactionCompleted = () => {
      fetchTransactions();
    };

    socketService.on('transaction_completed', handleTransactionCompleted);

    return () => {
      if (socketService.socket) {
        socketService.socket.off('transaction_completed', handleTransactionCompleted);
      }
    };
  }, [fetchTransactions]);

  return { transactions, loading, refresh: fetchTransactions };
};

export default useTransactionFeed;
