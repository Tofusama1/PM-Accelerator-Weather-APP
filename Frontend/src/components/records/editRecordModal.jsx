import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { AlertCircle, Loader } from 'lucide-react';

const EditRecordModal = ({ show, record, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    location: '',
    startDate: '',
    endDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (record) {
      setFormData({
        location: record.location,
        startDate: record.start_date,
        endDate: record.end_date,
      });
    }
  }, [record]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // FIXED: Added /api/ prefix to match backend routes
      const response = await api.put(`/api/weather-records/${record.id}`, formData);
      onSuccess(response.data); // Axios wraps the result inside `.data`
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!show || !record) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h2>Edit Weather Record</h2>
        {error && <div className="error"><AlertCircle /> {error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="Location"
            required
          />
          <input
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
          />
          <input
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? <Loader className="animate-spin" size={16} /> : 'Update'}
          </button>
          <button type="button" onClick={onClose}>Cancel</button>
        </form>
      </div>
    </div>
  );
};

export default EditRecordModal;