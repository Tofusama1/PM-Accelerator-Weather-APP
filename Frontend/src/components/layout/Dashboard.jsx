// pages/Dashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from "../../services/api";
import CreateRecordModal from '../records/CreateRecordModal';
import EditRecordModal from '../records/editRecordModal';
import DeleteRecordModal from '../records/deleterecordmodal';
import RecordDetails from '../records/RecordDetails';
import WeatherCard from '../weather/WeatherCard';

const Dashboard = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [showRecordDetails, setShowRecordDetails] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  
  // User state
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // Load user data on component mount
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const fetchRecords = useCallback(async (page = 1, limit = recordsPerPage) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/weather-records?page=${page}&limit=${limit}`);
      console.log('API Response:', response);
      
      // Handle paginated response structure
      if (response && response.records) {
        setRecords(response.records);
        if (response.pagination) {
          setCurrentPage(response.pagination.page);
          setTotalPages(response.pagination.pages);
          setTotalRecords(response.pagination.total);
        }
      } else if (Array.isArray(response)) {
        // Fallback for non-paginated response
        setRecords(response);
        setTotalPages(1);
        setTotalRecords(response.length);
      } else if (response && Array.isArray(response.data)) {
        setRecords(response.data);
        setTotalPages(1);
        setTotalRecords(response.data.length);
      }
    } catch (err) {
      console.error('Fetch records error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch records');
    } finally {
      setLoading(false);
    }
  }, [ recordsPerPage]); // Include dependencies that fetchRecords uses

  useEffect(() => {
    fetchRecords(currentPage, recordsPerPage);
  }, [currentPage, recordsPerPage, fetchRecords]);

  const handleCreateSuccess = (data) => {
    console.log('handleCreateSuccess called with:', data);
    
    let newRecord = null;
    if (data && data.record) {
      newRecord = data.record;
    } else if (data && data.id) {
      newRecord = data;
    }
    
    if (newRecord) {
      // If we're on the first page, add the new record to the beginning
      if (currentPage === 1) {
        setRecords(prev => [newRecord, ...prev.slice(0, recordsPerPage - 1)]);
      }
      // Refresh to get accurate pagination
      fetchRecords(currentPage, recordsPerPage);
      setShowCreateModal(false);
    } else {
      console.error('Invalid data structure passed to handleCreateSuccess:', data);
      setError('Failed to add new record - invalid response format');
    }
  };

  const handleEditSuccess = (data) => {
    console.log('handleEditSuccess called with:', data);
    
    let updatedRecord = null;
    if (data && data.record) {
      updatedRecord = data.record;
    } else if (data && data.id) {
      updatedRecord = data;
    }
    
    if (updatedRecord) {
      setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      setShowEditModal(false);
      setSelectedRecord(null);
      
      if (selectedRecord && selectedRecord.id === updatedRecord.id) {
        setSelectedRecord(updatedRecord);
      }
    } else {
      console.error('Invalid data structure passed to handleEditSuccess:', data);
      setError('Failed to update record - invalid response format');
    }
  };

  const handleDeleteSuccess = (deletedId) => {
    console.log('handleDeleteSuccess called with ID:', deletedId);
    
    setRecords(prev => prev.filter(r => r.id !== deletedId));
    setShowDeleteModal(false);
    setSelectedRecordId(null);
    
    if (selectedRecord && selectedRecord.id === deletedId) {
      setSelectedRecord(null);
      setShowRecordDetails(false);
    }
    
    // Refresh pagination after delete
    fetchRecords(currentPage, recordsPerPage);
  };

  const handleViewRecord = (record) => {
    setSelectedRecord(record);
    setShowRecordDetails(true);
  };

  const handleEditRecord = (record) => {
    setSelectedRecord(record);
    setShowEditModal(true);
  };

  const handleDeleteRecord = (recordId) => {
    setSelectedRecordId(recordId);
    setShowDeleteModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setSelectedRecord(null);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setSelectedRecordId(null);
  };

  const handleCloseRecordDetails = () => {
    setShowRecordDetails(false);
    setSelectedRecord(null);
  };

  const refreshRecords = () => {
    fetchRecords(currentPage, recordsPerPage);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleRecordsPerPageChange = (newLimit) => {
    setRecordsPerPage(newLimit);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const handleLogout = () => {
    // Clear stored user data and token
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirect to login page
    navigate('/login');
  };

  // Pagination component
  const Pagination = () => {
    const getVisiblePageNumbers = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];

      for (let i = Math.max(2, currentPage - delta); 
           i <= Math.min(totalPages - 1, currentPage + delta); 
           i++) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, '...');
      } else {
        rangeWithDots.push(1);
      }

      rangeWithDots.push(...range);

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push('...', totalPages);
      } else if (totalPages > 1) {
        rangeWithDots.push(totalPages);
      }

      return rangeWithDots;
    };

    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing{' '}
              <span className="font-medium">{Math.min((currentPage - 1) * recordsPerPage + 1, totalRecords)}</span>{' '}
              to{' '}
              <span className="font-medium">{Math.min(currentPage * recordsPerPage, totalRecords)}</span>{' '}
              of{' '}
              <span className="font-medium">{totalRecords}</span>{' '}
              results
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={recordsPerPage}
              onChange={(e) => handleRecordsPerPageChange(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Previous</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                </svg>
              </button>
              
              {getVisiblePageNumbers().map((pageNum, index) => (
                <React.Fragment key={index}>
                  {pageNum === '...' ? (
                    <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0">
                      ...
                    </span>
                  ) : (
                    <button
                      onClick={() => handlePageChange(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-900'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )}
                </React.Fragment>
              ))}
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Next</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header with user info and logout */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Weather Records Dashboard</h1>
          <p className="text-gray-600">Manage and view your weather data records</p>
          {user && (
            <p className="text-sm text-gray-500 mt-1">Welcome back, {user.username}!</p>
          )}
        </div>
        
        {/* User menu */}
        <div className="flex items-center space-x-4">
          {user && (
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user.username}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={() => setError('')}
                className="inline-flex text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          + New Weather Record
        </button>
        <button 
          onClick={refreshRecords}
          disabled={loading}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading weather records...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3m0 0h8m-8 0H5a1 1 0 00-1 1v3m1-4h8" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No weather records found</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first weather record.</p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Create First Record
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {records.map(record => (
              <WeatherCard
                key={record.id}
                data={record}
                onView={() => handleViewRecord(record)}
                onEdit={() => handleEditRecord(record)}
                onDelete={() => handleDeleteRecord(record.id)}
              />
            ))}
          </div>
          
          {/* Pagination */}
          <Pagination />
        </>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateRecordModal
          show={showCreateModal}
          onClose={handleCloseCreateModal}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showEditModal && selectedRecord && (
        <EditRecordModal
          show={showEditModal}
          record={selectedRecord}
          onClose={handleCloseEditModal}
          onSuccess={handleEditSuccess}
        />
      )}

      {showDeleteModal && selectedRecordId && (
        <DeleteRecordModal
          show={showDeleteModal}
          recordId={selectedRecordId}
          onClose={handleCloseDeleteModal}
          onSuccess={handleDeleteSuccess}
        />
      )}

      {showRecordDetails && selectedRecord && (
        <RecordDetails 
          record={selectedRecord}
          onClose={handleCloseRecordDetails}
          onEdit={() => {
            setShowRecordDetails(false);
            handleEditRecord(selectedRecord);
          }}
          onDelete={() => {
            setShowRecordDetails(false);
            handleDeleteRecord(selectedRecord.id);
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;