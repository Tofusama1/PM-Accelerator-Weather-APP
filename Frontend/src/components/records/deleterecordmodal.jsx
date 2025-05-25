// src/components/records/DeleteRecordModal.jsx
import React, { useState } from 'react';
import api from '../../services/api';
import { Loader } from 'lucide-react';

const DeleteRecordModal = ({ show, recordId, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await api(`/api/weather-records/${recordId}`, {
        method: 'DELETE',
      });
      onSuccess(recordId);
      onClose();
    } catch {
      setError('Failed to delete record.');
    } finally {
      setLoading(false);
    }
  };

  if (!show || !recordId) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Delete Weather Record</h2>
        {error && <p className="error">{error}</p>}
        <p>Are you sure you want to delete this record?</p>
        <div className="modal-actions">
          <button onClick={handleDelete} disabled={loading} className="bg-red-600 text-white px-4 py-2 rounded">
            {loading ? <Loader className="animate-spin" size={16} /> : 'Yes, Delete'}
          </button>
          <button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default DeleteRecordModal;
